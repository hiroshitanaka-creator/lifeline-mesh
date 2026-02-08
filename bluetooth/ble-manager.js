/**
 * Lifeline Mesh - Bluetooth BLE Manager
 *
 * Manages Bluetooth Low Energy connections for peer-to-peer
 * encrypted message exchange.
 *
 * Browser Support:
 * - Chrome/Edge (Desktop & Android): Full support
 * - Safari: Limited support (experimental)
 * - Firefox: Not supported
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API
 */

import {
  SERVICE_UUID,
  CHARACTERISTICS,
  MSG_TYPE,
  CONFIG,
  BLE_ERROR
} from "./constants.js";

/**
 * BLE Manager for Lifeline Mesh
 */
export class BLEManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;

    // Callbacks
    this.onMessageReceived = null;
    this.onConnectionChange = null;
    this.onError = null;

    // Message reassembly buffer
    this.reassemblyBuffer = null;
    this.expectedChunks = 0;

    // Connection state
    this.isConnected = false;
  }

  /**
   * Check if Web Bluetooth is supported
   * @returns {boolean}
   */
  static isSupported() {
    return "bluetooth" in navigator;
  }

  /**
   * Get detailed support information
   * @returns {Object}
   */
  static getSupportInfo() {
    const ua = navigator.userAgent;
    return {
      supported: BLEManager.isSupported(),
      browser: {
        isChrome: /Chrome/.test(ua) && !/Edge/.test(ua),
        isEdge: /Edg/.test(ua),
        isFirefox: /Firefox/.test(ua),
        isSafari: /Safari/.test(ua) && !/Chrome/.test(ua)
      },
      platform: {
        isAndroid: /Android/.test(ua),
        isIOS: /iPhone|iPad|iPod/.test(ua),
        isWindows: /Windows/.test(ua),
        isMac: /Macintosh/.test(ua),
        isLinux: /Linux/.test(ua) && !/Android/.test(ua)
      },
      recommendation: BLEManager.isSupported()
        ? "Web Bluetooth is supported!"
        : "Please use Chrome or Edge for Bluetooth support."
    };
  }

  /**
   * Scan for nearby Lifeline Mesh devices
   * @returns {Promise<BluetoothDevice>}
   */
  async scan() {
    if (!BLEManager.isSupported()) {
      throw new Error(BLE_ERROR.NOT_SUPPORTED);
    }

    try {
      // Request device with our service UUID
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });

      // Listen for disconnection
      this.device.addEventListener("gattserverdisconnected", () => {
        this._handleDisconnect();
      });

      return this.device;
    } catch (error) {
      if (error.name === "NotFoundError") {
        throw new Error(BLE_ERROR.DEVICE_NOT_FOUND);
      }
      if (error.name === "SecurityError") {
        throw new Error(BLE_ERROR.PERMISSION_DENIED);
      }
      throw error;
    }
  }

  /**
   * Connect to a device
   * @param {BluetoothDevice} [device] - Device to connect (uses last scanned if not provided)
   * @returns {Promise<void>}
   */
  async connect(device = this.device) {
    if (!device) {
      throw new Error("No device to connect to. Call scan() first.");
    }

    try {
      // Connect to GATT server
      this.server = await device.gatt.connect();

      // Get our service
      this.service = await this.server.getPrimaryService(SERVICE_UUID);

      // Get characteristics
      this.txCharacteristic = await this.service.getCharacteristic(
        CHARACTERISTICS.MESSAGE_TX
      );

      this.rxCharacteristic = await this.service.getCharacteristic(
        CHARACTERISTICS.MESSAGE_RX
      );

      // Subscribe to notifications
      await this.rxCharacteristic.startNotifications();
      this.rxCharacteristic.addEventListener(
        "characteristicvaluechanged",
        (event) => this._handleIncomingData(event)
      );

      this.isConnected = true;
      this.device = device;

      if (this.onConnectionChange) {
        this.onConnectionChange(true, device);
      }

      console.log("[BLE] Connected to", device.name || device.id);
    } catch (error) {
      console.error("[BLE] Connection failed:", error);
      throw new Error(BLE_ERROR.CONNECTION_FAILED);
    }
  }

  /**
   * Disconnect from current device
   */
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._handleDisconnect();
  }

  /**
   * Send a message to connected peer
   * @param {Object} message - Lifeline Mesh encrypted message object
   * @returns {Promise<void>}
   */
  async sendMessage(message) {
    if (!this.isConnected || !this.txCharacteristic) {
      throw new Error(BLE_ERROR.DISCONNECTED);
    }

    try {
      // Serialize message to JSON
      const jsonStr = JSON.stringify(message);
      const messageBytes = new TextEncoder().encode(jsonStr);

      // Check size
      if (messageBytes.length > 150 * 1024) {
        throw new Error("Message too large (max 150KB)");
      }

      // Chunk the message
      const chunks = this._chunkData(messageBytes);

      console.log(`[BLE] Sending message in ${chunks.length} chunk(s)`);

      // Send each chunk
      for (let i = 0; i < chunks.length; i++) {
        const header = new Uint8Array([
          MSG_TYPE.DIRECT,
          i, // Chunk index
          chunks.length, // Total chunks
          0 // Reserved
        ]);

        const packet = new Uint8Array(header.length + chunks[i].length);
        packet.set(header, 0);
        packet.set(chunks[i], header.length);

        await this.txCharacteristic.writeValue(packet);

        // Small delay between chunks
        if (i < chunks.length - 1) {
          await this._delay(CONFIG.CHUNK_DELAY_MS);
        }
      }

      console.log("[BLE] Message sent successfully");
    } catch (error) {
      console.error("[BLE] Send failed:", error);
      throw new Error(BLE_ERROR.SEND_FAILED);
    }
  }

  /**
   * Send identity to connected peer
   * @param {Object} identity - Public identity object
   * @returns {Promise<void>}
   */
  async sendIdentity(identity) {
    if (!this.isConnected || !this.txCharacteristic) {
      throw new Error(BLE_ERROR.DISCONNECTED);
    }

    const jsonStr = JSON.stringify(identity);
    const identityBytes = new TextEncoder().encode(jsonStr);

    const header = new Uint8Array([
      MSG_TYPE.IDENTITY,
      0, // Single chunk
      1, // Total: 1
      0 // Reserved
    ]);

    const packet = new Uint8Array(header.length + identityBytes.length);
    packet.set(header, 0);
    packet.set(identityBytes, header.length);

    await this.txCharacteristic.writeValue(packet);
    console.log("[BLE] Identity sent");
  }

  // ============ Private Methods ============

  /**
   * Handle incoming data from characteristic
   * @private
   */
  _handleIncomingData(event) {
    try {
      const dataView = event.target.value;

      // Parse header
      const msgType = dataView.getUint8(0);
      const chunkIndex = dataView.getUint8(1);
      const totalChunks = dataView.getUint8(2);
      // Reserved byte at index 3

      // Extract payload
      const payload = new Uint8Array(dataView.buffer.slice(4));

      console.log(
        `[BLE] Received chunk ${chunkIndex + 1}/${totalChunks}, type: ${msgType}`
      );

      // Initialize reassembly buffer if this is first chunk
      if (chunkIndex === 0) {
        this.reassemblyBuffer = new Array(totalChunks);
        this.expectedChunks = totalChunks;
      }

      // Store chunk
      if (this.reassemblyBuffer) {
        this.reassemblyBuffer[chunkIndex] = payload;
      }

      // Check if we have all chunks
      const receivedCount = this.reassemblyBuffer
        ? this.reassemblyBuffer.filter(Boolean).length
        : 0;

      if (receivedCount === this.expectedChunks) {
        // Reassemble complete message
        const completeData = this._reassembleChunks(this.reassemblyBuffer);
        this.reassemblyBuffer = null;
        this.expectedChunks = 0;

        // Parse JSON
        const jsonStr = new TextDecoder().decode(completeData);
        const message = JSON.parse(jsonStr);

        console.log("[BLE] Message reassembled, type:", msgType);

        // Dispatch to callback
        if (this.onMessageReceived) {
          this.onMessageReceived(message, msgType);
        }
      }
    } catch (error) {
      console.error("[BLE] Error processing incoming data:", error);
      if (this.onError) {
        this.onError(BLE_ERROR.RECEIVE_FAILED, error);
      }
    }
  }

  /**
   * Handle disconnection
   * @private
   */
  _handleDisconnect() {
    console.log("[BLE] Disconnected");
    this.isConnected = false;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;
    this.reassemblyBuffer = null;

    if (this.onConnectionChange) {
      this.onConnectionChange(false, this.device);
    }
  }

  /**
   * Chunk data into smaller pieces
   * @private
   */
  _chunkData(data) {
    const chunks = [];
    for (let i = 0; i < data.length; i += CONFIG.CHUNK_SIZE) {
      chunks.push(data.slice(i, i + CONFIG.CHUNK_SIZE));
    }
    return chunks;
  }

  /**
   * Reassemble chunks into complete data
   * @private
   */
  _reassembleChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  }

  /**
   * Delay helper
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default BLEManager;
