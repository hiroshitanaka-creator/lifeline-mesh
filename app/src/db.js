/**
 * App-facing DB facade.
 *
 * Official IndexedDB API lives in `crypto/store.js`.
 * This module only exposes the subset used by the web UI so callers
 * have a stable, app-local import path.
 */
import {
  STORE_KEYS,
  STORE_CONTACTS,
  STORE_OUTBOX,
  STORE_INBOX,
  STORE_SEEN,
  STORE_GROUPS,
  OUTBOX_RETRY_INTERVAL_MS,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  getRecentOutbox,
  getRecentInbox,
  clearAllData,
  checkAndMarkSeen,
  cleanupSeen,
  saveGroup,
  getGroup,
  getAllGroups,
  saveGroupMembers,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  saveSenderKeyState,
  getSenderKeyState
} from '../../crypto/store.js';

export {
  STORE_KEYS,
  STORE_CONTACTS,
  STORE_OUTBOX,
  STORE_INBOX,
  STORE_GROUPS,
  OUTBOX_RETRY_INTERVAL_MS,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  getRecentOutbox,
  getRecentInbox,
  checkAndMarkSeen,
  cleanupSeen,
  saveGroup,
  getGroup,
  getAllGroups,
  saveGroupMembers,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  saveSenderKeyState,
  getSenderKeyState
};

export async function resetDatabase() {
  await clearAllData();
}

async function openLegacyV1Database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lifelineMesh', 1);
    request.onerror = () => reject(request.error || new Error('Failed to open legacy database'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      // Database did not exist previously. Close and resolve null to skip migration.
      const db = request.result;
      db.close();
      indexedDB.deleteDatabase('lifelineMesh');
      resolve(null);
    };
  });
}

async function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}`));
    request.onsuccess = () => resolve(request.result || []);
  });
}

async function getFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}:${key}`));
    request.onsuccess = () => resolve(request.result);
  });
}

function normalizeDeliveryStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'sent' || value === 'delivered' || value === 'failed') {
    return value;
  }
  return 'pending';
}

export function normalizeLegacyOutboxEntry(entry) {
  if (!entry || !entry.msgId || !entry.message) {
    return null;
  }

  return {
    msgId: entry.msgId,
    recipientFp: entry.recipientFp || entry.recipient || 'unknown',
    message: entry.message,
    createdAt: entry.createdAt || Date.now(),
    status: normalizeDeliveryStatus(entry.status),
    attempts: Number.isFinite(entry.attempts) ? entry.attempts : 0,
    lastAttempt: entry.lastAttempt || null,
    error: entry.error || null,
    transport: entry.transport || 'ble'
  };
}

export function normalizeLegacyInboxEntry(entry) {
  if (!entry || !entry.msgId || !entry.message) {
    return null;
  }

  return {
    msgId: entry.msgId,
    senderFp: entry.senderFp || 'unknown',
    message: entry.message,
    receivedAt: entry.receivedAt || Date.now(),
    type: entry.type || 'direct',
    read: Boolean(entry.read)
  };
}

/**
 * Migrate legacy lifelineMesh(v1) data into lifelineMeshV2 store.
 * Idempotent: safe to call on every app start.
 *
 * @returns {Promise<{migrated: boolean, keys: number, contacts: number, seen: number, outbox: number, inbox: number}>}
 */
export async function migrateLegacyV1IfNeeded() {
  const migrationFlag = await idbGet(STORE_KEYS, '__legacy_v1_migrated__');
  if (migrationFlag?.done) {
    return { migrated: false, keys: 0, contacts: 0, seen: 0, outbox: 0, inbox: 0 };
  }

  const legacyDb = await openLegacyV1Database();
  if (!legacyDb) {
    await idbPut(STORE_KEYS, { done: true, at: Date.now() }, '__legacy_v1_migrated__');
    return { migrated: false, keys: 0, contacts: 0, seen: 0, outbox: 0, inbox: 0 };
  }

  const hasKeys = legacyDb.objectStoreNames.contains('keys');
  const hasContacts = legacyDb.objectStoreNames.contains('contacts');
  const hasReplay = legacyDb.objectStoreNames.contains('replay');
  const hasOutbox = legacyDb.objectStoreNames.contains('outbox');
  const hasInbox = legacyDb.objectStoreNames.contains('inbox');

  if (!hasKeys && !hasContacts && !hasReplay && !hasOutbox && !hasInbox) {
    legacyDb.close();
    await idbPut(STORE_KEYS, { done: true, at: Date.now() }, '__legacy_v1_migrated__');
    return { migrated: false, keys: 0, contacts: 0, seen: 0, outbox: 0, inbox: 0 };
  }

  let keyCount = 0;
  let contactCount = 0;
  let seenCount = 0;
  let outboxCount = 0;
  let inboxCount = 0;

  if (hasKeys) {
    const keyNames = ['my_sign_pk', 'my_sign_sk', 'my_box_pk', 'my_box_sk'];
    for (const keyName of keyNames) {
      const value = await getFromStore(legacyDb, 'keys', keyName);
      if (value) {
        await idbPut(STORE_KEYS, value, keyName);
        keyCount += 1;
      }
    }
  }

  if (hasContacts) {
    const contacts = await getAllFromStore(legacyDb, 'contacts');
    for (const contact of contacts) {
      await idbPut(STORE_CONTACTS, {
        ...contact,
        verified: contact.verified || 'unverified'
      });
      contactCount += 1;
    }
  }

  if (hasReplay) {
    const replayEntries = await getAllFromStore(legacyDb, 'replay');
    for (const replay of replayEntries) {
      const compositeKey = replay?.k || '';
      const separatorIndex = compositeKey.indexOf(':');
      if (separatorIndex <= 0) {
        continue;
      }

      const senderFp = compositeKey.slice(0, separatorIndex);
      const nonce = compositeKey.slice(separatorIndex + 1);
      await idbPut(STORE_SEEN, {
        seenKey: `${nonce}:${senderFp}`,
        msgId: nonce,
        senderFp,
        seenAt: replay.seenAt || Date.now()
      });
      seenCount += 1;
    }
  }

  if (hasOutbox) {
    const outboxEntries = await getAllFromStore(legacyDb, 'outbox');
    for (const entry of outboxEntries) {
      const normalized = normalizeLegacyOutboxEntry(entry);
      if (!normalized) {
        continue;
      }
      await idbPut(STORE_OUTBOX, normalized);
      outboxCount += 1;
    }
  }

  if (hasInbox) {
    const inboxEntries = await getAllFromStore(legacyDb, 'inbox');
    for (const entry of inboxEntries) {
      const normalized = normalizeLegacyInboxEntry(entry);
      if (!normalized) {
        continue;
      }
      await idbPut(STORE_INBOX, normalized);
      inboxCount += 1;
    }
  }

  legacyDb.close();
  await idbPut(STORE_KEYS, {
    done: true,
    at: Date.now(),
    keyCount,
    contactCount,
    seenCount,
    outboxCount,
    inboxCount
  }, '__legacy_v1_migrated__');

  return {
    migrated: true,
    keys: keyCount,
    contacts: contactCount,
    seen: seenCount,
    outbox: outboxCount,
    inbox: inboxCount
  };
}
