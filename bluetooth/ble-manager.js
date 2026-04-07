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
  getFailedOutbox,
  getOutboxForLink,
  getOutboxByMinPriority,
  removeFromOutbox,
  updateOutboxStatus,
  checkAndMarkSeen,
  storeChunk,
  getPendingChunks,
  cleanupOldChunks,
  clearPendingChunks,
  DELIVERY_STATUS,
  OUTBOX_PRIORITY,
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
    this.lastChunkCleanupAt = 0;
  }

  static createStoreAdapter() {
    return {
      addToOutbox,
      addToInbox,
      getPendingOutbox,
      getFailedOutbox,
      getOutboxForLink,
      getOutboxByMinPriority,
      removeFromOutbox,
      updateOutboxStatus,
      checkAndMarkSeen,
      storeChunk,
      getPendingChunks,
      cleanupOldChunks,
      clearPendingChunks
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
    const linkId = options.linkId ?? this.device?.id ?? null;
    const priority = options.priority ?? OUTBOX_PRIORITY.NORMAL;

    await this.store.addToOutbox(message, recipientFp, {
      transport: "ble",
      status: DELIVERY_STATUS.PENDING,
      linkId,
      priority
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
      for (const entry of await this._prepareFlushEntries(pending)) {
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

      const failedEntries = this.store.getFailedOutbox
        ? await this.store.getFailedOutbox()
        : [];
      for (const entry of this._prepareLinkScopedEntries(failedEntries)) {
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

        try {
          await this._sendQueuedEntry(decision.normalizedEntry);
        } catch (error) {
          console.warn("[BLE] Failed retry entry did not block flush", entry.msgId, error instanceof Error ? error.message : String(error));
        }
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

  _prepareLinkScopedEntries(entries) {
    const activeLinkId = this.device?.id || null;
    return entries.filter((entry) => !entry?.linkId || (activeLinkId && entry.linkId === activeLinkId));
  }

  async _prepareFlushEntries(pendingEntries) {
    const activeLinkId = this.device?.id || null;
    const scoped = this._prepareLinkScopedEntries(pendingEntries);

    // Prefer entries explicitly targeted at this link when the store supports it.
    if (activeLinkId && this.store.getOutboxForLink) {
      const targeted = await this.store.getOutboxForLink(activeLinkId);
      const pendingTargeted = targeted.filter((entry) => entry.status === DELIVERY_STATUS.PENDING);
      const byId = new Map();
      for (const entry of [...scoped, ...pendingTargeted]) {
        byId.set(entry.msgId, entry);
      }
      return this._sortFlushEntries(Array.from(byId.values()));
    }

    return this._sortFlushEntries(scoped);
  }

  async _sortFlushEntries(entries) {
    const highPriorityIds = new Set();
    if (this.store.getOutboxByMinPriority) {
      try {
        const rows = await this.store.getOutboxByMinPriority(OUTBOX_PRIORITY.HIGH);
        for (const row of rows || []) highPriorityIds.add(row.msgId);
      } catch {
        // Optional store capability; ignore when unavailable/mocked.
      }
    }

    return [...entries].sort((a, b) => {
      const aPriority = a.priority ?? OUTBOX_PRIORITY.NORMAL;
      const bPriority = b.priority ?? OUTBOX_PRIORITY.NORMAL;
      if (aPriority !== bPriority) return bPriority - aPriority;
      const aBoost = highPriorityIds.has(a.msgId) ? 1 : 0;
      const bBoost = highPriorityIds.has(b.msgId) ? 1 : 0;
      if (aBoost !== bBoost) return bBoost - aBoost;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }

  async _sendQueuedEntry(entry) {
    const msgId = entry.msgId;

    try {
      this._emitTransferState("sending", { msgId, attempt: (entry.attempts || 0) + 1 });
      await this.store.updateOutboxStatus(msgId, DELIVERY_STATUS.PENDING, {
        transport: "ble",
        error: null,
        countAttempt: true
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
        error: error instanceof Error ? error.message : String(error)
      });

      if (!this.isConnected) {
        this._emitTransferState("queued", { msgId, reason: "disconnect" });
        console.warn("[BLE] Message kept in outbox due to disconnect", msgId);
        return;
      }

      if (attempts >= this.protocolConfig.retryCount) {
        this._emitTransferState("fallback", { msgId, error: error instanceof Error ? error.message : String(error) });
        await this._sendFallback(entry.message, error);
        this._emitTransferState("failed", { msgId, error: error instanceof Error ? error.message : String(error) });
        console.error("[BLE] Message delivery failed after retries", msgId);
        throw new Error(BLE_ERROR.SEND_FAILED);
      }

      this._emitTransferState("retrying", { msgId, attempt: attempts + 1, error: error instanceof Error ? error.message : String(error) });
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
      await this._maybeCleanupPersistedChunks();
      const state = await this._getOrCreateReceiveState(msgType, totalChunks, decoded.transferId);

      if (chunkIndex >= state.totalChunks) {
        throw new Error(`Chunk index out of range: ${chunkIndex}/${state.totalChunks}`);
      }

      if (state.chunks[chunkIndex]) {
        state.duplicates += 1;
        console.log("[BLE] Duplicate chunk ignored", chunkIndex, state.transferId);
        return;
      }

      let persistedChunks = null;
      try {
        persistedChunks = await this._storeIncomingChunk(
          state.transferId,
          chunkIndex,
          state.totalChunks,
          decoded.data
        );
      } catch (error) {
        this.receiveStates.delete(state.transferId);
        throw error;
      }

      state.chunks[chunkIndex] = decoded.data;
      state.receivedCount += 1;
      state.lastUpdated = Date.now();

      if (!persistedChunks && state.receivedCount !== state.totalChunks) {
        return;
      }

      const completeData = persistedChunks
        ? this._reassembleChunks(persistedChunks.map((chunk) => this._fromBase64(chunk.data)))
        : this._reassembleChunks(state.chunks);
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
        console.warn("[BLE] onForward error:", err instanceof Error ? err.message : String(err));
      }
    }
  }

  async _getOrCreateReceiveState(msgType, totalChunks, transferId) {
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

    let pending = [];
    if (this.store.getPendingChunks) {
      try {
        pending = await this.store.getPendingChunks(transferId);
      } catch (error) {
        console.warn("[BLE] Pending chunk hydration skipped:", error instanceof Error ? error.message : String(error));
      }
    }
    const hydratedChunks = new Array(totalChunks).fill(null);

    for (const chunk of pending) {
      if (!Number.isInteger(chunk.seq) || chunk.seq < 0 || chunk.seq >= totalChunks) {
        continue;
      }
      if (chunk.total !== totalChunks) {
        if (this.store.clearPendingChunks) {
          await this.store.clearPendingChunks(transferId);
        }
        throw new Error(`Mismatched totalChunks for ${transferId}`);
      }
      hydratedChunks[chunk.seq] = this._fromBase64(chunk.data);
    }

    const state = {
      transferId,
      msgType,
      totalChunks,
      chunks: hydratedChunks,
      receivedCount: hydratedChunks.filter(Boolean).length,
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

  _storeIncomingChunk(transferId, chunkIndex, totalChunks, data) {
    if (!this.store.storeChunk) {
      return null;
    }

    return this.store.storeChunk({
      v: 1,
      kind: "dmesh-chunk",
      msgId: transferId,
      seq: chunkIndex,
      total: totalChunks,
      data: this._toBase64(data)
    });
  }

  async _maybeCleanupPersistedChunks() {
    if (!this.store.cleanupOldChunks) {
      return;
    }

    const now = Date.now();
    if (now - this.lastChunkCleanupAt < 60 * 1000) {
      return;
    }

    this.lastChunkCleanupAt = now;
    await this.store.cleanupOldChunks(this.protocolConfig.reassemblyTimeoutMs);
  }

  _startOutboxRetryLoop() {
    this._stopOutboxRetryLoop();

    this.outboxRetryTimer = globalThis.setInterval(() => {
      if (!this.isConnected || !this.txCharacteristic) {
        return;
      }

      this.flushOutbox().catch((error) => {
        console.warn("[BLE] Background outbox flush failed", error instanceof Error ? error.message : String(error));
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
        console.warn(`[BLE] Fallback sent via ${result.transport} after BLE failure`, error instanceof Error ? error.message : String(error));
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

// ============================================================================
// IGATTBackend — Pluggable transport backend interface
// ============================================================================

/**
 * IGATTBackend — interface contract for pluggable transport backends.
 *
 * Both the Web Bluetooth backend (BLEManager) and the LoRa backend
 * (LoRaBackend) implement this interface, allowing the application layer
 * to swap transports without changing message-handling logic.
 *
 * Required methods (all async unless noted):
 *
 *   connect(target)          → Promise<void>   Connect/open the link
 *   disconnect()             → void            Close the link
 *   sendMessage(msg, opts)   → Promise<void>   Enqueue + transmit a message
 *   isConnected()            → boolean         Synchronous link-state check
 *   getTransportName()       → string          Human-readable name ("ble"|"lora"|…)
 *   getCapabilities()        → Object          MTU, maxChunk, etc.
 *
 * Optional callbacks set by the application layer:
 *   onMessageReceived(msg, meta)
 *   onConnectionChange(connected, target)
 *   onError(code, error)
 *   onTransferState(stateObj)
 *   onForward(msg, ingressId)      — relay callback (same as BLEManager)
 */

// ============================================================================
// LoRaBackend — Meshtastic-compatible serial LoRa wrapper
// ============================================================================

/**
 * LoRa transport backend via Web Serial API (or Node.js SerialPort).
 *
 * Implements the Meshtastic serial framing protocol over a USB/UART link
 * to an ESP32-C3 (or similar) LoRa radio module running lifeline-esp32.ino
 * firmware.
 *
 * Meshtastic Serial Protocol (subset implemented here):
 *   Frame: [START1=0x94][START2=0xc3][LEN_MSB][LEN_LSB][PAYLOAD...]
 *   PAYLOAD: protobuf-encoded ToRadio / FromRadio packet
 *   MTU: 200 bytes (LoRa LongFast preset)
 *
 * This implementation uses JSON-encoded payloads wrapped in the Meshtastic
 * serial framing, avoiding a full protobuf dependency. Firmware on the ESP32
 * side decodes the JSON and bridges to the LoRa radio.
 */
export class LoRaBackend {
  /**
   * @param {Object} [options]
   * @param {number}  [options.mtu]           - Max payload bytes (default 200, LoRa LongFast)
   * @param {number}  [options.ackTimeoutMs]  - ACK timeout (default 10 000 ms — LoRa is slow)
   * @param {number}  [options.retryCount]    - Send retry count (default 3)
   * @param {number}  [options.retryDelayMs]  - Delay between retries (default 5 000 ms)
   * @param {Object}  [options.serialIO]      - Injected serial I/O (for testing)
   * @param {Object}  [options.store]         - Store adapter (same interface as BLEManager)
   * @param {Object}  [options.router]        - MeshRouter instance (optional)
   */
  constructor(options = {}) {
    this.mtu = options.mtu ?? 200;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 10_000;
    this.retryCount = options.retryCount ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 5_000;

    /** @type {Object|null} Web Serial port or Node SerialPort */
    this._port = null;
    this._reader = null;
    this._writer = null;
    this._connected = false;
    this._readBuffer = new Uint8Array(0);

    // Pending ACK promises: transferId → { resolve, reject, timer }
    this._pendingAcks = new Map();

    // Pluggable serial I/O (allows test injection)
    this._serialIO = options.serialIO ?? LoRaBackend.createSerialIO();

    this.store = options.store ?? null;
    this.router = options.router ?? null;

    // Callbacks (same names as BLEManager for interface compatibility)
    this.onMessageReceived = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onTransferState = null;
    this.onForward = null;
  }

  // ─── IGATTBackend interface ───────────────────────────────────────────────

  getTransportName() {
    return "lora";
  }

  getCapabilities() {
    return {
      mtu: this.mtu,
      maxChunkSize: this.mtu - 20, // 20 bytes for framing/JSON overhead
      transport: "lora",
      preset: "LongFast",
      supportsAck: true,
      supportsChunking: true
    };
  }

  isConnected() {
    return this._connected;
  }

  /**
   * Connect to the LoRa radio via Web Serial.
   * @param {{ baudRate?: number }} [target]
   * @returns {Promise<void>}
   */
  async connect(target = {}) {
    if (this._connected) return;

    const baudRate = target.baudRate ?? 921600; // ESP32-C3 default

    try {
      this._port = await this._serialIO.requestPort();
      await this._serialIO.open(this._port, { baudRate });
      this._writer = await this._serialIO.getWriter(this._port);
      this._connected = true;

      // Start reading loop in background
      this._startReadLoop();

      this._emitTransferState("connected", { transport: "lora", baudRate });
      if (this.onConnectionChange) this.onConnectionChange(true, this._port);
      console.log("[LoRa] Connected to radio at", baudRate, "baud");
    } catch (err) {
      throw new Error(`[LoRa] connect failed: ${err.message}`);
    }
  }

  /**
   * Disconnect from the LoRa radio.
   */
  disconnect() {
    this._connected = false;

    // Reject all pending ACKs
    for (const [id, pending] of this._pendingAcks) {
      clearTimeout(pending.timer);
      pending.reject(new Error("LoRa disconnected"));
      this._pendingAcks.delete(id);
    }

    if (this._writer) {
      try { this._writer.releaseLock(); } catch { /* ignore */ }
      this._writer = null;
    }
    if (this._port) {
      this._serialIO.close(this._port).catch(() => {});
      this._port = null;
    }

    this._emitTransferState("disconnected", { transport: "lora" });
    if (this.onConnectionChange) this.onConnectionChange(false, null);
    console.log("[LoRa] Disconnected");
  }

  /**
   * Send a Lifeline Mesh message over LoRa.
   * Large messages are chunked to fit within MTU.
   *
   * @param {Object} message
   * @param {Object} [opts]
   * @returns {Promise<void>}
   */
  async sendMessage(message, opts = {}) {
    if (!this._connected) {
      throw new Error("[LoRa] Not connected");
    }

    const payload = JSON.stringify(message);
    const payloadBytes = new TextEncoder().encode(payload);
    const chunkSize = this.mtu - 20;
    const chunks = [];

    for (let i = 0; i < payloadBytes.length; i += chunkSize) {
      chunks.push(payloadBytes.slice(i, i + chunkSize));
    }

    const transferId = message.msgId || `lora:${Date.now()}`;
    const totalChunks = chunks.length;

    for (let seq = 0; seq < totalChunks; seq++) {
      const chunkEnvelope = {
        kind: "lora-chunk",
        transferId,
        seq,
        total: totalChunks,
        data: this._toBase64(chunks[seq])
      };
      await this._writeFrame(chunkEnvelope);

      if (seq < totalChunks - 1) {
        await this._delay(50); // brief pause between LoRa transmissions
      }
    }

    // Wait for ACK if sending to a known peer
    await this._waitForAck(transferId);
    console.log("[LoRa] Message delivered", transferId);
  }

  // ─── Private: Meshtastic serial framing ──────────────────────────────────

  /**
   * Write a JSON object as a Meshtastic-framed serial packet.
   * Frame: [0x94][0xc3][LEN_MSB][LEN_LSB][UTF-8 JSON]
   *
   * @param {Object} obj
   */
  async _writeFrame(obj) {
    const payload = new TextEncoder().encode(JSON.stringify(obj));
    const frame = new Uint8Array(4 + payload.length);
    frame[0] = 0x94; // Meshtastic START1
    frame[1] = 0xc3; // Meshtastic START2
    frame[2] = (payload.length >> 8) & 0xff;
    frame[3] = payload.length & 0xff;
    frame.set(payload, 4);

    await this._serialIO.write(this._writer, frame);
  }

  /**
   * Background read loop — parses Meshtastic frames from the serial stream.
   */
  async _startReadLoop() {
    const reader = await this._serialIO.getReader(this._port);
    this._reader = reader;

    try {
      while (this._connected) {
        const { value, done } = await this._serialIO.read(reader);
        if (done) break;
        if (value) {
          this._appendToBuffer(value);
          this._parseFrames();
        }
      }
    } catch (err) {
      if (this._connected) {
        console.error("[LoRa] Read loop error:", err.message);
        if (this.onError) this.onError("lora-read-error", err);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }
  }

  _appendToBuffer(chunk) {
    const combined = new Uint8Array(this._readBuffer.length + chunk.length);
    combined.set(this._readBuffer, 0);
    combined.set(chunk, this._readBuffer.length);
    this._readBuffer = combined;
  }

  /**
   * Parse complete Meshtastic frames from the internal buffer.
   */
  _parseFrames() {
    while (this._readBuffer.length >= 4) {
      // Find START bytes
      if (this._readBuffer[0] !== 0x94 || this._readBuffer[1] !== 0xc3) {
        // Scan forward for next START sequence
        let i = 1;
        while (i < this._readBuffer.length - 1) {
          if (this._readBuffer[i] === 0x94 && this._readBuffer[i + 1] === 0xc3) break;
          i++;
        }
        this._readBuffer = this._readBuffer.slice(i);
        continue;
      }

      const payloadLen = (this._readBuffer[2] << 8) | this._readBuffer[3];
      if (this._readBuffer.length < 4 + payloadLen) break; // incomplete frame

      const payload = this._readBuffer.slice(4, 4 + payloadLen);
      this._readBuffer = this._readBuffer.slice(4 + payloadLen);

      try {
        const obj = JSON.parse(new TextDecoder().decode(payload));
        this._handleIncomingFrame(obj);
      } catch (err) {
        console.warn("[LoRa] Frame parse error:", err.message);
      }
    }
  }

  /**
   * Handle a parsed incoming frame.
   * @param {Object} frame
   */
  _handleIncomingFrame(frame) {
    if (!frame || !frame.kind) return;

    if (frame.kind === "lora-ack") {
      const pending = this._pendingAcks.get(frame.transferId);
      if (pending) {
        clearTimeout(pending.timer);
        this._pendingAcks.delete(frame.transferId);
        pending.resolve();
      }
      return;
    }

    if (frame.kind === "lora-chunk") {
      // TODO: reassemble chunks and deliver to onMessageReceived
      // For now, single-chunk messages are delivered immediately
      if (frame.total === 1) {
        try {
          const msgBytes = this._fromBase64(frame.data);
          const message = JSON.parse(new TextDecoder().decode(msgBytes));
          this._deliverMessage(message, frame.transferId);
        } catch (err) {
          console.warn("[LoRa] Chunk decode error:", err.message);
        }
      }
      // Multi-chunk reassembly handled by BLEManager-style store adapter
      return;
    }
  }

  async _deliverMessage(message, transferId) {
    // ACK the sender
    await this._writeFrame({ kind: "lora-ack", transferId }).catch(() => {});

    // Forward via router if configured
    if (this.router && this.onForward) {
      const shouldRelay = this.router.shouldForward(message, "lora-ingress");
      if (shouldRelay) {
        try { await this.onForward(message, "lora-ingress"); } catch { /* ignore */ }
      }
    }

    if (this.onMessageReceived) {
      this.onMessageReceived(message, "lora");
    }
  }

  _waitForAck(transferId) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingAcks.delete(transferId);
        reject(new Error(`LoRa ACK timeout for ${transferId}`));
      }, this.ackTimeoutMs);

      this._pendingAcks.set(transferId, { resolve, reject, timer });
    });
  }

  _emitTransferState(state, details = {}) {
    if (this.onTransferState) {
      this.onTransferState({ state, ts: Date.now(), ...details });
    }
  }

  _toBase64(data) {
    if (typeof globalThis.btoa === "function") {
      let binary = "";
      for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
      return globalThis.btoa(binary);
    }
    return Buffer.from(data).toString("base64");
  }

  _fromBase64(s) {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(s);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(s, "base64"));
  }

  _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Default serial I/O adapter (Web Serial API) ─────────────────────────

  static createSerialIO() {
    return {
      requestPort: () => navigator.serial.requestPort({ filters: [] }),
      open: (port, opts) => port.open(opts),
      close: (port) => port.close(),
      getWriter: (port) => port.writable.getWriter(),
      getReader: (port) => port.readable.getReader(),
      write: (writer, data) => writer.write(data),
      read: (reader) => reader.read()
    };
  }

  /**
   * Create a Node.js serial I/O adapter using the `serialport` npm package.
   * Usage: new LoRaBackend({ serialIO: LoRaBackend.createNodeSerialIO() })
   *
   * @param {string} path - Serial port path e.g. "/dev/ttyUSB0"
   * @param {number} [baudRate]
   * @returns {Object}
   */
  static createNodeSerialIO(path, baudRate = 921600) {
    return {
      requestPort: async () => {
        // Dynamic import so web builds don't bundle serialport
        const { SerialPort } = await import("serialport");
        return new SerialPort({ path, baudRate, autoOpen: false });
      },
      open: (port) => new Promise((res, rej) =>
        port.open((err) => err ? rej(err) : res())
      ),
      close: (port) => new Promise((res, rej) =>
        port.close((err) => err ? rej(err) : res())
      ),
      getWriter: (port) => ({
        write: (data) => new Promise((res, rej) =>
          port.write(data, (err) => err ? rej(err) : res())
        ),
        releaseLock: () => {}
      }),
      getReader: (port) => {
        // Return async-iterable wrapper
        return {
          read: () => new Promise((res) => {
            port.once("data", (chunk) => res({ value: new Uint8Array(chunk), done: false }));
            port.once("close", () => res({ value: null, done: true }));
          }),
          releaseLock: () => {}
        };
      },
      write: (writer, data) => writer.write(data),
      read: (reader) => reader.read()
    };
  }
}

