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
  checkAndMarkSeen,
  DELIVERY_STATUS,
  OUTBOX_RETRY_INTERVAL_MS
} from "../crypto/store.js";

/**
 * BLE Manager for Lifeline Mesh
 */
export class BLEManager {
  constructor(options = {}) {
    const {
      io = BLEManager.createBrowserIO(),
      protocolConfig = {},
      store = BLEManager.createStoreAdapter(),
      transportManager = null,
      router = null
    } = options;

    this.device = null;
    this.server = null;
    this.service = null;
    this.txCharacteristic = null;
    this.rxCharacteristic = null;

    // Callbacks
    this.onMessageReceived = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onTransferState = null;
    /**
     * Optional relay callback. Set this to handle messages that the router
     * decides should be forwarded. Receives (message, ingressPeerId).
     * The caller is responsible for selecting egress peers and calling
     * sendMessage() on the appropriate outbound BLEManager instances.
     * Not called when no router is set.
     */
    this.onForward = null;

    // Receive state by message transfer id
    this.receiveStates = new Map();

    // Outbound tracking
    this.pendingAcks = new Map();
    this.outboxFlushPromise = null;
    this.outboxRetryTimer = null;

    // Connection state
    this.isConnected = false;

    // I/O boundary (Web Bluetooth adapter)
    this.io = io;
    this.store = store;
    this.transportManager = transportManager;
    this.protocolConfig = this._buildProtocolConfig(protocolConfig);

    /**
     * Optional MeshRouter instance. When set, every fully-reassembled,
     * non-duplicate incoming message is passed to router.shouldForward().
     * If shouldForward returns true, this.onForward(message, ingressPeerId)
     * is called. Phase 1: 1-hop relay; ingressPeerId is available for future
     * Phase 2 path-tracking but is unused by shouldForward in Phase 1.
     */
    this.router = router;
  }

  static createStoreAdapter() {
    return {
      addToOutbox,
      addToInbox,
      getPendingOutbox,
      removeFromOutbox,
      updateOutboxStatus,
      checkAndMarkSeen
    };
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
      this._startOutboxRetryLoop();
      this._emitTransferState("connected", { deviceId: device.id, deviceName: device.name || "unknown" });

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
    this._emitTransferState("disconnecting");
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

    await this.store.addToOutbox(message, recipientFp, {
      transport: "ble",
      status: DELIVERY_STATUS.PENDING
    });

    if (!this.isConnected || !this.txCharacteristic) {
      this._emitTransferState("queued", { msgId: message.msgId });
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

      const pending = await this.store.getPendingOutbox();
      for (const entry of pending) {
        const decision = this._classifyOutboxEntry(entry);
        if (!decision.shouldSend) {
          if (decision.reason === "retry-cooldown" && entry?.msgId) {
            this._emitTransferState("queued", {
              msgId: entry.msgId,
              reason: decision.reason,
              nextRetryAt: decision.nextRetryAt,
              remainingMs: decision.remainingMs
            });
          }
          continue;
        }
        await this._sendQueuedEntry(decision.normalizedEntry);
      }
    })();

    try {
      await this.outboxFlushPromise;
    } finally {
      this.outboxFlushPromise = null;
    }
  }

  // ============ Private Methods ============

  _emitTransferState(state, details = {}) {
    if (!this.onTransferState) {
      return;
    }
    this.onTransferState({
      state,
      ts: Date.now(),
      ...details
    });
  }

  async _sendQueuedEntry(entry) {
    const msgId = entry.msgId;

    try {
      this._emitTransferState("sending", { msgId, attempt: (entry.attempts || 0) + 1 });
      await this.store.updateOutboxStatus(msgId, DELIVERY_STATUS.PENDING, {
        transport: "ble",
        error: null
      });
      await this._sendMessageWithAck(entry.message);
      await this.store.updateOutboxStatus(msgId, DELIVERY_STATUS.DELIVERED, {
        deliveredAt: Date.now()
      });
      await this.store.removeFromOutbox(msgId);
      this._emitTransferState("delivered", { msgId });
    } catch (error) {
      const attempts = (entry.attempts || 0) + 1;
      const finalStatus = attempts >= this.protocolConfig.retryCount
        ? DELIVERY_STATUS.FAILED
        : DELIVERY_STATUS.PENDING;

      await this.store.updateOutboxStatus(msgId, finalStatus, {
        transport: "ble",
        error: error.message
      });

      if (!this.isConnected) {
        this._emitTransferState("queued", { msgId, reason: "disconnect" });
        console.warn("[BLE] Message kept in outbox due to disconnect", msgId);
        return;
      }

      if (attempts >= this.protocolConfig.retryCount) {
        this._emitTransferState("fallback", { msgId, error: error.message });
        await this._sendFallback(entry.message, error);
        this._emitTransferState("failed", { msgId, error: error.message });
        console.error("[BLE] Message delivery failed after retries", msgId);
        throw new Error(BLE_ERROR.SEND_FAILED);
      }

      this._emitTransferState("retrying", { msgId, attempt: attempts + 1, error: error.message });
      await this._delay(this.protocolConfig.retryDelayMs);
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
    if (chunks.length > 0xff) {
      throw new Error(`Message too large for BLE framing: ${chunks.length} chunks (max 255)`);
    }
    const transferId = this._getTransferId(message);

    console.log(`[BLE] Sending message ${transferId} in ${chunks.length} chunk(s)`);

    for (let i = 0; i < chunks.length; i++) {
      const framedPayload = this._encodeChunkPayload(transferId, chunks[i]);
      await this._writePacket(MSG_TYPE.DIRECT, i, chunks.length, 0, framedPayload);
      if (i < chunks.length - 1) {
        await this._delay(this.protocolConfig.chunkDelayMs);
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
      }, this.protocolConfig.ackTimeoutMs);

      this.pendingAcks.set(transferId, {
        resolve: () => {
          globalThis.clearTimeout(timeout);
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

      if (!dataView || dataView.byteLength < 4) {
        throw new Error("Invalid BLE packet: header too short");
      }

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

      const senderFp = message.sndr || this.device?.id || "unknown";
      const seenKey = `${message.msgId || state.transferId}:${senderFp}`;
      const shouldStore = this.store.checkAndMarkSeen
        ? await this.store.checkAndMarkSeen(message.msgId || state.transferId, senderFp)
        : true;

      if (!shouldStore) {
        console.log("[BLE] Duplicate message ignored", seenKey);
        await this._sendAck(state.transferId);
        return;
      }

      await this.store.addToInbox(
        {
          msgId: message.msgId || state.transferId,
          senderFp,
          content: message,
          type: message.kind || "ble",
          payload: message,
          ts: message.ts || Date.now()
        },
        message
      );

      await this._sendAck(state.transferId);

      await this._maybeForward(message);

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

  /**
   * If a MeshRouter and onForward callback are configured, ask the router
   * whether to relay this message and fire onForward if so.
   *
   * Phase 1: ingressPeerId is the BLE device ID of the connected peer (or
   * "unknown-ingress" when unavailable). MeshRouter.shouldForward ignores it
   * in Phase 1 (parameter is _ingressPeerId) but records it for Phase 2.
   *
   * @param {Object} message - Parsed, deduplicated message.
   * @private
   */
  async _maybeForward(message) {
    if (!this.router || !this.onForward) {
      return;
    }
    const ingressPeerId = this.device?.id || "unknown-ingress";
    const shouldRelay = this.router.shouldForward(message, ingressPeerId);
    if (shouldRelay) {
      try {
        await this.onForward(message, ingressPeerId);
      } catch (err) {
        console.warn("[BLE] onForward error:", err?.message || err);
      }
    }
  }

  _getOrCreateReceiveState(msgType, totalChunks, transferId) {
    this._cleanupExpiredReceiveStates();

    if (totalChunks < 1 || totalChunks > 0xff) {
      throw new Error(`Invalid totalChunks: ${totalChunks}`);
    }

    const existing = this.receiveStates.get(transferId);

    if (existing) {
      if (existing.totalChunks !== totalChunks) {
        throw new Error(`Mismatched totalChunks for ${transferId}`);
      }
      if (existing.msgType !== msgType) {
        throw new Error(`Mismatched msgType for ${transferId}`);
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

    if (typeof globalThis.btoa === "function") {
      return globalThis.btoa(binary);
    }

    return Buffer.from(data).toString("base64");
  }

  _fromBase64(base64) {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(base64);
      const result = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        result[i] = binary.charCodeAt(i);
      }
      return result;
    }

    return new Uint8Array(Buffer.from(base64, "base64"));
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
      if (now - state.lastUpdated > this.protocolConfig.reassemblyTimeoutMs) {
        console.warn("[BLE] Dropping stale receive state", transferId);
        this.receiveStates.delete(transferId);
      }
    }
  }

  _startOutboxRetryLoop() {
    this._stopOutboxRetryLoop();

    this.outboxRetryTimer = globalThis.setInterval(() => {
      if (!this.isConnected || !this.txCharacteristic) {
        return;
      }

      this.flushOutbox().catch((error) => {
        console.warn("[BLE] Background outbox flush failed", error?.message || error);
      });
    }, OUTBOX_RETRY_INTERVAL_MS);
  }

  _stopOutboxRetryLoop() {
    if (!this.outboxRetryTimer) {
      return;
    }
    globalThis.clearInterval(this.outboxRetryTimer);
    this.outboxRetryTimer = null;
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
    this._stopOutboxRetryLoop();

    for (const [transferId] of this.pendingAcks) {
      this.pendingAcks.delete(transferId);
    }

    this._emitTransferState("disconnected", { deviceId: this.device?.id });

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
    for (let i = 0; i < data.length; i += this.protocolConfig.chunkSize) {
      chunks.push(data.slice(i, i + this.protocolConfig.chunkSize));
    }
    return chunks;
  }

  getProtocolConfig() {
    return { ...this.protocolConfig };
  }

  updateProtocolConfig(overrides = {}) {
    this.protocolConfig = this._buildProtocolConfig({
      ...this.protocolConfig,
      ...overrides
    });
    return this.getProtocolConfig();
  }

  _buildProtocolConfig(overrides) {
    const mtu = Math.max(23, overrides.mtu ?? CONFIG.MTU);
    const packetHeaderSize = Math.max(4, overrides.packetHeaderSize ?? 4);
    const chunkSize = Math.max(16, Math.min(overrides.chunkSize ?? CONFIG.CHUNK_SIZE, mtu - packetHeaderSize));

    return {
      mtu,
      packetHeaderSize,
      chunkSize,
      ackTimeoutMs: Math.max(100, overrides.ackTimeoutMs ?? CONFIG.ACK_TIMEOUT_MS),
      retryCount: Math.max(1, overrides.retryCount ?? CONFIG.RETRY_COUNT),
      retryDelayMs: Math.max(0, overrides.retryDelayMs ?? CONFIG.RETRY_DELAY_MS),
      chunkDelayMs: Math.max(0, overrides.chunkDelayMs ?? CONFIG.CHUNK_DELAY_MS),
      reassemblyTimeoutMs: Math.max(1000, overrides.reassemblyTimeoutMs ?? CONFIG.REASSEMBLY_TIMEOUT_MS)
    };
  }

  _classifyOutboxEntry(entry) {
    if (!entry || !entry.msgId || !entry.message) {
      return { shouldSend: false, reason: "invalid" };
    }
    if (entry.transport && entry.transport !== "ble") {
      return { shouldSend: false, reason: "transport-mismatch" };
    }
    if (entry.status === DELIVERY_STATUS.DELIVERED || entry.status === DELIVERY_STATUS.SENT) {
      return { shouldSend: false, reason: "already-delivered" };
    }

    if (entry.status === DELIVERY_STATUS.FAILED) {
      const lastAttempt = entry.lastAttempt || entry.createdAt || 0;
      const elapsedMs = Date.now() - lastAttempt;
      if (elapsedMs < OUTBOX_RETRY_INTERVAL_MS) {
        return {
          shouldSend: false,
          reason: "retry-cooldown",
          nextRetryAt: lastAttempt + OUTBOX_RETRY_INTERVAL_MS,
          remainingMs: OUTBOX_RETRY_INTERVAL_MS - elapsedMs
        };
      }
    }

    return {
      shouldSend: true,
      reason: "ble-pending",
      normalizedEntry: { ...entry, attempts: entry.attempts || 0 }
    };
  }

  async _sendFallback(message, error) {
    if (!this.transportManager || !message || !this.transportManager.sendWithFallback) {
      return;
    }

    try {
      const result = await this.transportManager.sendWithFallback("ble", message, ["clipboard", "file"]);
      if (result.transport !== "ble") {
        console.warn(`[BLE] Fallback sent via ${result.transport} after BLE failure`, error?.message || error);
      }
    } catch (fallbackError) {
      console.warn("[BLE] All fallback transports failed", fallbackError);
    }
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
