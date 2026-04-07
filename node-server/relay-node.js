/**
 * Lifeline Mesh - Multi-Client Relay Node
 *
 * Supports multiple concurrent BLE/LoRa clients with LevelDB-backed
 * persistent message store (replaces single-client + file-based store).
 *
 * Design:
 *   - Any number of clients can be connected simultaneously
 *   - Inbound messages are fanned out to all OTHER connected clients
 *   - Messages are persisted in LevelDB until TTL expires or explicit cleanup
 *   - LevelDB is used as a lightweight embedded store (no Redis required)
 *   - bleno GATT peripheral and Chrome-extension-compatible backend are
 *     separated via the IGATTBackend interface (see bluetooth/ble-manager.js)
 */

import { EventEmitter } from "events";

// ─── LevelDB Store ───────────────────────────────────────────────────────────

/**
 * LevelDB-backed relay message store.
 *
 * Message key format: `msg:<ts_padded>:<msgId>` (lexicographically sortable by time)
 * Client index key:   `client:<clientId>:<msgId>`
 *
 * Requires `level` npm package (>=8.0.0).
 * Gracefully falls back to in-memory Map when LevelDB is unavailable.
 */
export class LevelDBRelayStore {
  /**
   * @param {Object} [options]
   * @param {string}  [options.path]    - LevelDB directory path (default: "./relay-db")
   * @param {number}  [options.ttlMs]   - Message TTL in ms (default: 7 days)
   * @param {boolean} [options.inMemory] - Use in-memory fallback (for testing)
   */
  constructor(options = {}) {
    this.path = options.path ?? "./relay-db";
    this.ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    this.inMemory = options.inMemory ?? false;
    this._db = null;
    this._memStore = new Map(); // in-memory fallback
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    if (this.inMemory) {
      this._initialized = true;
      return;
    }

    try {
      const { Level } = await import("level");
      this._db = new Level(this.path, { valueEncoding: "json" });
      await this._db.open();
      this._initialized = true;
    } catch (err) {
      console.warn(
        `[LevelDBRelayStore] LevelDB unavailable (${err.message}), using in-memory fallback`
      );
      this._initialized = true;
    }
  }

  _msgKey(ts, msgId) {
    // Zero-pad timestamp to 16 digits for lexicographic sort
    return `msg:${String(ts).padStart(16, "0")}:${msgId}`;
  }

  _clientKey(clientId, msgId) {
    return `delivered:${clientId}:${msgId}`;
  }

  /**
   * Persist an inbound message.
   * @param {Object} message
   * @param {string} clientId - Originating client
   * @returns {Promise<{ id: string, msgId: string, ts: number }>}
   */
  async addInboundMessage(message, clientId) {
    const ts = Date.now();
    const msgId = message.msgId || `relay-${ts}-${Math.random().toString(36).slice(2)}`;
    const entry = {
      id: this._msgKey(ts, msgId),
      msgId,
      message,
      originClientId: clientId,
      receivedAt: ts,
      expiresAt: ts + this.ttlMs,
      deliveredTo: {}
    };

    if (this._db) {
      await this._db.put(entry.id, entry);
    } else {
      this._memStore.set(entry.id, entry);
    }

    return { id: entry.id, msgId, ts };
  }

  /**
   * List all pending messages not yet delivered to a specific client.
   * @param {string} [clientId] - If provided, exclude messages from this client
   *   and messages already delivered to it.
   * @returns {Promise<Array>}
   */
  async listPending(clientId = null) {
    const now = Date.now();
    const results = [];

    if (this._db) {
      const iter = this._db.iterator({ gte: "msg:", lte: "msg:~" });
      for await (const [, entry] of iter) {
        if (entry.expiresAt < now) continue;
        if (clientId && entry.originClientId === clientId) continue;
        if (clientId && entry.deliveredTo[clientId]) continue;
        results.push(entry);
      }
    } else {
      for (const entry of this._memStore.values()) {
        if (!entry.id.startsWith("msg:")) continue;
        if (entry.expiresAt < now) continue;
        if (clientId && entry.originClientId === clientId) continue;
        if (clientId && entry.deliveredTo[clientId]) continue;
        results.push(entry);
      }
    }

    // Sort by receivedAt ascending (FIFO delivery)
    results.sort((a, b) => a.receivedAt - b.receivedAt);
    return results;
  }

  /**
   * Mark a message as delivered to a specific client.
   * @param {string} id - Entry ID
   * @param {string} clientId
   */
  async markDelivered(id, clientId) {
    let entry;
    if (this._db) {
      try { entry = await this._db.get(id); } catch { return; }
    } else {
      entry = this._memStore.get(id);
    }
    if (!entry) return;

    entry.deliveredTo[clientId] = Date.now();

    if (this._db) {
      await this._db.put(id, entry);
    } else {
      this._memStore.set(id, entry);
    }
  }

  /**
   * Mark a message send as failed (for retry tracking).
   * @param {string} id
   * @param {Error} error
   */
  async markSendFailed(id, error) {
    let entry;
    if (this._db) {
      try { entry = await this._db.get(id); } catch { return; }
    } else {
      entry = this._memStore.get(id);
    }
    if (!entry) return;

    entry.lastError = error instanceof Error ? error.message : String(error);
    entry.lastErrorAt = Date.now();

    if (this._db) {
      await this._db.put(id, entry);
    } else {
      this._memStore.set(id, entry);
    }
  }

  /**
   * Remove expired messages and fully-delivered messages.
   * @returns {Promise<{ removedExpired: number, removedDelivered: number }>}
   */
  async cleanup() {
    const now = Date.now();
    let removedExpired = 0;
    let removedDelivered = 0;

    const toDelete = [];

    if (this._db) {
      const iter = this._db.iterator({ gte: "msg:", lte: "msg:~" });
      for await (const [key, entry] of iter) {
        if (entry.expiresAt < now) {
          toDelete.push(key);
          removedExpired++;
        }
      }
      if (toDelete.length > 0) {
        await this._db.batch(toDelete.map((k) => ({ type: "del", key: k })));
      }
    } else {
      for (const [key, entry] of this._memStore.entries()) {
        if (!key.startsWith("msg:")) continue;
        if (entry.expiresAt < now) {
          this._memStore.delete(key);
          removedExpired++;
        }
      }
    }

    return { removedExpired, removedDelivered, removedPending: removedExpired };
  }

  /**
   * Snapshot for diagnostics.
   */
  async getSnapshot() {
    const pending = await this.listPending();
    return {
      pendingCount: pending.length,
      backend: this._db ? "leveldb" : "in-memory",
      path: this.path
    };
  }

  async close() {
    if (this._db) {
      await this._db.close().catch(() => {});
      this._db = null;
    }
  }
}

// ─── MultiClientRelayNode ────────────────────────────────────────────────────

/**
 * Multi-client relay coordinator.
 *
 * Unlike SingleClientRelayNode, this supports any number of simultaneous
 * BLE/LoRa clients and fans out messages to all connected peers except
 * the originating sender.
 *
 * The GATT peripheral backend (bleno) is separated from the Chrome Extension
 * compatible backend via the `server` interface:
 *   server.sendMessage(message, clientId) → Promise<void>
 *   server.getSnapshot() → Object
 *   server.getConnectedClients() → string[]
 */
export class MultiClientRelayNode extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.server   - GATTServer instance
   * @param {Object} options.store    - LevelDBRelayStore instance
   * @param {Object} [options.logger] - Logger (default: console)
   * @param {boolean} [options.diagnosticsEnabled]
   * @param {boolean} [options.fanoutEnabled] - Fan out to all connected clients (default: true)
   */
  constructor({
    server,
    store,
    logger = console,
    diagnosticsEnabled = false,
    fanoutEnabled = true
  } = {}) {
    super();

    if (!server) throw new Error("MultiClientRelayNode requires a server instance");
    if (!store) throw new Error("MultiClientRelayNode requires a store instance");

    this.server = server;
    this.store = store;
    this.logger = logger;
    this.diagnosticsEnabled = diagnosticsEnabled;
    this.fanoutEnabled = fanoutEnabled;

    /** @type {Map<string, { connectedAt: number, flushPromise: Promise|null }>} */
    this._clients = new Map();

    this.cleanupIntervalMs = 60 * 1000;
    this.cleanupTimer = null;
  }

  async init() {
    await this.store.init();
    await this.runCleanup("startup");
    this.startCleanupLoop();
    this._diag("MultiClientRelayNode initialized");
  }

  /**
   * Called when a new client connects.
   * Replays all pending messages not yet delivered to this client.
   * @param {string} clientId
   */
  async onClientConnected(clientId) {
    this.logger.log(`[MultiRelayNode] client connected: ${clientId}`);
    this._clients.set(clientId, { connectedAt: Date.now(), flushPromise: null });
    this.emit("client:connected", clientId);
    await this.flushPending(clientId);
  }

  /**
   * Called when a client disconnects.
   * @param {string} clientId
   */
  onClientDisconnected(clientId) {
    this.logger.log(`[MultiRelayNode] client disconnected: ${clientId}`);
    this._clients.delete(clientId);
    this.emit("client:disconnected", clientId);
  }

  /**
   * Handle an inbound message from a client.
   * - Persists to LevelDB
   * - Fans out to all other connected clients (if fanoutEnabled)
   * - Emits "message" event
   *
   * @param {Object} message
   * @param {string} clientId - Originating client
   */
  async onInboundMessage(message, clientId) {
    const entry = await this.store.addInboundMessage(message, clientId);
    this.logger.log(
      `[MultiRelayNode] queued message ${entry.msgId} from ${clientId}`
    );
    this.emit("message", { message, clientId, msgId: entry.msgId });

    if (this.fanoutEnabled) {
      await this._fanout(message, entry, clientId);
    }
  }

  /**
   * Fan out a message to all currently connected clients except the originator.
   * @param {Object} message
   * @param {{ id: string, msgId: string }} entry
   * @param {string} originClientId
   */
  async _fanout(message, entry, originClientId) {
    const targets = [];
    for (const [clientId] of this._clients.entries()) {
      if (clientId !== originClientId) targets.push(clientId);
    }

    this._diag(`fanout msgId=${entry.msgId} to ${targets.length} peers`);

    await Promise.allSettled(
      targets.map(async (clientId) => {
        try {
          await this.server.sendMessage(message, clientId);
          await this.store.markDelivered(entry.id, clientId);
          this.logger.log(
            `[MultiRelayNode] fanned out ${entry.msgId} to ${clientId}`
          );
        } catch (err) {
          await this.store.markSendFailed(entry.id, err);
          this.logger.warn(
            `[MultiRelayNode] fanout failed for ${entry.msgId} to ${clientId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      })
    );
  }

  /**
   * Replay all pending messages to a newly connected client.
   * Serialized per-client (one flush at a time per client).
   * @param {string} clientId
   */
  async flushPending(clientId) {
    const clientState = this._clients.get(clientId);
    if (!clientState) return;

    if (clientState.flushPromise) {
      await clientState.flushPromise;
      return;
    }

    clientState.flushPromise = (async () => {
      const pending = await this.store.listPending(clientId);
      this._diag(`flush start client=${clientId} pending=${pending.length}`);

      for (const entry of pending) {
        try {
          await this.server.sendMessage(entry.message, clientId);
          await this.store.markDelivered(entry.id, clientId);
          this.logger.log(
            `[MultiRelayNode] replayed ${entry.msgId} to ${clientId}`
          );
        } catch (err) {
          await this.store.markSendFailed(entry.id, err);
          this.logger.warn(
            `[MultiRelayNode] replay failed ${entry.msgId} to ${clientId}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          // Do NOT break — continue replaying other messages
        }
      }
      this._diag(`flush done client=${clientId}`);
    })();

    try {
      await clientState.flushPromise;
    } finally {
      if (clientState) clientState.flushPromise = null;
    }
  }

  /** @returns {number} Number of currently connected clients */
  get connectedCount() {
    return this._clients.size;
  }

  /** @returns {string[]} IDs of currently connected clients */
  getConnectedClients() {
    return [...this._clients.keys()];
  }

  async getSnapshot() {
    const serverSnap = this.server.getSnapshot ? this.server.getSnapshot() : {};
    const storeSnap = await this.store.getSnapshot();
    return {
      mode: "multi-client-relay",
      connectedClients: this.getConnectedClients(),
      connectedCount: this.connectedCount,
      server: serverSnap,
      store: storeSnap
    };
  }

  startCleanupLoop() {
    if (this.cleanupTimer || !this.cleanupIntervalMs || this.cleanupIntervalMs <= 0) {
      return;
    }
    this.cleanupTimer = globalThis.setInterval(() => {
      this.runCleanup("interval").catch((err) => {
        this.logger.warn(
          `[MultiRelayNode] cleanup failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, this.cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  async runCleanup(reason = "manual") {
    if (!this.store?.cleanup) return null;
    const result = await this.store.cleanup();
    this._diag(
      `cleanup reason=${reason} removedExpired=${result.removedExpired ?? 0}`
    );
    if ((result.removedExpired ?? 0) > 0) {
      this.logger.log(
        `[MultiRelayNode] cleanup(${reason}) removed ${result.removedExpired} expired messages`
      );
    }
    return result;
  }

  close() {
    if (this.cleanupTimer) {
      globalThis.clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.store?.close) {
      this.store.close().catch(() => {});
    }
  }

  _diag(msg) {
    if (this.diagnosticsEnabled) {
      this.logger.log(`[MultiRelayNode][diag] ${msg}`);
    }
  }
}

// ─── Legacy single-client relay (preserved for backwards compatibility) ──────

/**
 * Single-client relay coordinator for node-server.
 *
 * @deprecated Use MultiClientRelayNode instead.
 *
 * Truthful design constraints:
 * - Only one active BLE central client at a time (enforced by GATTServer/backend).
 * - Received messages are persisted as pending relay entries.
 * - Pending entries are replayed only when a client connection exists.
 */
export class SingleClientRelayNode {
  constructor({ server, store, logger = console, diagnosticsEnabled = false } = {}) {
    if (!server) {
      throw new Error("SingleClientRelayNode requires a GATTServer instance");
    }
    if (!store) {
      throw new Error("SingleClientRelayNode requires a persistent store instance");
    }

    this.server = server;
    this.store = store;
    this.logger = logger;
    this.diagnosticsEnabled = diagnosticsEnabled;
    this.flushPromise = null;
    this.cleanupIntervalMs = 60 * 1000;
    this.cleanupTimer = null;
  }

  async init() {
    await this.store.init();
    await this.runCleanup("startup");
    this.startCleanupLoop();
  }

  async onInboundMessage(message, clientId) {
    const entry = await this.store.addInboundMessage(message, clientId);
    this.logger.log(
      `[RelayNode] queued inbound message ${entry.msgId} from ${clientId}; awaiting next connected client for replay`
    );
  }

  async onClientConnected(clientId) {
    this.logger.log(`[RelayNode] client connected ${clientId}; replaying pending messages`);
    await this.flushPending(clientId);
  }

  async flushPending(clientId) {
    if (!clientId) return;

    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    this.flushPromise = (async () => {
      const pending = await this.store.listPending();
      this._diag(`flush start client=${clientId} pending=${pending.length}`);
      for (const entry of pending) {
        try {
          await this.server.sendMessage(entry.message, clientId);
          await this.store.markDelivered(entry.id, clientId);
          this.logger.log(`[RelayNode] replayed pending message ${entry.msgId} to ${clientId}`);
          this._diag(`flush delivered msgId=${entry.msgId} client=${clientId}`);
        } catch (error) {
          await this.store.markSendFailed(entry.id, error);
          this.logger.warn(
            `[RelayNode] replay failed for ${entry.msgId} to ${clientId}: ${error instanceof Error ? error.message : String(error)}`
          );
          this._diag(`flush failed msgId=${entry.msgId} client=${clientId}`);
          break;
        }
      }
      this._diag(`flush done client=${clientId}`);
    })();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  async getSnapshot() {
    const serverSnap = this.server.getSnapshot();
    const storeSnap = await this.store.getSnapshot();
    return {
      mode: "single-client-relay",
      server: serverSnap,
      store: storeSnap
    };
  }

  startCleanupLoop() {
    if (this.cleanupTimer || !this.cleanupIntervalMs || this.cleanupIntervalMs <= 0) {
      return;
    }
    this.cleanupTimer = globalThis.setInterval(() => {
      this.runCleanup("interval").catch((error) => {
        this.logger.warn(`[RelayNode] cleanup interval failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, this.cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  async runCleanup(reason = "manual") {
    if (!this.store?.cleanup) {
      return null;
    }
    const result = await this.store.cleanup();
    this._diag(`cleanup reason=${reason} removedPending=${result.removedPending} removedDelivered=${result.removedDelivered}`);
    if (result.removedPending > 0 || result.removedDelivered > 0) {
      this.logger.log(
        `[RelayNode] cleanup(${reason}) removed pending=${result.removedPending}, delivered=${result.removedDelivered}`
      );
    }
    return result;
  }

  close() {
    if (this.cleanupTimer) {
      globalThis.clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  _diag(message) {
    if (!this.diagnosticsEnabled) return;
    this.logger.log(`[RelayNode][diag] ${message}`);
  }
}

export default SingleClientRelayNode;
