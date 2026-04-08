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
  DELIVERY_STATUS,
  STORE_EVENT_LOG,
  STORE_INBOX,
  STORE_OUTBOX,
  addToInbox,
  addToOutbox,
  appendEventLog,
  deleteFromInbox,
  idbGetAll,
  idbPut,
  markAsRead,
  rebuildMaterializedViewsFromEventLog,
  removeFromOutbox,
  updateOutboxStatus,
  clearAllData
} = await import("../../crypto/store.js");

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

(async () => {
  try {
    await clearAllData();

    await addToOutbox({ msgId: "o-1", body: "ciphertext" }, "peer-a", { sourceEventId: "evt-outbox-created-1" });
    await updateOutboxStatus("o-1", DELIVERY_STATUS.SENT, { countAttempt: true });
    await removeFromOutbox("o-1");

    await addToInbox(
      { msgId: "i-1", senderFp: "peer-b", content: "hello", type: "text", payload: {}, ts: 11, eventId: "evt-inbox-received-1" },
      { raw: "cipher" }
    );
    await markAsRead("i-1");
    await deleteFromInbox("i-1");

    const allEvents = await idbGetAll(STORE_EVENT_LOG);
    const queuedCreateEvent = allEvents.find((event) => event.eventId === "evt-outbox-created-1");
    assert(Boolean(queuedCreateEvent), "offline queue create must emit canonical outbox-created event");
    assert(queuedCreateEvent.type === "outbox-created", "offline queue create event type should be outbox-created");
    assert(allEvents.some((event) => event.type === "outbox-status-updated"), "outbox status transition must be logged");
    assert(allEvents.some((event) => event.type === "outbox-removed"), "outbox removal must be logged");
    assert(allEvents.some((event) => event.type === "inbox-read"), "inbox read must be logged");
    assert(allEvents.some((event) => event.type === "inbox-deleted"), "inbox delete must be logged");

    await idbPut(STORE_OUTBOX, {
      msgId: "corrupt-outbox",
      status: "broken"
    });
    await idbPut(STORE_INBOX, {
      msgId: "corrupt-inbox",
      read: false
    });

    const rebuilt = await rebuildMaterializedViewsFromEventLog();
    assert(rebuilt.outbox.length === 0, "rebuilt outbox should respect remove event");
    assert(rebuilt.inbox.length === 0, "rebuilt inbox should respect delete event");

    const outboxAfterRebuild = await idbGetAll(STORE_OUTBOX);
    const inboxAfterRebuild = await idbGetAll(STORE_INBOX);
    assert(outboxAfterRebuild.length === 0, "outbox corruption should be removed by replay");
    assert(inboxAfterRebuild.length === 0, "inbox corruption should be removed by replay");

    const duplicateCreate = {
      eventId: "evt-dup-outbox-create",
      type: "outbox-created",
      topic: "outbox",
      scope: "direct",
      ts: 100,
      lamport: 100,
      payload: {
        entry: {
          msgId: "dup-1",
          recipientFp: "peer-c",
          message: { msgId: "dup-1" },
          createdAt: 100,
          status: DELIVERY_STATUS.PENDING,
          attempts: 0,
          lastAttempt: null,
          schemaVersion: 4,
          sourceEventId: "evt-dup-outbox-create",
          priority: 0,
          ttl: null,
          linkId: null
        }
      }
    };

    const firstAppend = await appendEventLog(duplicateCreate);
    const secondAppend = await appendEventLog(duplicateCreate);
    assert(firstAppend.appended === true, "first duplicate event append should succeed");
    assert(secondAppend.appended === false, "second duplicate event append should be idempotent");

    await rebuildMaterializedViewsFromEventLog();
    const finalOutbox = await idbGetAll(STORE_OUTBOX);
    const dupRows = finalOutbox.filter((entry) => entry.msgId === "dup-1");
    assert(dupRows.length === 1, "duplicate outbox event ingest should project exactly one row");

    await addToOutbox({ msgId: "queued-persist-1", body: "ciphertext" }, "peer-d", {
      sourceEventId: "evt-queued-persist-1"
    });
    const preRebuildQueued = await idbGetAll(STORE_OUTBOX);
    assert(preRebuildQueued.some((entry) => entry.msgId === "queued-persist-1"), "queued message should exist before rebuild");

    await rebuildMaterializedViewsFromEventLog();
    const postRebuildQueued = await idbGetAll(STORE_OUTBOX);
    assert(
      postRebuildQueued.some((entry) => entry.msgId === "queued-persist-1" && entry.status === DELIVERY_STATUS.PENDING),
      "queued message should survive rebuild with pending status"
    );

    console.log("✓ integration: event-log replay is authoritative for outbox/inbox materialized views");
  } catch (error) {
    console.error("✗ integration: event-log replay is authoritative for outbox/inbox materialized views");
    console.error(error);
    process.exit(1);
  }
})();
