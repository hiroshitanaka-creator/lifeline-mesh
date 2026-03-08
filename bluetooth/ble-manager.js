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

import {
  addToOutbox,
  addToInbox,
  getPendingOutbox,
  removeFromOutbox,
  updateOutboxStatus,
  DELIVERY_STATUS
} from "../crypto/store.js";

/**
 * BLE Manager for Lifeline Mesh
 */
export class BLEManager {
  constructor(options = {}) {
    const { io = BLEManager.createBrowserIO() } = options;

    this.device = null;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;

    // Callbacks
    this.onMessageReceived = null;
    this.onConnectionChange = null;
    this.onError = null;

    // Receive state by message transfer id
    this.receiveStates = new Map();

    // Outbound tracking
    this.pendingAcks = new Map();
    this.outboxFlushPromise = null;

    // Connection state
    this.isConnected = false;

    // I/O boundary (Web Bluetooth adapter)
    this.io = io;
  }

  static createBrowserIO() {
    return {
      hasBluetooth: () => typeof navigator !== "undefined" && "bluetooth" in navigator,
      requestDevice: (requestOptions) => navigator.bluetooth.requestDevice(requestOptions),
      connectGatt: (device) => device.gatt.connect(),
      getPrimaryService: (server, uuid) => server.getPrimaryService(uuid),
      getCharacteristic: (service, uuid) => service.getCharacteristic(uuid),
      startNotifications: (characteristic) => characteristic.startNotifications(),
      addCharacteristicListener: (characteristic, eventName, handler) =>
        characteristic.addEventListener(eventName, handler),
      addDisconnectListener: (device, handler) =>
        device.addEventListener("gattserverdisconnected", handler),
      disconnectGatt: (device) => device.gatt.disconnect()
    };
  }

  /**
   * Check if Web Bluetooth is supported
   * @returns {boolean}
   */
  static isSupported() {
    return BLEManager.createBrowserIO().hasBluetooth();
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
    if (!this.io.hasBluetooth()) {
      throw new Error(BLE_ERROR.NOT_SUPPORTED);
    }

    try {
      this.device = await this.io.requestDevice({
        filters: [{ services: [SERVICE_UUID] }],
        optionalServices: [SERVICE_UUID]
      });

      this.io.addDisconnectListener(this.device, () => {
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
      this.server = await this.io.connectGatt(device);
      this.service = await this.io.getPrimaryService(this.server, SERVICE_UUID);

      this.txCharacteristic = await this.io.getCharacteristic(
        this.service,
        CHARACTERISTICS.MESSAGE_TX
      );

      this.rxCharacteristic = await this.io.getCharacteristic(
        this.service,
        CHARACTERISTICS.MESSAGE_RX
      );

      await this.io.startNotifications(this.rxCharacteristic);
      this.io.addCharacteristicListener(
        this.rxCharacteristic,
        "characteristicvaluechanged",
        (event) => this._handleIncomingData(event)
      );

      this.isConnected = true;
      this.device = device;

      if (this.onConnectionChange) {
        this.onConnectionChange(true, device);
      }

      await this.flushOutbox();

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
      this.io.disconnectGatt(this.device);
    }
    this._handleDisconnect();
  }

  /**
   * Send a message to connected peer
   * @param {Object} message - Lifeline Mesh encrypted message object
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  async sendMessage(message, options = {}) {
    const recipientFp = options.recipientFp || message.rcpt || "unknown";

    await addToOutbox(message, recipientFp, {
      transport: "ble",
      status: DELIVERY_STATUS.PENDING
    });

    if (!this.isConnected || !this.txCharacteristic) {
      console.warn("[BLE] Offline, queued message in outbox", message.msgId);
      return;
    }

    await this._sendQueuedEntry({
      msgId: message.msgId,
      message,
      attempts: 0
    });
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

    const payload = new TextEncoder().encode(JSON.stringify(identity));
    await this._writePacket(MSG_TYPE.IDENTITY, 0, 1, 0, payload);
    console.log("[BLE] Identity sent");
  }

  /**
   * Flush pending outbox messages when connected
   */
  async flushOutbox() {
    if (this.outboxFlushPromise) {
      return this.outboxFlushPromise;
    }

    this.outboxFlushPromise = (async () => {
      if (!this.isConnected || !this.txCharacteristic) {
        return;
      }

      const pending = await getPendingOutbox();
      for (const entry of pending) {
        if (entry.transport && entry.transport !== "ble") {
          continue;
        }
        await this._sendQueuedEntry(entry);
      }
    })();

    try {
      await this.outboxFlushPromise;
    } finally {
      this.outboxFlushPromise = null;
    }
  }

  // ============ Private Methods ============

  async _sendQueuedEntry(entry) {
    const msgId = entry.msgId;

    try {
      await updateOutboxStatus(msgId, DELIVERY_STATUS.PENDING, {
        transport: "ble",
        error: null
      });
      await this._sendMessageWithAck(entry.message);
      await updateOutboxStatus(msgId, DELIVERY_STATUS.DELIVERED, {
        deliveredAt: Date.now()
      });
      await removeFromOutbox(msgId);
    } catch (error) {
      const attempts = (entry.attempts || 0) + 1;
      const finalStatus = attempts >= CONFIG.RETRY_COUNT
        ? DELIVERY_STATUS.FAILED
        : DELIVERY_STATUS.PENDING;

      await updateOutboxStatus(msgId, finalStatus, {
        transport: "ble",
        error: error.message
      });

      if (!this.isConnected) {
        console.warn("[BLE] Message kept in outbox due to disconnect", msgId);
        return;
      }

      if (attempts >= CONFIG.RETRY_COUNT) {
        console.error("[BLE] Message delivery failed after retries", msgId);
        throw new Error(BLE_ERROR.SEND_FAILED);
      }

      await this._delay(CONFIG.RETRY_DELAY_MS);
      await this._sendQueuedEntry({ ...entry, attempts });
    }
  }

  async _sendMessageWithAck(message) {
    if (!this.isConnected || !this.txCharacteristic) {
      throw new Error(BLE_ERROR.DISCONNECTED);
    }

    const messageBytes = new TextEncoder().encode(JSON.stringify(message));

    if (messageBytes.length > 150 * 1024) {
      throw new Error("Message too large (max 150KB)");
    }

    const chunks = this._chunkData(messageBytes);
    const transferId = this._getTransferId(message);

    console.log(`[BLE] Sending message ${transferId} in ${chunks.length} chunk(s)`);

    for (let i = 0; i < chunks.length; i++) {
      const framedPayload = this._encodeChunkPayload(transferId, chunks[i]);
      await this._writePacket(MSG_TYPE.DIRECT, i, chunks.length, 0, framedPayload);
      if (i < chunks.length - 1) {
        await this._delay(CONFIG.CHUNK_DELAY_MS);
      }
    }

    await this._waitForAck(transferId);
    console.log("[BLE] Message sent and ACK received", transferId);
  }

  _waitForAck(transferId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(transferId);
        reject(new Error(`ACK timeout for ${transferId}`));
      }, CONFIG.ACK_TIMEOUT_MS);

      this.pendingAcks.set(transferId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  async _writePacket(msgType, chunkIndex, totalChunks, reserved, payload) {
    const header = new Uint8Array([msgType, chunkIndex, totalChunks, reserved]);
    const packet = new Uint8Array(header.length + payload.length);
    packet.set(header, 0);
    packet.set(payload, header.length);
    await this.txCharacteristic.writeValue(packet);
  }

  /**
   * Handle incoming data from characteristic
   * @private
   */
  async _handleIncomingData(event) {
    try {
      const dataView = event.target.value;

      const msgType = dataView.getUint8(0);
      const chunkIndex = dataView.getUint8(1);
      const totalChunks = dataView.getUint8(2);
      const payload = new Uint8Array(dataView.buffer.slice(4));

      if (msgType === MSG_TYPE.ACK) {
        const ackId = new TextDecoder().decode(payload);
        this._resolveAck(ackId);
        return;
      }

      const decoded = this._decodeChunkPayload(payload);
      const state = this._getOrCreateReceiveState(msgType, totalChunks, decoded.transferId);

      if (chunkIndex >= state.totalChunks) {
        throw new Error(`Chunk index out of range: ${chunkIndex}/${state.totalChunks}`);
      }

      if (state.chunks[chunkIndex]) {
        state.duplicates += 1;
        console.log("[BLE] Duplicate chunk ignored", chunkIndex, state.transferId);
        return;
      }

      state.chunks[chunkIndex] = decoded.data;
      state.receivedCount += 1;
      state.lastUpdated = Date.now();

      if (state.receivedCount !== state.totalChunks) {
        return;
      }

      const completeData = this._reassembleChunks(state.chunks);
      this.receiveStates.delete(state.transferId);

      const jsonStr = new TextDecoder().decode(completeData);
      const message = JSON.parse(jsonStr);

      await addToInbox(
        {
          msgId: message.msgId || state.transferId,
          senderFp: message.sndr || "unknown",
          content: message,
          type: message.kind || "ble",
          payload: message,
          ts: message.ts || Date.now()
        },
        message
      );

      await this._sendAck(state.transferId);

      if (this.onMessageReceived) {
        this.onMessageReceived(message, msgType);
      }
    } catch (error) {
      console.error("[BLE] Error processing incoming data:", error);
      if (this.onError) {
        this.onError(BLE_ERROR.RECEIVE_FAILED, error);
      }
    }
  }

  _getOrCreateReceiveState(msgType, totalChunks, transferId) {
    this._cleanupExpiredReceiveStates();

    const existing = this.receiveStates.get(transferId);

    if (existing) {
      if (existing.totalChunks !== totalChunks) {
        throw new Error(`Mismatched totalChunks for ${transferId}`);
      }
      return existing;
    }

    const state = {
      transferId,
      msgType,
      totalChunks,
      chunks: new Array(totalChunks).fill(null),
      receivedCount: 0,
      duplicates: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    this.receiveStates.set(transferId, state);
    return state;
  }

  _encodeChunkPayload(transferId, chunkData) {
    const envelope = {
      transferId,
      data: this._toBase64(chunkData)
    };
    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  _decodeChunkPayload(payload) {
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    if (!parsed.transferId || !parsed.data) {
      throw new Error("Invalid chunk envelope");
    }

    return {
      transferId: parsed.transferId,
      data: this._fromBase64(parsed.data)
    };
  }

  _toBase64(data) {
    let binary = "";
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  _fromBase64(base64) {
    const binary = atob(base64);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }

  _getTransferId(message) {
    if (!message || typeof message !== "object") {
      return `anonymous-${Date.now()}`;
    }
    return message.msgId || `${message.kind || "msg"}:${message.ts || Date.now()}`;
  }

  _resolveAck(ackId) {
    const pending = this.pendingAcks.get(ackId);
    if (!pending) {
      console.log("[BLE] ACK received for unknown transfer", ackId);
      return;
    }

    this.pendingAcks.delete(ackId);
    pending.resolve();
  }

  async _sendAck(transferId) {
    if (!this.txCharacteristic) {
      return;
    }

    const payload = new TextEncoder().encode(transferId);
    await this._writePacket(MSG_TYPE.ACK, 0, 1, 0, payload);
  }

  _cleanupExpiredReceiveStates() {
    const now = Date.now();
    for (const [transferId, state] of this.receiveStates.entries()) {
      if (now - state.lastUpdated > CONFIG.REASSEMBLY_TIMEOUT_MS) {
        console.warn("[BLE] Dropping stale receive state", transferId);
        this.receiveStates.delete(transferId);
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
    this.receiveStates.clear();

    for (const [transferId] of this.pendingAcks) {
      this.pendingAcks.delete(transferId);
    }

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
    const missing = [];
    for (let i = 0; i < chunks.length; i++) {
      if (!chunks[i]) {
        missing.push(i);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Cannot reassemble, missing chunks: ${missing.join(",")}`);
    }

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
