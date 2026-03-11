/**
 * Lifeline Mesh - Optimized IndexedDB Storage
 *
 * Provides a write-through cache + batched-write layer on top of the
 * browser's IndexedDB API. Benefits:
 *
 * - Read cache: frequently accessed records are served from memory without
 *   hitting the disk. Cache is LRU-evicted when it exceeds MAX_CACHE_ENTRIES.
 * - Write batching: individual puts are queued and flushed together in a
 *   single transaction after a short delay (FLUSH_DELAY_MS). This reduces
 *   the number of transactions for burst writes (e.g. message sync).
 * - Simple Promise API: no callbacks or IDBRequest boilerplate for callers.
 *
 * Schema (object stores and their key paths):
 *   messages    — keyPath: "msgId"
 *   contacts    — keyPath: "fp"
 *   groups      — keyPath: "id"
 *   senderKeys  — keyPath: "groupId"   (one per group per version)
 *   identity    — keyPath: "key"       (singleton store for own keys)
 *
 * @module storage/optimized-db
 */

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = "lifeline-mesh";
const DB_VERSION = 1;

/** Object stores and their configuration */
const STORES = {
  messages: { keyPath: "msgId" },
  contacts: { keyPath: "fp" },
  groups: { keyPath: "id" },
  senderKeys: { keyPath: "groupId" },
  identity: { keyPath: "key" }
};

/** Maximum number of entries held in the read cache */
const MAX_CACHE_ENTRIES = 500;

/** Milliseconds to wait before flushing queued writes */
const FLUSH_DELAY_MS = 100;

// ============================================================================
// OptimizedDB
// ============================================================================

export class OptimizedDB {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;

    /**
     * In-memory read cache.
     * Key: `${storeName}:${recordKey}` → value
     * @type {Map<string, any>}
     */
    this._cache = new Map();

    /**
     * LRU eviction order — most-recently-used key is at the end.
     * @type {string[]}
     */
    this._lruOrder = [];

    /**
     * Pending writes that have not yet been flushed to IndexedDB.
     * @type {Array<{store: string, value: any, key?: IDBValidKey}>}
     */
    this._writeQueue = [];

    /** @type {ReturnType<typeof setTimeout>|null} */
    this._flushTimer = null;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Open (or create) the database.
   * Must be called once before any other operations.
   *
   * @returns {Promise<void>}
   */
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        for (const [name, options] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, options);
          }
        }
      };

      req.onsuccess = (event) => {
        this._db = /** @type {IDBOpenDBRequest} */ (event.target).result;
        resolve();
      };

      req.onerror = () => reject(new Error(`Failed to open database: ${req.error?.message}`));
    });
  }

  /**
   * Close the database and flush any pending writes first.
   * @returns {Promise<void>}
   */
  async close() {
    await this.flush();
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  // ============================================================================
  // Read Operations
  // ============================================================================

  /**
   * Get a record by key.
   *
   * @template T
   * @param {string} store - Object store name
   * @param {IDBValidKey} key - Record key
   * @returns {Promise<T|undefined>}
   */
  async get(store, key) {
    const cacheKey = `${store}:${String(key)}`;

    // Cache hit
    if (this._cache.has(cacheKey)) {
      this._touchLRU(cacheKey);
      return this._cache.get(cacheKey);
    }

    // Check write queue first (uncommitted write might have the latest value)
    const queued = this._findInQueue(store, key);
    if (queued !== undefined) {
      return queued;
    }

    // IndexedDB read
    const value = await this._idbGet(store, key);
    if (value !== undefined) {
      this._setCache(cacheKey, value);
    }
    return value;
  }

  /**
   * Get all records from a store.
   *
   * @template T
   * @param {string} store - Object store name
   * @returns {Promise<T[]>}
   */
  getAll(store) {
    return new Promise((resolve, reject) => {
      if (!this._db) { reject(new Error("Database not open")); return; }
      const tx = this._db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(`getAll failed: ${req.error?.message}`));
    });
  }

  /**
   * Get all records matching an index query.
   *
   * @template T
   * @param {string} store - Object store name
   * @param {string} indexName - Index name
   * @param {IDBValidKey|IDBKeyRange} query - Key or range to match
   * @returns {Promise<T[]>}
   */
  getByIndex(store, indexName, query) {
    return new Promise((resolve, reject) => {
      if (!this._db) { reject(new Error("Database not open")); return; }
      const tx = this._db.transaction(store, "readonly");
      const idx = tx.objectStore(store).index(indexName);
      const req = idx.getAll(query);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(`getByIndex failed: ${req.error?.message}`));
    });
  }

  // ============================================================================
  // Write Operations
  // ============================================================================

  /**
   * Put (insert or update) a record.
   * The write is cached immediately and flushed after FLUSH_DELAY_MS.
   *
   * @param {string} store - Object store name
   * @param {any} value - Record to store
   * @param {IDBValidKey} [key] - Explicit key (required when store has no keyPath)
   * @returns {void}
   */
  put(store, value, key) {
    // Update read cache immediately
    const recordKey = key !== undefined ? key : this._extractKey(store, value);
    if (recordKey !== undefined) {
      const cacheKey = `${store}:${String(recordKey)}`;
      this._setCache(cacheKey, value);
    }

    // Queue write
    this._writeQueue.push({ store, value, key });
    this._scheduleFlush();
  }

  /**
   * Delete a record by key.
   * The deletion is applied to the cache immediately and flushed shortly after.
   *
   * @param {string} store - Object store name
   * @param {IDBValidKey} key - Record key
   * @returns {void}
   */
  delete(store, key) {
    // Invalidate cache
    const cacheKey = `${store}:${String(key)}`;
    this._evictCache(cacheKey);

    // Queue deletion (sentinel: value = null, key provided)
    this._writeQueue.push({ store, value: null, key, _delete: true });
    this._scheduleFlush();
  }

  /**
   * Flush all pending writes to IndexedDB immediately.
   * Returns a Promise that resolves once the transaction commits.
   *
   * @returns {Promise<void>}
   */
  flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    return this._flushNow();
  }

  // ============================================================================
  // Cache Invalidation
  // ============================================================================

  /**
   * Evict a single entry from the cache.
   * @param {string} cacheKey
   */
  _evictCache(cacheKey) {
    this._cache.delete(cacheKey);
    const idx = this._lruOrder.indexOf(cacheKey);
    if (idx !== -1) this._lruOrder.splice(idx, 1);
  }

  /**
   * Add or update a cache entry, evicting LRU entries when over limit.
   * @private
   */
  _setCache(cacheKey, value) {
    if (this._cache.has(cacheKey)) {
      this._touchLRU(cacheKey);
    } else {
      this._lruOrder.push(cacheKey);
      // Evict oldest entries if over limit
      while (this._lruOrder.length > MAX_CACHE_ENTRIES) {
        const oldest = this._lruOrder.shift();
        this._cache.delete(oldest);
      }
    }
    this._cache.set(cacheKey, value);
  }

  /**
   * Move a cache key to the most-recently-used position.
   * @private
   */
  _touchLRU(cacheKey) {
    const idx = this._lruOrder.indexOf(cacheKey);
    if (idx !== -1) {
      this._lruOrder.splice(idx, 1);
      this._lruOrder.push(cacheKey);
    }
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Schedule a deferred flush if one is not already pending.
   * @private
   */
  _scheduleFlush() {
    if (this._flushTimer !== null) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this._flushNow().catch((err) => {
        console.error("[OptimizedDB] Flush error:", err);
      });
    }, FLUSH_DELAY_MS);
  }

  /**
   * Write all queued operations to IndexedDB in a single transaction per store.
   * @private
   * @returns {Promise<void>}
   */
  async _flushNow() {
    if (this._writeQueue.length === 0) return;

    const batch = this._writeQueue.splice(0); // drain queue atomically
    if (!this._db) return;

    // Group operations by store
    const byStore = new Map();
    for (const op of batch) {
      if (!byStore.has(op.store)) byStore.set(op.store, []);
      byStore.get(op.store).push(op);
    }

    // One transaction per store (IndexedDB allows multi-store transactions too
    // but we keep it simple and correct for now)
    const promises = [];
    for (const [store, ops] of byStore) {
      promises.push(this._commitBatch(store, ops));
    }
    await Promise.all(promises);
  }

  /**
   * @private
   */
  _commitBatch(store, ops) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, "readwrite");
      const os = tx.objectStore(store);

      for (const op of ops) {
        if (op._delete) {
          os.delete(op.key);
        } else if (op.key !== undefined) {
          os.put(op.value, op.key);
        } else {
          os.put(op.value);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction error: ${tx.error?.message}`));
      tx.onabort = () => reject(new Error("Transaction aborted"));
    });
  }

  /**
   * Direct IndexedDB get (bypasses cache).
   * @private
   */
  _idbGet(store, key) {
    return new Promise((resolve, reject) => {
      if (!this._db) { reject(new Error("Database not open")); return; }
      const tx = this._db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(`get failed: ${req.error?.message}`));
    });
  }

  /**
   * Find the most recently queued (not-yet-flushed) value for a key.
   * @private
   */
  _findInQueue(store, key) {
    const keyStr = String(key);
    // Iterate in reverse to get the most recent write
    for (let i = this._writeQueue.length - 1; i >= 0; i--) {
      const op = this._writeQueue[i];
      if (op.store !== store) continue;
      if (op._delete) {
        const opKey = op.key !== undefined ? String(op.key) : String(this._extractKey(store, op.value));
        if (opKey === keyStr) return undefined; // deleted
      } else {
        const opKey = op.key !== undefined ? String(op.key) : String(this._extractKey(store, op.value));
        if (opKey === keyStr) return op.value;
      }
    }
    return undefined; // not in queue
  }

  /**
   * Extract the key from a record using the store's keyPath.
   * @private
   */
  _extractKey(store, value) {
    const config = STORES[store];
    if (!config || !config.keyPath || !value) return undefined;
    return value[config.keyPath];
  }

  // ============================================================================
  // Diagnostics
  // ============================================================================

  /**
   * Return a snapshot of current storage state (for debugging/UI).
   * @returns {{cacheSize: number, pendingWrites: number, isOpen: boolean}}
   */
  getStatus() {
    return {
      cacheSize: this._cache.size,
      pendingWrites: this._writeQueue.length,
      isOpen: this._db !== null
    };
  }
}

// Singleton for the application
export const db = new OptimizedDB();
