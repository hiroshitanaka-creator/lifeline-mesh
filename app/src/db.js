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
  STORE_SEEN as STORE_REPLAY,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  clearAllData,
  checkAndMarkSeen,
  cleanupSeen
} from '../../crypto/store.js';

export {
  STORE_KEYS,
  STORE_CONTACTS,
  STORE_REPLAY,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  checkAndMarkSeen,
  cleanupSeen
};

export async function resetDatabase() {
  await clearAllData();
}
