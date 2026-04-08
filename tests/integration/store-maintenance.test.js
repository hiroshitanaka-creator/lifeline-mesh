class InMemoryObjectStore {
  constructor(store) {
    this.store = store;
  }

  get(key) {
    return makeRequest(() => this.store.records.get(key));
  }

  put(value, key) {
    return makeRequest(() => {
      const primaryKey = key !== undefined
        ? key
        : this.store.keyPath
          ? value[this.store.keyPath]
          : undefined;
      this.store.records.set(primaryKey, globalThis.structuredClone(value));
      return primaryKey;
    });
  }

  getAll() {
    return makeRequest(() => [...this.store.records.values()].map((entry) => globalThis.structuredClone(entry)));
  }

  delete(key) {
    return makeRequest(() => {
      this.store.records.delete(key);
      return undefined;
    });
  }

  clear() {
    return makeRequest(() => {
      this.store.records.clear();
      return undefined;
    });
  }

  createIndex(name, keyPath) {
    this.store.indexes.set(name, { keyPath });
    return { name, keyPath };
  }

  index(name) {
    const indexDef = this.store.indexes.get(name);
    if (!indexDef) throw new Error(`Index not found: ${name}`);
    return {
      getAll: (value) => makeRequest(() => {
        const entries = [...this.store.records.values()];
        return entries
          .filter((entry) => entry[indexDef.keyPath] === value)
          .map((entry) => globalThis.structuredClone(entry));
      })
    };
  }

  openCursor() {
    const request = {};
    const keys = [...this.store.records.keys()];
    let cursorIndex = 0;
    const emit = () => {
      const key = keys[cursorIndex];
      if (key === undefined) {
        request.result = null;
        request.onsuccess?.({ target: request });
        return;
      }
      const cursor = {
        value: globalThis.structuredClone(this.store.records.get(key)),
        delete: () => {
          this.store.records.delete(key);
        },
        continue: () => {
          cursorIndex += 1;
          setTimeout(emit, 0);
        }
      };
      request.result = cursor;
      request.onsuccess?.({ target: request });
    };
    setTimeout(emit, 0);
    return request;
  }

  get indexNames() {
    return { contains: (name) => this.store.indexes.has(name) };
  }
}

class InMemoryTransaction {
  constructor(db, storeNames) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.error = null;
    setTimeout(() => this.oncomplete?.(), 0);
  }

  objectStore(name) {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`Object store not found: ${name}`);
    return new InMemoryObjectStore(store);
  }
}

class InMemoryDB {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }

  createObjectStore(name, options = {}) {
    const store = { keyPath: options.keyPath, records: new Map(), indexes: new Map() };
    this.stores.set(name, store);
    return new InMemoryObjectStore(store);
  }

  transaction(storeNames) {
    return new InMemoryTransaction(this, storeNames);
  }
}

const memoryDatabases = new Map();

function makeRequest(executor) {
  const request = {};
  setTimeout(() => {
    try {
      request.result = executor();
      request.onsuccess?.({ target: request });
    } catch (error) {
      request.error = error;
      request.onerror?.({ target: request });
    }
  }, 0);
  return request;
}

globalThis.indexedDB = {
  open(name, version) {
    const request = {};
    setTimeout(() => {
      const existing = memoryDatabases.get(name);
      const oldVersion = existing?.version || 0;
      const db = existing || new InMemoryDB(name, version);
      db.version = version;
      request.result = db;
      if (!existing || oldVersion < version) {
        request.transaction = new InMemoryTransaction(db, []);
        request.onupgradeneeded?.({ oldVersion, target: request });
      }
      memoryDatabases.set(name, db);
      request.onsuccess?.({ target: request });
    }, 0);
    return request;
  }
};

const {
  STORE_OUTBOX,
  STORE_SEEN,
  STORE_CHUNKS,
  addToOutbox,
  checkAndMarkSeen,
  storeChunk,
  runMaintenance,
  idbGetAll,
  clearAllData
} = await import("../../crypto/store.js");

async function seedStaleData(now) {
  await addToOutbox({ msgId: "expired" }, "fp", { ttl: now - 1 });
  await addToOutbox({ msgId: "valid-queued" }, "fp", { ttl: now + (90 * 24 * 60 * 60 * 1000) });
  await checkAndMarkSeen("seen-stale", "peer-1");
  await storeChunk({ msgId: "chunk-stale", seq: 0, total: 2, data: "aa" });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

(async () => {
  const originalNow = Date.now;
  try {
    const fixedNow = 1_700_000_000_000;
    Date.now = () => fixedNow;
    await clearAllData();
    await seedStaleData(fixedNow);

    Date.now = () => fixedNow + (31 * 24 * 60 * 60 * 1000);
    const result = await runMaintenance();
    assert(result.outboxPurged === 1, "expired outbox should be purged");
    assert(result.seenRemoved === 1, "old seen should be removed");
    assert(result.chunksRemoved === 1, "stale chunks should be removed");

    const [outbox, seen, chunks] = await Promise.all([
      idbGetAll(STORE_OUTBOX),
      idbGetAll(STORE_SEEN),
      idbGetAll(STORE_CHUNKS)
    ]);
    assert(outbox.length === 1, "maintenance should retain non-expired queued outbox entries");
    assert(outbox[0].msgId === "valid-queued", "maintenance should preserve valid queued message");
    assert(seen.length === 0, "seen should be empty after maintenance");
    assert(chunks.length === 0, "chunks should be empty after maintenance");
    console.log("✓ integration: runMaintenance purges stale outbox/seen/chunks deterministically");
  } catch (error) {
    console.error("✗ integration: runMaintenance purges stale outbox/seen/chunks deterministically");
    console.error(error);
    process.exit(1);
  } finally {
    Date.now = originalNow;
  }
})();
