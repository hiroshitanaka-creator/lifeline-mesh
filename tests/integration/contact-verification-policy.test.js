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

  clear() {
    return makeRequest(() => {
      this.store.records.clear();
      return undefined;
    });
  }

  delete(key) {
    return makeRequest(() => {
      this.store.records.delete(key);
      return undefined;
    });
  }

  createIndex(name, keyPath) {
    this.store.indexes.set(name, { keyPath });
    return { name, keyPath };
  }

  index(name) {
    const indexDef = this.store.indexes.get(name);
    if (!indexDef) {
      throw new Error(`Index not found: ${name}`);
    }
    return {
      getAll: (value) => makeRequest(() => {
        const entries = [...this.store.records.values()];
        return entries
          .filter((entry) => entry[indexDef.keyPath] === value)
          .map((entry) => globalThis.structuredClone(entry));
      })
    };
  }

  get indexNames() {
    return {
      contains: (name) => this.store.indexes.has(name)
    };
  }
}

class InMemoryTransaction {
  constructor(db, storeNames) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.error = null;
    setTimeout(() => {
      if (typeof this.oncomplete === "function") {
        this.oncomplete();
      }
    }, 0);
  }

  objectStore(name) {
    const store = this.db.stores.get(name);
    if (!store) {
      throw new Error(`Object store not found: ${name}`);
    }
    return new InMemoryObjectStore(store);
  }
}

class InMemoryDB {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name)
    };
  }

  createObjectStore(name, options = {}) {
    const store = {
      keyPath: options.keyPath,
      records: new Map(),
      indexes: new Map()
    };
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
        const tx = new InMemoryTransaction(db, []);
        request.transaction = tx;
        request.onupgradeneeded?.({
          oldVersion,
          target: request
        });
      }
      memoryDatabases.set(name, db);
      request.onsuccess?.({ target: request });
    }, 0);
    return request;
  },
  deleteDatabase(name) {
    memoryDatabases.delete(name);
    return makeRequest(() => undefined);
  }
};

const {
  VERIFICATION_STATUS,
  clearAllData,
  getContact,
  markContactCompromised,
  saveContact,
  verifyContact
} = await import("../../crypto/store.js");

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function resetStore() {
  await clearAllData();
}

function createContact(overrides = {}) {
  return {
    fp: overrides.fp || "contact-fp-1",
    name: "Contact One",
    signPK: "signpk",
    boxPK: "boxpk",
    ...overrides
  };
}

test("integration: saveContact stores unverified by default", async () => {
  await resetStore();
  const fp = "verify-default-fp";
  await saveContact(createContact({ fp }));
  const stored = await getContact(fp);
  if (!stored) throw new Error("Expected contact to be stored");
  if (stored.verified !== VERIFICATION_STATUS.UNVERIFIED) {
    throw new Error(`Expected unverified, got ${stored.verified}`);
  }
});

test("integration: verifyContact sets verified and verifiedAt", async () => {
  await resetStore();
  const fp = "verify-transition-fp";
  await saveContact(createContact({ fp }));
  await verifyContact(fp);
  const stored = await getContact(fp);
  if (!stored) throw new Error("Expected contact to exist after verify");
  if (stored.verified !== VERIFICATION_STATUS.VERIFIED) {
    throw new Error(`Expected verified, got ${stored.verified}`);
  }
  if (!Number.isFinite(stored.verifiedAt)) {
    throw new Error("Expected verifiedAt to be populated");
  }
});

test("integration: markContactCompromised sets compromised fields", async () => {
  await resetStore();
  const fp = "compromised-transition-fp";
  const reason = "manual-key-mismatch";
  await saveContact(createContact({ fp }));
  await markContactCompromised(fp, reason);
  const stored = await getContact(fp);
  if (!stored) throw new Error("Expected contact to exist after compromised");
  if (stored.verified !== VERIFICATION_STATUS.COMPROMISED) {
    throw new Error(`Expected compromised, got ${stored.verified}`);
  }
  if (!Number.isFinite(stored.compromisedAt)) {
    throw new Error("Expected compromisedAt to be populated");
  }
  if (stored.compromisedReason !== reason) {
    throw new Error(`Expected compromisedReason '${reason}', got '${stored.compromisedReason}'`);
  }
});

test("integration: saveContact update preserves existing verification state", async () => {
  await resetStore();
  const fp = "preserve-verification-fp";
  await saveContact(createContact({ fp }));
  await verifyContact(fp);
  await saveContact(createContact({ fp, name: "Renamed Contact" }));
  const stored = await getContact(fp);
  if (!stored) throw new Error("Expected contact to exist after update");
  if (stored.name !== "Renamed Contact") {
    throw new Error(`Expected updated name, got '${stored.name}'`);
  }
  if (stored.verified !== VERIFICATION_STATUS.VERIFIED) {
    throw new Error(`Expected verified to persist after update, got ${stored.verified}`);
  }
});

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
