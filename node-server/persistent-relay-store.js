import fs from "fs/promises";
import path from "path";

/**
 * Minimal file-backed message store for node-server relay mode.
 *
 * Schema:
 * {
 *   version: 1,
 *   entries: [
 *     {
 *       id, msgId, message,
 *       ingressClientId,
 *       status: "pending" | "delivered",
 *       attempts,
 *       createdAt,
 *       updatedAt,
 *       deliveredAt,
 *       deliveredTo,
 *       lastError
 *     }
 *   ]
 * }
 */
export class FileRelayStore {
  constructor(options = {}) {
    this.filePath = options.filePath || path.resolve(process.cwd(), "node-server/data/relay-store.json");
    this.dedupeWindowMs = Number(options.dedupeWindowMs) > 0 ? Number(options.dedupeWindowMs) : 10 * 60 * 1000;
    this.deliveredRetentionMs = Number(options.deliveredRetentionMs) > 0
      ? Number(options.deliveredRetentionMs)
      : 7 * 24 * 60 * 60 * 1000;
    this.pendingRetentionMs = Number(options.pendingRetentionMs) > 0
      ? Number(options.pendingRetentionMs)
      : 30 * 24 * 60 * 60 * 1000;
    this._loaded = false;
    this._state = { version: 1, entries: [] };
    this._cleanupStats = {
      lastRunAt: null,
      removedPending: 0,
      removedDelivered: 0
    };
  }

  async init() {
    if (this._loaded) return;

    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        this._state = {
          version: Number(parsed.version) || 1,
          entries: parsed.entries.map((entry) => this._normalizeEntry(entry))
        };
      }
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
      await this._persist();
    }

    this._loaded = true;
    await this._cleanupLoadedState();
  }

  async addInboundMessage(message, ingressClientId) {
    await this.init();
    await this.cleanup();

    const msgId = message?.msgId || `relay:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const existing = this._state.entries.find((entry) => entry.msgId === msgId && entry.status === "pending");
    if (existing) {
      return existing;
    }
    const now = Date.now();
    const recentDelivered = this._state.entries.find((entry) => (
      entry.msgId === msgId
      && entry.status === "delivered"
      && typeof entry.deliveredAt === "number"
      && (now - entry.deliveredAt) <= this.dedupeWindowMs
    ));
    if (recentDelivered) {
      return recentDelivered;
    }

    const entry = {
      id: `${msgId}:${now}`,
      msgId,
      message,
      ingressClientId: ingressClientId || "unknown",
      status: "pending",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      deliveredAt: null,
      deliveredTo: null,
      lastError: null
    };

    this._state.entries.push(entry);
    await this._persist();
    return entry;
  }

  async listPending() {
    await this.init();
    return this._state.entries
      .filter((entry) => entry.status === "pending")
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async markDelivered(id, clientId) {
    await this.init();
    const entry = this._state.entries.find((row) => row.id === id);
    if (!entry) return;

    const now = Date.now();
    entry.status = "delivered";
    entry.deliveredTo = clientId;
    entry.deliveredAt = now;
    entry.updatedAt = now;
    entry.lastError = null;
    await this._persist();
  }

  async markSendFailed(id, error) {
    await this.init();
    const entry = this._state.entries.find((row) => row.id === id);
    if (!entry) return;

    entry.attempts = (entry.attempts || 0) + 1;
    entry.lastError = error instanceof Error ? error.message : String(error);
    entry.updatedAt = Date.now();
    await this._persist();
  }

  async getSnapshot() {
    await this.init();
    const pendingCount = this._state.entries.filter((entry) => entry.status === "pending").length;
    const deliveredCount = this._state.entries.filter((entry) => entry.status === "delivered").length;
    return {
      filePath: this.filePath,
      totalEntries: this._state.entries.length,
      pendingCount,
      deliveredCount,
      retention: {
        dedupeWindowMs: this.dedupeWindowMs,
        deliveredRetentionMs: this.deliveredRetentionMs,
        pendingRetentionMs: this.pendingRetentionMs
      },
      cleanup: {
        ...this._cleanupStats
      }
    };
  }

  async cleanup(now = Date.now()) {
    await this.init();
    return this._cleanupLoadedState(now);
  }

  async _cleanupLoadedState(now = Date.now()) {
    const before = this._state.entries.length;
    const removed = {
      pending: 0,
      delivered: 0
    };

    this._state.entries = this._state.entries.filter((entry) => {
      if (entry.status === "pending" && typeof entry.createdAt === "number" && (now - entry.createdAt) > this.pendingRetentionMs) {
        removed.pending += 1;
        return false;
      }
      if (entry.status === "delivered" && typeof entry.deliveredAt === "number" && (now - entry.deliveredAt) > this.deliveredRetentionMs) {
        removed.delivered += 1;
        return false;
      }
      return true;
    });

    this._cleanupStats.lastRunAt = now;
    this._cleanupStats.removedPending += removed.pending;
    this._cleanupStats.removedDelivered += removed.delivered;

    if (this._state.entries.length !== before) {
      await this._persist();
    }

    return {
      removedPending: removed.pending,
      removedDelivered: removed.delivered,
      remainingEntries: this._state.entries.length
    };
  }

  _normalizeEntry(entry) {
    const now = Date.now();
    return {
      id: entry?.id || `${entry?.msgId || `relay:${now}`}:${now}`,
      msgId: entry?.msgId || `relay:${now}:${Math.random().toString(16).slice(2)}`,
      message: entry?.message ?? null,
      ingressClientId: entry?.ingressClientId || "unknown",
      status: entry?.status === "delivered" ? "delivered" : "pending",
      attempts: Number(entry?.attempts) || 0,
      createdAt: Number(entry?.createdAt) || now,
      updatedAt: Number(entry?.updatedAt) || Number(entry?.createdAt) || now,
      deliveredAt: typeof entry?.deliveredAt === "number" ? entry.deliveredAt : null,
      deliveredTo: entry?.deliveredTo ?? null,
      lastError: entry?.lastError ?? null
    };
  }

  async _persist() {
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(this._state, null, 2), "utf8");
    await fs.rename(tmpPath, this.filePath);
  }
}

export default FileRelayStore;
