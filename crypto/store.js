/**
 * Lifeline Mesh - Message Store Module (v1.1)
 *
 * IndexedDB-based storage for delay-tolerant networking:
 * - outbox: Messages pending delivery
 * - inbox: Received messages
 * - seen: Deduplication cache (msgId + senderFp)
 * - contacts: Extended with verification status
 *
 * Can be used in both browser and Node.js environments (with IndexedDB polyfill).
 */

// ============================================================================
// Constants
// ============================================================================

export const DB_NAME = "lifelineMeshV2";
export const DB_VERSION = 5;

// Store names
export const STORE_KEYS = "keys";
export const STORE_CONTACTS = "contacts";
export const STORE_OUTBOX = "outbox";
export const STORE_INBOX = "inbox";
export const STORE_SEEN = "seen";
export const STORE_CHUNKS = "chunks"; // Partial chunk reassembly
export const STORE_GROUPS = "groups";
export const STORE_GROUP_MEMBERS = "groupMembers";
export const STORE_SENDER_KEYS = "senderKeys";
export const STORE_EVENT_LOG = "eventLog";

// Cleanup intervals
export const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const OUTBOX_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const CHUNK_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Contact verification states
export const VERIFICATION_STATUS = {
  UNVERIFIED: "unverified",
  VERIFIED: "verified",
  COMPROMISED: "compromised"
};

// Message delivery states
export const DELIVERY_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  FAILED: "failed"
};

// Outbox message priority levels (v4 schema)
export const OUTBOX_PRIORITY = {
  NORMAL: 0,
  HIGH: 1,
  URGENT: 2
};

/** Current outbox schema version. */
export const OUTBOX_SCHEMA_VERSION = 4;

/** Default TTL for outbox entries: 7 days in ms. */
export const OUTBOX_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// Database Initialization
// ============================================================================

let dbPromise = null;

/**
 * Open or create the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      reject(new Error("Failed to open database"));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = /** @type {IDBOpenDBRequest} */ (event.target).result;
      const oldVersion = event.oldVersion;

      // Keys store (user's own keys)
      if (!db.objectStoreNames.contains(STORE_KEYS)) {
        db.createObjectStore(STORE_KEYS);
      }

      // Contacts store (with fingerprint as key)
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        const contactStore = db.createObjectStore(STORE_CONTACTS, { keyPath: "fp" });
        contactStore.createIndex("name", "name", { unique: false });
        contactStore.createIndex("verified", "verified", { unique: false });
      }

      // Outbox store (messages pending delivery)
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outboxStore = db.createObjectStore(STORE_OUTBOX, { keyPath: "msgId" });
        outboxStore.createIndex("recipientFp", "recipientFp", { unique: false });
        outboxStore.createIndex("createdAt", "createdAt", { unique: false });
        outboxStore.createIndex("status", "status", { unique: false });
        outboxStore.createIndex("priority", "priority", { unique: false });
        outboxStore.createIndex("ttl", "ttl", { unique: false });
        outboxStore.createIndex("linkId", "linkId", { unique: false });
      }

      // Inbox store (received messages)
      if (!db.objectStoreNames.contains(STORE_INBOX)) {
        const inboxStore = db.createObjectStore(STORE_INBOX, { keyPath: "msgId" });
        inboxStore.createIndex("senderFp", "senderFp", { unique: false });
        inboxStore.createIndex("receivedAt", "receivedAt", { unique: false });
        inboxStore.createIndex("type", "type", { unique: false });
        inboxStore.createIndex("read", "read", { unique: false });
      }

      // Seen store (deduplication)
      if (!db.objectStoreNames.contains(STORE_SEEN)) {
        const seenStore = db.createObjectStore(STORE_SEEN, { keyPath: "seenKey" });
        seenStore.createIndex("seenAt", "seenAt", { unique: false });
      }

      // Chunks store (partial reassembly)
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunksStore = db.createObjectStore(STORE_CHUNKS, { keyPath: "chunkKey" });
        chunksStore.createIndex("msgId", "msgId", { unique: false });
        chunksStore.createIndex("receivedAt", "receivedAt", { unique: false });
      }

      // Migration from v1 database if needed
      if (oldVersion < 2) {
        console.log("Migrating database from v1 to v2");
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(STORE_GROUPS)) {
          const groupsStore = db.createObjectStore(STORE_GROUPS, { keyPath: "id" });
          groupsStore.createIndex("name", "name", { unique: false });
          groupsStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_GROUP_MEMBERS)) {
          const membersStore = db.createObjectStore(STORE_GROUP_MEMBERS, { keyPath: "memberKey" });
          membersStore.createIndex("groupId", "groupId", { unique: false });
          membersStore.createIndex("memberFp", "memberFp", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_SENDER_KEYS)) {
          const senderKeysStore = db.createObjectStore(STORE_SENDER_KEYS, { keyPath: "stateKey" });
          senderKeysStore.createIndex("groupId", "groupId", { unique: false });
          senderKeysStore.createIndex("senderSignPK", "senderSignPK", { unique: false });
          senderKeysStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        console.log("Migrating database from v2 to v3 (group stores)");
      }

      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains(STORE_EVENT_LOG)) {
          const eventLogStore = db.createObjectStore(STORE_EVENT_LOG, { keyPath: "eventId" });
          eventLogStore.createIndex("lamport", "lamport", { unique: false });
          eventLogStore.createIndex("ts", "ts", { unique: false });
          eventLogStore.createIndex("scope", "scope", { unique: false });
          eventLogStore.createIndex("topic", "topic", { unique: false });
        }
        console.log("Migrating database from v4 to v5 (append-only event log)");
      }

      if (oldVersion < 4) {
        // Add v4 outbox indexes if outbox store already exists (upgrade path).
        if (db.objectStoreNames.contains(STORE_OUTBOX)) {
          const tx = /** @type {IDBOpenDBRequest} */ (event.target).transaction;
          const outboxStore = tx.objectStore(STORE_OUTBOX);
          if (!outboxStore.indexNames.contains("priority")) {
            outboxStore.createIndex("priority", "priority", { unique: false });
          }
          if (!outboxStore.indexNames.contains("ttl")) {
            outboxStore.createIndex("ttl", "ttl", { unique: false });
          }
          if (!outboxStore.indexNames.contains("linkId")) {
            outboxStore.createIndex("linkId", "linkId", { unique: false });
          }
        }
        console.log("Migrating database from v3 to v4 (outbox priority/ttl/linkId indexes)");
      }
    };
  });

  return dbPromise;
}

// ============================================================================
// Generic Store Operations
// ============================================================================

/**
 * Get a value from a store
 */
export async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Put a value in a store
 */
export async function idbPut(storeName, value, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = key !== undefined ? store.put(value, key) : store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a value from a store
 */
export async function idbDel(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get all values from a store
 */
export async function idbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get values by index
 */
export async function idbGetByIndex(storeName, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}


/**
 * Get recent values by index (descending by default)
 * @param {string} storeName
 * @param {string} indexName
 * @param {{limit?: number, direction?: IDBCursorDirection}} [options]
 * @returns {Promise<object[]>}
 */
export async function idbGetRecentByIndex(storeName, indexName, options = {}) {
  const db = await openDB();
  const limit = Math.max(1, Number(options.limit) || 20);
  const direction = options.direction || "prev";

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.openCursor(null, direction);
    const rows = [];

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || rows.length >= limit) {
        resolve(rows);
        return;
      }

      rows.push(cursor.value);
      cursor.continue();
    };
  });
}
/**
 * Count items in a store
 */
export async function idbCount(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// Outbox Operations (Store-and-Forward)
// ============================================================================

/**
 * Add message to outbox for pending delivery
 * @param {object} message - Encrypted message object (dmesh-msg)
 * @param {string} recipientFp - Recipient's fingerprint (base64)
 * @param {object} [options] - Additional options
 * @param {number} [options.priority] - OUTBOX_PRIORITY value (default: NORMAL)
 * @param {number} [options.ttl] - Absolute expiry timestamp in ms (default: now + 7 days)
 * @param {string} [options.linkId] - BLE link/peer ID this message is targeted at
 * @param {string} [options.sourceEventId] - Event identifier backing this view row
 * @param {number} [options.lamport] - Lamport timestamp for source event
 * @param {string[]} [options.parents] - Causal parent event IDs
 * @param {string} [options.authorFp] - Event author fingerprint
 * @param {string} [options.scope] - Event scope
 * @param {string} [options.topic] - Event topic
 * @returns {Promise<void>}
 */
export async function addToOutbox(message, recipientFp, options = {}) {
  const now = Date.now();
  const lamport = Number.isFinite(options.lamport) ? options.lamport : now;
  const outboxEntry = {
    msgId: message.msgId,
    recipientFp,
    message,
    createdAt: now,
    status: DELIVERY_STATUS.PENDING,
    attempts: 0,
    lastAttempt: null,
    // v4 fields
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    sourceEventId: options.sourceEventId || message.msgId,
    priority: options.priority ?? OUTBOX_PRIORITY.NORMAL,
    ttl: options.ttl ?? (now + OUTBOX_DEFAULT_TTL_MS),
    linkId: options.linkId ?? null,
    ...options
  };
  await appendEventLog({
    eventId: outboxEntry.sourceEventId,
    parents: Array.isArray(options.parents) ? options.parents : [],
    authorFp: options.authorFp || "local",
    scope: options.scope || "direct",
    topic: options.topic || "outbox",
    ts: outboxEntry.createdAt,
    ttl: outboxEntry.ttl,
    lamport,
    priority: outboxEntry.priority,
    schemaVersion: 1,
    type: "outbox-message",
    payload: {
      msgId: message.msgId,
      recipientFp
    }
  });
  await idbPut(STORE_OUTBOX, outboxEntry);
}

/**
 * Get all pending messages from outbox
 * @returns {Promise<object[]>}
 */
export function getPendingOutbox() {
  return idbGetByIndex(STORE_OUTBOX, "status", DELIVERY_STATUS.PENDING);
}

/**
 * Get failed messages from outbox
 * @returns {Promise<object[]>}
 */
export function getFailedOutbox() {
  return idbGetByIndex(STORE_OUTBOX, "status", DELIVERY_STATUS.FAILED);
}

/**
 * Get recent outbox entries for operational UI snapshots
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export function getRecentOutbox(limit = 20) {
  return idbGetRecentByIndex(STORE_OUTBOX, "createdAt", { limit, direction: "prev" });
}

/**
 * Get outbox messages for a specific recipient
 * @param {string} recipientFp - Recipient's fingerprint
 * @returns {Promise<object[]>}
 */
export function getOutboxForRecipient(recipientFp) {
  return idbGetByIndex(STORE_OUTBOX, "recipientFp", recipientFp);
}

/**
 * Get outbox messages for a specific BLE link (v4 schema)
 * @param {string} linkId - BLE peer/link ID
 * @returns {Promise<object[]>}
 */
export function getOutboxForLink(linkId) {
  return idbGetByIndex(STORE_OUTBOX, "linkId", linkId);
}

/**
 * Get outbox entries at or above a given priority level (v4 schema)
 * @param {number} minPriority - Minimum OUTBOX_PRIORITY value (inclusive)
 * @returns {Promise<object[]>}
 */
export async function getOutboxByMinPriority(minPriority) {
  const all = await idbGetAll(STORE_OUTBOX);
  return all.filter(e => (e.priority ?? OUTBOX_PRIORITY.NORMAL) >= minPriority);
}

/**
 * Remove outbox entries whose TTL has expired (v4 schema)
 * @param {number} [now] - Current timestamp (default: Date.now())
 * @returns {Promise<number>} Number of entries removed
 */
export async function purgeExpiredOutbox(now = Date.now()) {
  const all = await idbGetAll(STORE_OUTBOX);
  let removed = 0;
  for (const entry of all) {
    if (entry.ttl !== null && entry.ttl !== undefined && entry.ttl < now) {
      await idbDel(STORE_OUTBOX, entry.msgId);
      removed++;
    }
  }
  return removed;
}

/**
 * Update outbox entry status
 * @param {string} msgId - Message ID
 * @param {string} status - New status
 * @param {object} [extra] - Additional fields to update
 */
export async function updateOutboxStatus(msgId, status, extra = {}) {
  const entry = await idbGet(STORE_OUTBOX, msgId);
  if (entry) {
    const { countAttempt = false, ...fields } = extra;
    entry.status = status;
    if (countAttempt) {
      entry.lastAttempt = Date.now();
      entry.attempts = (entry.attempts || 0) + 1;
    }
    Object.assign(entry, fields);
    await idbPut(STORE_OUTBOX, entry);
  }
}

/**
 * Remove message from outbox
 * @param {string} msgId - Message ID
 */
export async function removeFromOutbox(msgId) {
  await idbDel(STORE_OUTBOX, msgId);
}

// ============================================================================
// Inbox Operations
// ============================================================================

/**
 * Add message to inbox
 * @param {object} decryptedResult - Result from decryptMessage
 * @param {object} originalMessage - Original encrypted message
 * @returns {Promise<void>}
 */
export async function addToInbox(decryptedResult, originalMessage) {
  const inboxEntry = {
    msgId: decryptedResult.msgId,
    senderFp: decryptedResult.senderFp,
    senderFpB64: typeof decryptedResult.senderFp === "string"
      ? decryptedResult.senderFp
      : null, // Will be set by caller if needed
    content: decryptedResult.content,
    type: decryptedResult.type,
    payload: decryptedResult.payload,
    ts: decryptedResult.ts,
    receivedAt: Date.now(),
    read: false,
    originalMessage
  };

  // Convert senderFp to base64 if it's a Uint8Array
  if (decryptedResult.senderFp instanceof Uint8Array) {
    // Caller should provide naclUtil for proper encoding
    inboxEntry.senderFpB64 = Array.from(decryptedResult.senderFp)
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  await appendEventLog({
    eventId: decryptedResult.eventId || decryptedResult.msgId,
    parents: Array.isArray(decryptedResult.parents) ? decryptedResult.parents : [],
    authorFp: typeof decryptedResult.senderFp === "string" ? decryptedResult.senderFp : "unknown",
    scope: decryptedResult.scope || "direct",
    topic: decryptedResult.topic || "inbox",
    ts: Number.isFinite(decryptedResult.ts) ? decryptedResult.ts : Date.now(),
    ttl: Number.isFinite(decryptedResult.ttl) ? decryptedResult.ttl : null,
    lamport: Number.isFinite(decryptedResult.lamport) ? decryptedResult.lamport : Date.now(),
    priority: Number.isFinite(decryptedResult.priority) ? decryptedResult.priority : OUTBOX_PRIORITY.NORMAL,
    schemaVersion: 1,
    type: "inbox-message",
    payload: {
      msgId: decryptedResult.msgId,
      senderFp: inboxEntry.senderFpB64 || inboxEntry.senderFp
    }
  });

  await idbPut(STORE_INBOX, inboxEntry);
}

/**
 * Get all inbox messages
 * @returns {Promise<object[]>}
 */
export async function getInbox() {
  const messages = await idbGetAll(STORE_INBOX);
  return messages.sort((a, b) => b.receivedAt - a.receivedAt);
}

/**
 * Get recent inbox entries for operational UI snapshots
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export function getRecentInbox(limit = 20) {
  return idbGetRecentByIndex(STORE_INBOX, "receivedAt", { limit, direction: "prev" });
}

/**
 * Get unread inbox messages
 * @returns {Promise<object[]>}
 */
export function getUnreadInbox() {
  return idbGetByIndex(STORE_INBOX, "read", false);
}

/**
 * Get inbox messages from a specific sender
 * @param {string} senderFp - Sender's fingerprint
 * @returns {Promise<object[]>}
 */
export function getInboxFromSender(senderFp) {
  return idbGetByIndex(STORE_INBOX, "senderFp", senderFp);
}

/**
 * Get inbox messages by type
 * @param {string} type - Message type
 * @returns {Promise<object[]>}
 */
export function getInboxByType(type) {
  return idbGetByIndex(STORE_INBOX, "type", type);
}

/**
 * Mark message as read
 * @param {string} msgId - Message ID
 */
export async function markAsRead(msgId) {
  const entry = await idbGet(STORE_INBOX, msgId);
  if (entry) {
    entry.read = true;
    await idbPut(STORE_INBOX, entry);
  }
}

/**
 * Delete message from inbox
 * @param {string} msgId - Message ID
 */
export async function deleteFromInbox(msgId) {
  await idbDel(STORE_INBOX, msgId);
}

// ============================================================================
// Seen Operations (Deduplication)
// ============================================================================

/**
 * Generate seen key from message ID and sender fingerprint
 * @param {string} msgId - Message ID (base64)
 * @param {string} senderFp - Sender fingerprint (base64)
 * @returns {string}
 */
export function makeSeenKey(msgId, senderFp) {
  return `${msgId}:${senderFp}`;
}

/**
 * Check if message has been seen (for replay detection)
 * @param {string} msgId - Message ID
 * @param {string} senderFp - Sender fingerprint
 * @returns {Promise<boolean>} - True if NOT seen (allowed), false if already seen
 */
export async function checkAndMarkSeen(msgId, senderFp) {
  const seenKey = makeSeenKey(msgId, senderFp);
  const existing = await idbGet(STORE_SEEN, seenKey);

  if (existing) {
    return false; // Already seen - reject
  }

  // Mark as seen
  await idbPut(STORE_SEEN, {
    seenKey,
    msgId,
    senderFp,
    seenAt: Date.now()
  });

  return true; // Not seen before - allow
}

/**
 * Check if message has been seen (without marking)
 * @param {string} msgId - Message ID
 * @param {string} senderFp - Sender fingerprint
 * @returns {Promise<boolean>} - True if seen
 */
export async function hasSeen(msgId, senderFp) {
  const seenKey = makeSeenKey(msgId, senderFp);
  const existing = await idbGet(STORE_SEEN, seenKey);
  return Boolean(existing);
}

/**
 * Cleanup old seen entries
 * @param {number} [maxAgeMs] - Maximum age in milliseconds
 */
export async function cleanupSeen(maxAgeMs = SEEN_RETENTION_MS) {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDB();
  let removed = 0;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SEEN, "readwrite");
    const store = tx.objectStore(STORE_SEEN);
    const request = store.openCursor();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      const entry = cursor.value;
      if (entry.seenAt < cutoff) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
  });
  return removed;
}

// ============================================================================
// Contact Operations (Extended with Verification)
// ============================================================================

/**
 * Add or update a contact
 * @param {object} contact - Contact object
 * @param {string} contact.fp - Fingerprint (base64)
 * @param {string} contact.name - Display name
 * @param {string} contact.signPK - Signing public key (base64)
 * @param {string} contact.boxPK - Box public key (base64)
 * @param {string} [contact.verified] - Verification status
 */
export async function saveContact(contact) {
  const existing = await idbGet(STORE_CONTACTS, contact.fp);
  const entry = {
    ...existing,
    ...contact,
    verified: contact.verified || existing?.verified || VERIFICATION_STATUS.UNVERIFIED,
    addedAt: existing?.addedAt || Date.now(),
    updatedAt: Date.now()
  };
  await idbPut(STORE_CONTACTS, entry);
}

/**
 * Get a contact by fingerprint
 * @param {string} fp - Fingerprint (base64)
 * @returns {Promise<object|undefined>}
 */
export function getContact(fp) {
  return idbGet(STORE_CONTACTS, fp);
}

/**
 * Get all contacts
 * @returns {Promise<object[]>}
 */
export function getAllContacts() {
  return idbGetAll(STORE_CONTACTS);
}

/**
 * Get verified contacts only
 * @returns {Promise<object[]>}
 */
export function getVerifiedContacts() {
  return idbGetByIndex(STORE_CONTACTS, "verified", VERIFICATION_STATUS.VERIFIED);
}

/**
 * Mark contact as verified
 * @param {string} fp - Fingerprint
 */
export async function verifyContact(fp) {
  const contact = await idbGet(STORE_CONTACTS, fp);
  if (contact) {
    contact.verified = VERIFICATION_STATUS.VERIFIED;
    contact.verifiedAt = Date.now();
    await idbPut(STORE_CONTACTS, contact);
  }
}

/**
 * Mark contact as compromised
 * @param {string} fp - Fingerprint
 * @param {string} [reason] - Reason for marking compromised
 */
export async function markContactCompromised(fp, reason) {
  const contact = await idbGet(STORE_CONTACTS, fp);
  if (contact) {
    contact.verified = VERIFICATION_STATUS.COMPROMISED;
    contact.compromisedAt = Date.now();
    contact.compromisedReason = reason;
    await idbPut(STORE_CONTACTS, contact);
  }
}

/**
 * Delete a contact
 * @param {string} fp - Fingerprint
 */
export async function deleteContact(fp) {
  await idbDel(STORE_CONTACTS, fp);
}

// ============================================================================
// Chunk Operations (Reassembly)
// ============================================================================

/**
 * Store a received chunk for later reassembly
 * @param {object} chunk - Chunk object (dmesh-chunk)
 * @returns {Promise<object[]|null>} - Complete chunks array if all received, null otherwise
 */
export async function storeChunk(chunk) {
  if (!Number.isInteger(chunk.seq) || chunk.seq < 0) {
    throw new Error("Invalid chunk sequence index");
  }

  if (!Number.isInteger(chunk.total) || chunk.total <= 0) {
    throw new Error("Invalid chunk total");
  }

  if (chunk.seq >= chunk.total) {
    throw new Error("Chunk sequence exceeds total");
  }

  const chunkKey = `${chunk.msgId}:${chunk.seq}`;
  const existing = await idbGet(STORE_CHUNKS, chunkKey);
  if (existing) {
    return null; // Duplicate chunk, ignore
  }

  await idbPut(STORE_CHUNKS, {
    chunkKey,
    msgId: chunk.msgId,
    seq: chunk.seq,
    total: chunk.total,
    data: chunk.data,
    receivedAt: Date.now()
  });

  const allChunks = await idbGetByIndex(STORE_CHUNKS, "msgId", chunk.msgId);

  // Reject inconsistent metadata (e.g. mixed totals)
  const inconsistent = allChunks.some(c => c.total !== chunk.total);
  if (inconsistent) {
    for (const c of allChunks) {
      await idbDel(STORE_CHUNKS, c.chunkKey);
    }
    throw new Error("Inconsistent chunk totals detected");
  }

  const sorted = allChunks.sort((a, b) => a.seq - b.seq);

  // Gap-aware completion check for out-of-order delivery
  if (sorted.length !== chunk.total) {
    return null;
  }

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].seq !== i) {
      return null; // Missing chunk index despite equal count
    }
  }

  for (const c of sorted) {
    await idbDel(STORE_CHUNKS, c.chunkKey);
  }

  return sorted.map(c => ({
    v: 1,
    kind: "dmesh-chunk",
    msgId: c.msgId,
    seq: c.seq,
    total: c.total,
    data: c.data
  }));
}

/**
 * Get pending chunks for a message
 * @param {string} msgId - Message ID
 * @returns {Promise<object[]>}
 */
export function getPendingChunks(msgId) {
  return idbGetByIndex(STORE_CHUNKS, "msgId", msgId);
}

/**
 * Remove all pending chunks for a message
 * @param {string} msgId - Message ID / transfer ID
 * @returns {Promise<void>}
 */
export async function clearPendingChunks(msgId) {
  const chunks = await getPendingChunks(msgId);
  for (const chunk of chunks) {
    await idbDel(STORE_CHUNKS, chunk.chunkKey);
  }
}

/**
 * Cleanup old incomplete chunks
 * @param {number} [maxAgeMs] - Maximum age in milliseconds (default: 24 hours)
 */
export async function cleanupOldChunks(maxAgeMs = CHUNK_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;
  const db = await openDB();
  let removed = 0;

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, "readwrite");
    const store = tx.objectStore(STORE_CHUNKS);
    const request = store.openCursor();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      const entry = cursor.value;
      if (entry.receivedAt < cutoff) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
  });
  return removed;
}

// ============================================================================
// Group Operations (Group metadata, members, sender key state)
// ============================================================================

export async function saveGroup(group) {
  const existing = await idbGet(STORE_GROUPS, group.id);
  const entry = {
    ...existing,
    ...group,
    createdAt: existing?.createdAt || group.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  await idbPut(STORE_GROUPS, entry);
}

export function getGroup(groupId) {
  return idbGet(STORE_GROUPS, groupId);
}

export function getAllGroups() {
  return idbGetAll(STORE_GROUPS);
}

export async function saveGroupMembers(groupId, members = []) {
  const existingMembers = await idbGetByIndex(STORE_GROUP_MEMBERS, "groupId", groupId);
  for (const existing of existingMembers) {
    await idbDel(STORE_GROUP_MEMBERS, existing.memberKey);
  }

  for (const memberFp of members) {
    await idbPut(STORE_GROUP_MEMBERS, {
      memberKey: `${groupId}:${memberFp}`,
      groupId,
      memberFp,
      updatedAt: Date.now()
    });
  }
}

export async function addGroupMember(groupId, memberFp) {
  await idbPut(STORE_GROUP_MEMBERS, {
    memberKey: `${groupId}:${memberFp}`,
    groupId,
    memberFp,
    updatedAt: Date.now()
  });
}

export async function removeGroupMember(groupId, memberFp) {
  await idbDel(STORE_GROUP_MEMBERS, `${groupId}:${memberFp}`);
}

export async function getGroupMembers(groupId) {
  const members = await idbGetByIndex(STORE_GROUP_MEMBERS, "groupId", groupId);
  return members.map((entry) => entry.memberFp);
}

export async function saveSenderKeyState(groupId, senderSignPK, senderKeyState) {
  await idbPut(STORE_SENDER_KEYS, {
    stateKey: `${groupId}:${senderSignPK}`,
    groupId,
    senderSignPK,
    senderKeyState,
    updatedAt: Date.now()
  });
}

export async function getSenderKeyState(groupId, senderSignPK) {
  const state = await idbGet(STORE_SENDER_KEYS, `${groupId}:${senderSignPK}`);
  return state?.senderKeyState || null;
}

export async function removeSenderKeyState(groupId, senderSignPK) {
  await idbDel(STORE_SENDER_KEYS, `${groupId}:${senderSignPK}`);
}

export function getSenderKeysForGroup(groupId) {
  return idbGetByIndex(STORE_SENDER_KEYS, "groupId", groupId);
}

// ============================================================================
// Append-only Event Log (Phase 3)
// ============================================================================

/**
 * Append event if not present (idempotent).
 * @param {object} event
 * @returns {Promise<{appended: boolean, event: object}>}
 */
export async function appendEventLog(event) {
  if (!event || !event.eventId) {
    throw new Error("appendEventLog requires event.eventId");
  }

  const existing = await idbGet(STORE_EVENT_LOG, event.eventId);
  if (existing) {
    return { appended: false, event: existing };
  }

  const entry = {
    schemaVersion: 1,
    parents: Array.isArray(event.parents) ? event.parents : [],
    lamport: Number.isFinite(event.lamport) ? event.lamport : 0,
    ts: Number.isFinite(event.ts) ? event.ts : Date.now(),
    ttl: event.ttl ?? null,
    topic: event.topic || "default",
    scope: event.scope || "direct",
    ...event
  };

  await idbPut(STORE_EVENT_LOG, entry);
  return { appended: true, event: entry };
}

/**
 * @returns {Promise<object[]>}
 */
export async function getAllEventLogEntries() {
  const entries = await idbGetAll(STORE_EVENT_LOG);
  return entries.sort((a, b) => {
    if ((a.lamport || 0) !== (b.lamport || 0)) {
      return (a.lamport || 0) - (b.lamport || 0);
    }
    if ((a.ts || 0) !== (b.ts || 0)) {
      return (a.ts || 0) - (b.ts || 0);
    }
    return String(a.eventId).localeCompare(String(b.eventId));
  });
}

/**
 * @param {number} lamportInclusive
 * @returns {Promise<object[]>}
 */
export async function getEventLogFromLamport(lamportInclusive = 0) {
  const entries = await getAllEventLogEntries();
  return entries.filter((event) => (event.lamport || 0) >= lamportInclusive);
}

/**
 * Remove expired events by ttl.
 * @param {number} [now]
 * @returns {Promise<number>}
 */
export async function pruneExpiredEvents(now = Date.now()) {
  const entries = await idbGetAll(STORE_EVENT_LOG);
  let removed = 0;
  for (const event of entries) {
    if (event.ttl !== null && event.ttl !== undefined && event.ttl < now) {
      await idbDel(STORE_EVENT_LOG, event.eventId);
      removed += 1;
    }
  }
  return removed;
}

// ============================================================================
// Database Maintenance
// ============================================================================

/**
 * Run all cleanup operations
 */
export async function runMaintenance() {
  const seenRemoved = await cleanupSeen();
  const chunksRemoved = await cleanupOldChunks();
  const outboxPurged = await purgeExpiredOutbox();
  const eventLogPruned = await pruneExpiredEvents();

  const result = {
    at: Date.now(),
    seenRemoved,
    chunksRemoved,
    outboxPurged,
    eventLogPruned
  };

  console.log(
    "Database maintenance completed",
    JSON.stringify(result)
  );
  return result;
}

/**
 * Get database statistics
 * @returns {Promise<object>}
 */
export async function getStats() {
  return {
    contacts: await idbCount(STORE_CONTACTS),
    outbox: await idbCount(STORE_OUTBOX),
    inbox: await idbCount(STORE_INBOX),
    seen: await idbCount(STORE_SEEN),
    chunks: await idbCount(STORE_CHUNKS),
    groups: await idbCount(STORE_GROUPS),
    groupMembers: await idbCount(STORE_GROUP_MEMBERS),
    senderKeys: await idbCount(STORE_SENDER_KEYS),
    eventLog: await idbCount(STORE_EVENT_LOG)
  };
}

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData() {
  const db = await openDB();
  const storeNames = [
    STORE_KEYS,
    STORE_CONTACTS,
    STORE_OUTBOX,
    STORE_INBOX,
    STORE_SEEN,
    STORE_CHUNKS,
    STORE_GROUPS,
    STORE_GROUP_MEMBERS,
    STORE_SENDER_KEYS,
    STORE_EVENT_LOG
  ];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
