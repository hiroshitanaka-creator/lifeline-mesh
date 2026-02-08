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
export const DB_VERSION = 2;

// Store names
export const STORE_KEYS = "keys";
export const STORE_CONTACTS = "contacts";
export const STORE_OUTBOX = "outbox";
export const STORE_INBOX = "inbox";
export const STORE_SEEN = "seen";
export const STORE_CHUNKS = "chunks"; // Partial chunk reassembly

// Cleanup intervals
export const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const OUTBOX_RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
 * @returns {Promise<void>}
 */
export async function addToOutbox(message, recipientFp, options = {}) {
  const outboxEntry = {
    msgId: message.msgId,
    recipientFp,
    message,
    createdAt: Date.now(),
    status: DELIVERY_STATUS.PENDING,
    attempts: 0,
    lastAttempt: null,
    ...options
  };
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
 * Get outbox messages for a specific recipient
 * @param {string} recipientFp - Recipient's fingerprint
 * @returns {Promise<object[]>}
 */
export function getOutboxForRecipient(recipientFp) {
  return idbGetByIndex(STORE_OUTBOX, "recipientFp", recipientFp);
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
    entry.status = status;
    entry.lastAttempt = Date.now();
    entry.attempts = (entry.attempts || 0) + 1;
    Object.assign(entry, extra);
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
  const all = await idbGetAll(STORE_SEEN);

  for (const entry of all) {
    if (entry.seenAt < cutoff) {
      await idbDel(STORE_SEEN, entry.seenKey);
    }
  }
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
  const chunkKey = `${chunk.msgId}:${chunk.seq}`;
  await idbPut(STORE_CHUNKS, {
    chunkKey,
    msgId: chunk.msgId,
    seq: chunk.seq,
    total: chunk.total,
    data: chunk.data,
    receivedAt: Date.now()
  });

  // Check if we have all chunks
  const allChunks = await idbGetByIndex(STORE_CHUNKS, "msgId", chunk.msgId);
  if (allChunks.length === chunk.total) {
    // Clean up stored chunks
    for (const c of allChunks) {
      await idbDel(STORE_CHUNKS, c.chunkKey);
    }
    // Return complete chunks for reassembly
    return allChunks.map(c => ({
      v: 1,
      kind: "dmesh-chunk",
      msgId: c.msgId,
      seq: c.seq,
      total: c.total,
      data: c.data
    }));
  }

  return null; // Still waiting for more chunks
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
 * Cleanup old incomplete chunks
 * @param {number} [maxAgeMs] - Maximum age in milliseconds (default: 24 hours)
 */
export async function cleanupOldChunks(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const all = await idbGetAll(STORE_CHUNKS);

  for (const entry of all) {
    if (entry.receivedAt < cutoff) {
      await idbDel(STORE_CHUNKS, entry.chunkKey);
    }
  }
}

// ============================================================================
// Database Maintenance
// ============================================================================

/**
 * Run all cleanup operations
 */
export async function runMaintenance() {
  await cleanupSeen();
  await cleanupOldChunks();
  console.log("Database maintenance completed");
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
    chunks: await idbCount(STORE_CHUNKS)
  };
}

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData() {
  const db = await openDB();
  const storeNames = [STORE_KEYS, STORE_CONTACTS, STORE_OUTBOX, STORE_INBOX, STORE_SEEN, STORE_CHUNKS];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
