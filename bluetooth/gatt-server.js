/**
 * Lifeline Mesh - GATT Server Layer
 *
 * Implements the BLE peripheral/server side of the Lifeline Mesh protocol.
 * The Web Bluetooth API does not expose peripheral mode in browsers; this
 * module defines the GATTServer interface so that native-wrapper runtimes
 * (Capacitor, Electron, Node.js with @abandonware/noble, Chrome extension
 * background page with BluetoothLE peripheral API) can plug in a concrete
 * implementation via GATTServer.setBackend().
 *
 * In test environments a MockGATTBackend is available for unit-testing the
 * server logic without hardware.
 *
 * Architecture
 * ─────────────
 *   GATTServer          ← this module (application logic, transport-agnostic)
 *       │
 *   IGATTBackend        ← interface that native adapters implement
 *       │
 *   BLEManager (client) ← connects to GATTServer on a remote device
 *
 * Responsibilities of GATTServer:
 *   • Start/stop GATT service advertisement.
 *   • Accept incoming connections from central clients.
 *   • Receive chunked messages written to MESSAGE_TX characteristic.
 *   • Reassemble chunks and emit complete messages.
 *   • Send outbound messages to the connected central via MESSAGE_RX notify.
 *   • Fire onMessageReceived / onClientConnected / onClientDisconnected callbacks.
 */

import {
  SERVICE_UUID,
  CHARACTERISTICS,
  MSG_TYPE,
  CONFIG
} from "./constants.js";

// ─── Error codes ─────────────────────────────────────────────────────────────

export const GATT_SERVER_ERROR = {
  BACKEND_NOT_SET: "GATT_BACKEND_NOT_SET",
  ALREADY_ADVERTISING: "GATT_ALREADY_ADVERTISING",
  NOT_ADVERTISING: "GATT_NOT_ADVERTISING",
  CLIENT_NOT_FOUND: "GATT_CLIENT_NOT_FOUND",
  SEND_FAILED: "GATT_SEND_FAILED"
};

// ─── IGATTBackend interface (documentation only — JS has no interfaces) ───────

/**
 * @interface IGATTBackend
 *
 * Concrete implementations must provide:
 *
 *   startAdvertising(serviceUuid, name): Promise<void>
 *     Begin BLE advertisement so centrals can discover and connect.
 *
 *   stopAdvertising(): Promise<void>
 *     Stop advertisement and disconnect all clients.
 *
 *   notifyCharacteristic(clientId, charUuid, data: Uint8Array): Promise<void>
 *     Send data to a specific connected central via NOTIFY.
 *
 *   onWriteRequest: (clientId, charUuid, data: Uint8Array) => void
 *     Setter that the GATTServer will assign its handler to.
 *
 *   onClientConnected: (clientId: string) => void
 *     Setter that the GATTServer will assign its handler to.
 *
 *   onClientDisconnected: (clientId: string) => void
 *     Setter that the GATTServer will assign its handler to.
 */

// ─── GATTServer ───────────────────────────────────────────────────────────────

export class GATTServer {
  /**
   * @param {object} [options]
   * @param {object|null} [options.backend]       - Backend adapter (set later via setBackend).
   * @param {string}            [options.localName]     - BLE advertisement name.
   * @param {object}            [options.protocolConfig] - Protocol overrides (chunkSize, etc.).
   */
  constructor(options = {}) {
    /** @type {object|null} */
    this._backend = options.backend ?? null;

    this._localName = options.localName ?? "LifelineMesh";
    this._advertising = false;

    /** @type {Map<string, object>} transferId -> reassembly state for active client */
    this._receiveStates = new Map();
    /** @type {Map<string, {resolve: Function, reject: Function, timeout: ReturnType<typeof setTimeout>} >} */
    this._pendingOutboundAcks = new Map();

    /** @type {string|null} Currently connected central client ID (single-client model). */
    this._clientId = null;

    this._protocolConfig = this._buildProtocolConfig(options.protocolConfig ?? {});

    // ── Public callbacks ────────────────────────────────────────────────────

    /** Called when a complete message is received from a central client. */
    this.onMessageReceived = null; // (message, clientId) => void

    /** Called when a central client connects. */
    this.onClientConnected = null; // (clientId) => void

    /** Called when a central client disconnects. */
    this.onClientDisconnected = null; // (clientId) => void

    /** Called when any error occurs. */
    this.onError = null; // (errorCode, error) => void
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Attach (or replace) the native backend adapter.
   * Must be called before startAdvertising().
   * @param {object} backend
   */
  setBackend(backend) {
    this._backend = backend;
    this._wireBackendCallbacks();
  }

  /** @returns {boolean} */
  get isAdvertising() {
    return this._advertising;
  }

  /** @returns {number} Number of connected central clients (0 or 1). */
  get clientCount() {
    return this._clientId ? 1 : 0;
  }

  /** @returns {string[]} Connected client IDs snapshot (single-client model). */
  get connectedClients() {
    return this._clientId ? [this._clientId] : [];
  }

  /**
   * Start advertising the Lifeline Mesh GATT service.
   * @returns {Promise<void>}
   */
  async startAdvertising() {
    if (!this._backend) {
      throw new Error(GATT_SERVER_ERROR.BACKEND_NOT_SET);
    }
    if (this._advertising) {
      throw new Error(GATT_SERVER_ERROR.ALREADY_ADVERTISING);
    }

    this._wireBackendCallbacks();
    await this._backend.startAdvertising(SERVICE_UUID, this._localName);
    this._advertising = true;
    console.log("[GATTServer] Advertising started as", this._localName);
  }

  /**
   * Stop advertising and disconnect the active client.
   * @returns {Promise<void>}
   */
  async stopAdvertising() {
    if (!this._backend) {
      throw new Error(GATT_SERVER_ERROR.BACKEND_NOT_SET);
    }
    if (!this._advertising) {
      throw new Error(GATT_SERVER_ERROR.NOT_ADVERTISING);
    }

    await this._backend.stopAdvertising();
    this._advertising = false;
    this._rejectAllOutboundAcks(new Error(GATT_SERVER_ERROR.CLIENT_NOT_FOUND));
    this._clientId = null;
    this._receiveStates.clear();
    console.log("[GATTServer] Advertising stopped");
  }

  /**
   * Send a message to a specific connected central client.
   * The message is serialised, chunked, and delivered as NOTIFY packets.
   *
   * @param {object} message     - Lifeline Mesh message object.
   * @param {string} clientId    - Target client ID returned by onClientConnected.
   * @returns {Promise<void>}
   */
  async sendMessage(message, clientId) {
    if (!this._backend) {
      throw new Error(GATT_SERVER_ERROR.BACKEND_NOT_SET);
    }
    if (!this._clientId || this._clientId !== clientId) {
      throw new Error(GATT_SERVER_ERROR.CLIENT_NOT_FOUND);
    }

    try {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      const chunks = this._chunkData(bytes);
      const transferId = message.msgId ?? `srv:${Date.now()}`;
      if (chunks.length > 0xff) {
        throw new Error(`Outbound message exceeds chunk limit: ${chunks.length}`);
      }

      for (let i = 0; i < chunks.length; i++) {
        const framedPayload = this._encodeChunkPayload(transferId, chunks[i]);
        const packet = this._buildPacket(MSG_TYPE.DIRECT, i, chunks.length, framedPayload);
        await this._backend.notifyCharacteristic(clientId, CHARACTERISTICS.MESSAGE_RX, packet);
        if (i < chunks.length - 1) {
          await this._delay(this._protocolConfig.chunkDelayMs);
        }
      }

      await this._waitForOutboundAck(transferId, clientId);
    } catch (err) {
      console.error("[GATTServer] sendMessage failed:", err);
      throw new Error(GATT_SERVER_ERROR.SEND_FAILED);
    }
  }

  /**
   * Broadcast a message to the connected central client (if any).
   * @param {object} message
   * @returns {Promise<void>}
   */
  async broadcast(message) {
    if (!this._clientId) return;
    await this.sendMessage(message, this._clientId);
  }

  /**
   * Send an identity packet to a specific connected central.
   * @param {object} identity - Public identity object.
   * @param {string} clientId
   * @returns {Promise<void>}
   */
  async sendIdentity(identity, clientId) {
    if (!this._backend) {
      throw new Error(GATT_SERVER_ERROR.BACKEND_NOT_SET);
    }
    if (!this._clientId || this._clientId !== clientId) {
      throw new Error(GATT_SERVER_ERROR.CLIENT_NOT_FOUND);
    }

    const payload = new TextEncoder().encode(JSON.stringify(identity));
    const packet = this._buildPacket(MSG_TYPE.IDENTITY, 0, 1, payload);
    await this._backend.notifyCharacteristic(clientId, CHARACTERISTICS.MESSAGE_RX, packet);
  }

  /**
   * Return a diagnostic snapshot.
   * @returns {object}
   */
  getSnapshot() {
    return {
      advertising: this._advertising,
      localName: this._localName,
      clientCount: this.clientCount,
      clients: this.connectedClients
    };
  }

  // ─── Backend callback wiring ──────────────────────────────────────────────

  _wireBackendCallbacks() {
    if (!this._backend) return;

    this._backend.onWriteRequest = (clientId, charUuid, data) => {
      this._handleWriteRequest(clientId, charUuid, data);
    };

    this._backend.onClientConnected = (clientId) => {
      if (this._clientId && this._clientId !== clientId) {
        const previousClientId = this._clientId;
        this._receiveStates.clear();
        this._rejectAllOutboundAcks(new Error(GATT_SERVER_ERROR.CLIENT_NOT_FOUND));
        this._clientId = null;
        console.warn("[GATTServer] Replacing active client:", previousClientId, "->", clientId);
        if (this.onClientDisconnected) {
          this.onClientDisconnected(previousClientId);
        }
      }

      this._clientId = clientId;
      this._receiveStates.clear();
      console.log("[GATTServer] Client connected:", clientId);
      if (this.onClientConnected) {
        this.onClientConnected(clientId);
      }
    };

    this._backend.onClientDisconnected = (clientId) => {
      if (!this._clientId || this._clientId !== clientId) {
        return;
      }
      this._rejectAllOutboundAcks(new Error(GATT_SERVER_ERROR.CLIENT_NOT_FOUND));
      this._clientId = null;
      this._receiveStates.clear();
      console.log("[GATTServer] Client disconnected:", clientId);
      if (this.onClientDisconnected) {
        this.onClientDisconnected(clientId);
      }
    };
  }

  // ─── Incoming data handling ───────────────────────────────────────────────

  /**
   * Handle a GATT write request on MESSAGE_TX from a central client.
   * @param {string}     clientId
   * @param {string}     charUuid
   * @param {Uint8Array} data
   * @private
   */
  _handleWriteRequest(clientId, charUuid, data) {
    if (charUuid !== CHARACTERISTICS.MESSAGE_TX) {
      return; // Ignore writes to other characteristics
    }

    try {
      if (!data || data.byteLength < 4) {
        throw new Error("Invalid BLE packet: header too short");
      }

      const msgType = data[0];
      const chunkIndex = data[1];
      const totalChunks = data[2];
      // data[3] is reserved
      const payload = data.slice(4);

      if (msgType === MSG_TYPE.ACK) {
        if (!this._clientId || this._clientId !== clientId) {
          return;
        }
        const ackId = new TextDecoder().decode(payload);
        this._resolveOutboundAck(clientId, ackId);
        return;
      }

      const decoded = this._decodeChunkPayload(payload);
      if (!this._clientId || this._clientId !== clientId) {
        throw new Error(`Write from non-active client: ${clientId}`);
      }

      const state = this._getOrCreateReceiveState(msgType, totalChunks, decoded.transferId);

      if (chunkIndex >= state.totalChunks) {
        throw new Error(`Chunk index out of range: ${chunkIndex}/${state.totalChunks}`);
      }

      if (state.chunks[chunkIndex]) {
        return; // Duplicate chunk
      }

      state.chunks[chunkIndex] = decoded.data;
      state.receivedCount += 1;
      state.lastUpdated = Date.now();

      if (state.receivedCount !== state.totalChunks) {
        return; // Wait for remaining chunks
      }

      const completeData = this._reassembleChunks(state.chunks);
      this._receiveStates.delete(state.transferId);

      const jsonStr = new TextDecoder().decode(completeData);
      const message = JSON.parse(jsonStr);

      // Send ACK back to client
      this._sendAck(clientId, decoded.transferId).catch((err) => {
        console.warn("[GATTServer] ACK send failed:", err?.message ?? err);
      });

      if (this.onMessageReceived) {
        this.onMessageReceived(message, clientId);
      }
    } catch (error) {
      console.error("[GATTServer] Error processing write from", clientId, ":", error);
      if (this.onError) {
        this.onError(GATT_SERVER_ERROR.SEND_FAILED, error);
      }
    }
  }

  async _sendAck(clientId, transferId) {
    if (!this._backend || !this._clientId || this._clientId !== clientId) return;
    const payload = new TextEncoder().encode(transferId);
    const packet = this._buildPacket(MSG_TYPE.ACK, 0, 1, payload);
    await this._backend.notifyCharacteristic(clientId, CHARACTERISTICS.MESSAGE_RX, packet);
  }

  // ─── Receive state management ─────────────────────────────────────────────

  _getOrCreateReceiveState(msgType, totalChunks, transferId) {
    if (totalChunks < 1 || totalChunks > 0xff) {
      throw new Error(`Invalid totalChunks: ${totalChunks}`);
    }

    this._cleanupExpiredReceiveStates();

    const existing = this._receiveStates.get(transferId);
    if (existing) {
      if (existing.totalChunks !== totalChunks || existing.msgType !== msgType) {
        throw new Error(`Mismatched state for transfer ${transferId}`);
      }
      return existing;
    }

    const state = {
      transferId,
      msgType,
      totalChunks,
      chunks: new Array(totalChunks).fill(null),
      receivedCount: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    this._receiveStates.set(transferId, state);
    return state;
  }

  _cleanupExpiredReceiveStates() {
    const now = Date.now();
    for (const [id, state] of this._receiveStates.entries()) {
      if (now - state.lastUpdated > this._protocolConfig.reassemblyTimeoutMs) {
        this._receiveStates.delete(id);
      }
    }
  }

  // ─── Packet helpers ───────────────────────────────────────────────────────

  _buildPacket(msgType, chunkIndex, totalChunks, payload) {
    const header = new Uint8Array([msgType, chunkIndex, totalChunks, 0]);
    const packet = new Uint8Array(header.length + payload.length);
    packet.set(header, 0);
    packet.set(payload, header.length);
    return packet;
  }

  _encodeChunkPayload(transferId, chunkData) {
    const envelope = { transferId, data: this._toBase64(chunkData) };
    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  _decodeChunkPayload(payload) {
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    if (!parsed.transferId || !parsed.data) {
      throw new Error("Invalid chunk envelope");
    }
    return { transferId: parsed.transferId, data: this._fromBase64(parsed.data) };
  }

  _chunkData(data) {
    const chunks = [];
    for (let i = 0; i < data.length; i += this._protocolConfig.chunkSize) {
      chunks.push(data.slice(i, i + this._protocolConfig.chunkSize));
    }
    return chunks;
  }

  _reassembleChunks(chunks) {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  _toBase64(data) {
    if (typeof globalThis.btoa === "function") {
      let binary = "";
      for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
      return globalThis.btoa(binary);
    }
    return Buffer.from(data).toString("base64");
  }

  _fromBase64(base64) {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(base64);
      const result = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
      return result;
    }
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  _buildProtocolConfig(overrides) {
    const mtu = Math.max(23, overrides.mtu ?? CONFIG.MTU);
    const packetHeaderSize = Math.max(4, overrides.packetHeaderSize ?? 4);
    const chunkSize = Math.max(16, Math.min(overrides.chunkSize ?? CONFIG.CHUNK_SIZE, mtu - packetHeaderSize));
    return {
      mtu,
      packetHeaderSize,
      chunkSize,
      chunkDelayMs: Math.max(0, overrides.chunkDelayMs ?? CONFIG.CHUNK_DELAY_MS),
      ackTimeoutMs: Math.max(100, overrides.ackTimeoutMs ?? CONFIG.ACK_TIMEOUT_MS),
      reassemblyTimeoutMs: Math.max(1000, overrides.reassemblyTimeoutMs ?? CONFIG.REASSEMBLY_TIMEOUT_MS)
    };
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _waitForOutboundAck(transferId, clientId) {
    return new Promise((resolve, reject) => {
      const waiterKey = this._makeOutboundAckKey(clientId, transferId);
      const existing = this._pendingOutboundAcks.get(waiterKey);
      if (existing) {
        globalThis.clearTimeout(existing.timeout);
        existing.reject(new Error(`Superseded ACK waiter for ${transferId}`));
        this._pendingOutboundAcks.delete(waiterKey);
      }
      const timeout = globalThis.setTimeout(() => {
        this._pendingOutboundAcks.delete(waiterKey);
        reject(new Error(`ACK timeout for ${transferId} from ${clientId}`));
      }, this._protocolConfig.ackTimeoutMs);

      this._pendingOutboundAcks.set(waiterKey, { resolve, reject, timeout });
    });
  }

  _resolveOutboundAck(clientId, transferId) {
    const waiterKey = this._makeOutboundAckKey(clientId, transferId);
    const pending = this._pendingOutboundAcks.get(waiterKey);
    if (!pending) {
      return;
    }
    this._pendingOutboundAcks.delete(waiterKey);
    globalThis.clearTimeout(pending.timeout);
    pending.resolve();
  }

  _makeOutboundAckKey(clientId, transferId) {
    return `${clientId}:${transferId}`;
  }

  _rejectAllOutboundAcks(error) {
    for (const [, pending] of this._pendingOutboundAcks.entries()) {
      globalThis.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this._pendingOutboundAcks.clear();
  }
}

// ─── MockGATTBackend ─────────────────────────────────────────────────────────

/**
 * In-process mock backend for testing GATTServer without hardware.
 *
 * Usage:
 *   const backend = new MockGATTBackend();
 *   const server = new GATTServer({ backend });
 *   await server.startAdvertising();
 *
 *   // Simulate a client connecting:
 *   backend.simulateClientConnect("client-1");
 *
 *   // Simulate the client writing a packet to MESSAGE_TX:
 *   backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, packetBytes);
 *
 *   // Inspect what the server notified back:
 *   backend.notifications  // → [{ clientId, charUuid, data }]
 */
export class MockGATTBackend {
  constructor() {
    this.advertising = false;
    this.serviceUuid = null;
    this.localName = null;

    /** @type {Array<{clientId: string, charUuid: string, data: Uint8Array}>} */
    this.notifications = [];

    // Assigned by GATTServer._wireBackendCallbacks()
    this.onWriteRequest = null;
    this.onClientConnected = null;
    this.onClientDisconnected = null;
  }

  startAdvertising(serviceUuid, localName) {
    this.advertising = true;
    this.serviceUuid = serviceUuid;
    this.localName = localName;
    return Promise.resolve();
  }

  stopAdvertising() {
    this.advertising = false;
    return Promise.resolve();
  }

  notifyCharacteristic(clientId, charUuid, data) {
    this.notifications.push({ clientId, charUuid, data });
    return Promise.resolve();
  }

  /** Trigger onClientConnected as if a central just connected. */
  simulateClientConnect(clientId) {
    if (this.onClientConnected) this.onClientConnected(clientId);
  }

  /** Trigger onClientDisconnected as if a central just dropped. */
  simulateClientDisconnect(clientId) {
    if (this.onClientDisconnected) this.onClientDisconnected(clientId);
  }

  /**
   * Simulate a GATT write from a central to a characteristic.
   * @param {string}     clientId
   * @param {string}     charUuid
   * @param {Uint8Array} data
   */
  simulateWrite(clientId, charUuid, data) {
    if (this.onWriteRequest) this.onWriteRequest(clientId, charUuid, data);
  }
}

export default GATTServer;
