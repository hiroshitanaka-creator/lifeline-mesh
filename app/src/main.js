/* =========================
  Imports
========================= */
import * as DMesh from '../../crypto/core.js';
import * as GroupMesh from '../../crypto/group.js';
import { BLEManager } from '../../bluetooth/ble-manager.js';
import { encryptKeys, decryptKeys, checkPasswordStrength, isArgon2Available } from '../../crypto/key-backup.js';
import nacl from 'tweetnacl';

// Bundle argon2-browser (WASM embedded) so Argon2id KDF is available offline.
// This sets window.argon2, which key-backup.js detects via isArgon2Available().
import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
window.argon2 = argon2;
import * as naclUtil from 'tweetnacl-util';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import {
  STORE_KEYS,
  STORE_CONTACTS,
  STORE_OUTBOX,
  STORE_INBOX,
  OUTBOX_RETRY_INTERVAL_MS,
  OUTBOX_DEFAULT_TTL_MS,
  SEEN_RETENTION_MS,
  CHUNK_MAX_AGE_MS,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  getRecentOutbox,
  getRecentInbox,
  resetDatabase,
  checkAndMarkSeen,
  cleanupSeen,
  runMaintenance,
  saveGroup,
  getGroup,
  getAllGroups,
  saveGroupMembers,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  saveSenderKeyState,
  getSenderKeyState,
  removeSenderKeyState,
  getSenderKeysForGroup,
  migrateLegacyV1IfNeeded,
  VERIFICATION_STATUS,
  saveContact,
  verifyContact,
  markContactCompromised
} from './db.js';
import { encryptInWorker, decryptInWorker } from './worker-client.js';
import { appendBleMessage, formatErrorMessage, formatLocalTime, setStatus } from './ui-utils.js';
import { resolveStartupShareTargetIntake } from './share-target-intake.js';
import { createTransportManager } from '../../crypto/transport.js';
import { createMeshRuntime } from './runtime-mesh.js';
import { mountOperatorPanel } from './operator-panel.js';
import { t as tr, setLang, getLang } from './i18n.js';
import { shouldAcceptIncomingSenderState, filterSenderStateEntriesByMembers } from './group-sender-state.js';
import { getContactVerificationStatus, buildDecryptVerificationOutcome } from './decrypt-verification-policy.js';
import { evaluateGroupActorVerification, summarizeGroupVerificationOutcomes } from './group-verification-policy.js';
import { normalizeImportedGroupPayload } from './group-import-normalization.js';


/* =========================
  BLE Manager
========================= */
let bleManager = null;
const bleManagers = new Map(); // deviceId → BLEManager (all active connections)
let _bleTestForceSupported = false;
let bleManagerFactory = (options = {}) => new BLEManager(options);
let transportManager = null;
let meshRuntime = null;
let pendingTemplateText = '';
let _cachedOutboxStats = { pending: 0, failed: 0 };
let _operatorPanel = null;
let _maintenanceState = {
  lastRunAt: null,
  lastResult: null,
  lastError: null,
  runs: 0
};
let _maintenanceTimer = null;
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

const DELIVERY_UI_STATUS = {
  UNSENT: 'unsent',
  RETRYING: 'retrying',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

const BLE_CONFIG_STORAGE_KEY = "lifeline:bleProtocolConfig";
const APP_MODE_STORAGE_KEY = "lifeline:appMode";
const MAX_MESSAGE_BYTES = 150 * 1024;
const MAX_BLE_CHUNKS = 255;
const DEFAULT_BLE_CHUNK_SIZE = 140;
const CONTACT_BLOCK_COMPROMISED_SEND = true;

function getVerificationBadge(status) {
  if (status === VERIFICATION_STATUS.VERIFIED) {
    return '✅ verified';
  }
  if (status === VERIFICATION_STATUS.COMPROMISED) {
    return '⚠️ compromised';
  }
  return '🕒 unverified (TOFU)';
}

function renderDecryptVerification(outcome) {
  const el = document.getElementById('decrypt-verification');
  if (!el) {
    return;
  }

  if (!outcome) {
    el.textContent = '(no decrypted message yet)';
    return;
  }

  const prefix = {
    verified: '✅ VERIFIED',
    unverified: '⚠️ UNVERIFIED',
    compromised: '🚨 COMPROMISED'
  }[outcome.level] || 'ℹ️ UNKNOWN';

  el.textContent = `${prefix}\n${outcome.details}`;
}

function renderContactVerificationDetails(contact) {
  if (!contact) {
    return '(select a contact)';
  }

  const status = getContactVerificationStatus(contact);
  const lines = [
    `name: ${contact.name}`,
    `fp: ${contact.fp}`,
    `verification: ${status}`
  ];

  if (contact.verifiedAt) {
    lines.push(`verifiedAt: ${new Date(contact.verifiedAt).toISOString()}`);
  }
  if (contact.compromisedAt) {
    lines.push(`compromisedAt: ${new Date(contact.compromisedAt).toISOString()}`);
  }
  if (contact.compromisedReason) {
    lines.push(`compromisedReason: ${contact.compromisedReason}`);
  }

  return lines.join('\n');
}

function syncEncryptRecipientLabel(selectEl) {
  const selectedOption = /** @type {HTMLSelectElement} */ (selectEl).options[
    /** @type {HTMLSelectElement} */ (selectEl).selectedIndex
  ];
  const hasRecipient = Boolean(selectedOption?.value);
  document.getElementById("encrypt-recipient").textContent = hasRecipient
    ? (selectedOption.textContent || "(select above)")
    : "(select above)";
}

async function refreshSelectedContactDetails() {
  const fp = /** @type {HTMLInputElement} */ (document.getElementById("recipient-select"))?.value;
  const detailsEl = document.getElementById('contact-details-view');
  const safetyEl = document.getElementById('contact-safety-number');
  const verifyBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-action="verifySelectedContact"]'));
  const compromisedBtn = /** @type {HTMLButtonElement|null} */ (document.querySelector('[data-action="markSelectedContactCompromised"]'));

  if (!detailsEl || !safetyEl) {
    return;
  }

  if (!fp) {
    detailsEl.textContent = '(select a contact)';
    safetyEl.textContent = '(select a contact)';
    if (verifyBtn) verifyBtn.disabled = true;
    if (compromisedBtn) compromisedBtn.disabled = true;
    return;
  }

  const [contact, mySignPK] = await Promise.all([
    idbGet(STORE_CONTACTS, fp),
    idbGet(STORE_KEYS, "my_sign_pk")
  ]);

  if (!contact || !mySignPK) {
    detailsEl.textContent = '(contact unavailable)';
    safetyEl.textContent = '(unavailable)';
    if (verifyBtn) verifyBtn.disabled = true;
    if (compromisedBtn) compromisedBtn.disabled = true;
    return;
  }

  const myFp = DMesh.fingerprintFromSignPK(mySignPK, nacl);
  const contactFp = naclUtil.decodeBase64(contact.fp);
  const safetyNumber = DMesh.generateSafetyNumber(myFp, contactFp);

  detailsEl.textContent = renderContactVerificationDetails(contact);
  safetyEl.textContent = `${safetyNumber} (${getVerificationBadge(getContactVerificationStatus(contact))})`;

  if (verifyBtn) {
    verifyBtn.disabled = getContactVerificationStatus(contact) === VERIFICATION_STATUS.VERIFIED;
  }
  if (compromisedBtn) {
    compromisedBtn.disabled = getContactVerificationStatus(contact) === VERIFICATION_STATUS.COMPROMISED;
  }
}

function formatRemainingDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  if (safeMs < 1000) {
    return `${safeMs}ms`;
  }

  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 1) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function setDeliveryStatus(status, detail = '') {
  const chipEl = document.getElementById('delivery-status-chip');
  const detailEl = document.getElementById('delivery-status-detail');
  if (!chipEl || !detailEl) {
    return;
  }

  const classMap = {
    [DELIVERY_UI_STATUS.UNSENT]: 'delivery-unsent',
    [DELIVERY_UI_STATUS.RETRYING]: 'delivery-retrying',
    [DELIVERY_UI_STATUS.DELIVERED]: 'delivery-delivered',
    [DELIVERY_UI_STATUS.FAILED]: 'delivery-failed'
  };

  const textKeyMap = {
    [DELIVERY_UI_STATUS.UNSENT]: 'delivery.status.unsent',
    [DELIVERY_UI_STATUS.RETRYING]: 'delivery.status.retrying',
    [DELIVERY_UI_STATUS.DELIVERED]: 'delivery.status.delivered',
    [DELIVERY_UI_STATUS.FAILED]: 'delivery.status.failed'
  };

  chipEl.textContent = tr(textKeyMap[status] || 'delivery.status.unsent');
  chipEl.className = `delivery-chip ${classMap[status] || 'delivery-unsent'}`;
  detailEl.textContent = detail || 'No additional details';
}

function renderFailureGuide(state, details = {}) {
  const guideEl = document.getElementById('failure-guide');
  if (!guideEl) {
    return;
  }

  if (state === 'failed') {
    guideEl.textContent = tr('delivery.guide.failed', { error: details.error || 'unknown' });
    return;
  }

  if (state === 'fallback') {
    guideEl.textContent = tr('delivery.guide.fallback');
    return;
  }

  if (state === 'retrying') {
    guideEl.textContent = tr('delivery.guide.retrying', { attempt: String(details.attempt || '?') });
    return;
  }

  guideEl.textContent = tr('delivery.guide.default');
}

async function refreshOutboxSnapshot() {
  const outboxEl = document.getElementById('outbox-view');
  if (!outboxEl) {
    return;
  }

  try {
    const entries = await getRecentOutbox(20);
    if (!entries.length) {
      outboxEl.textContent = '(none)';
      return;
    }

    const compact = entries
      .map((entry) => {
        const cooldownExpiresAt = (entry.status === 'failed' && entry.lastAttempt)
          ? entry.lastAttempt + OUTBOX_RETRY_INTERVAL_MS
          : null;
        const cooldownRemainingMs = cooldownExpiresAt
          ? Math.max(0, cooldownExpiresAt - Date.now())
          : null;

        return {
          msgId: entry.msgId,
          status: entry.status,
          attempts: entry.attempts || 0,
          transport: entry.transport || 'ble',
          lastAttempt: entry.lastAttempt || null,
          error: entry.error || null,
          cooldownUntil: cooldownExpiresAt,
          cooldownRemaining: cooldownRemainingMs,
          cooldownRemainingText: cooldownRemainingMs !== null
            ? formatRemainingDuration(cooldownRemainingMs)
            : null
        };
      });

    outboxEl.textContent = JSON.stringify(compact, null, 2);
    _cachedOutboxStats = {
      pending: compact.filter(e => e.status === 'pending').length,
      failed: compact.filter(e => e.status === 'failed').length
    };
  } catch (error) {
    outboxEl.textContent = `outbox read failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function refreshInboxSnapshot() {
  const inboxEl = document.getElementById('inbox-view');
  if (!inboxEl) {
    return;
  }

  try {
    const [entries, unreadEntries] = await Promise.all([
      getRecentInbox(20),
      idbGetAll(STORE_INBOX)
    ]);

    if (!entries.length) {
      inboxEl.textContent = '(none)';
      return;
    }

    const unreadCount = unreadEntries.filter((entry) => !entry.read).length;
    const compact = entries
      .map((entry) => ({
        msgId: entry.msgId,
        senderFp: entry.senderFp || 'unknown',
        type: entry.type || 'direct',
        read: Boolean(entry.read),
        receivedAt: entry.receivedAt || entry.ts || null
      }));

    inboxEl.textContent = JSON.stringify({
      total: entries.length,
      unread: unreadCount,
      recent: compact
    }, null, 2);
  } catch (error) {
    inboxEl.textContent = `inbox read failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function runAndRecordMaintenance(reason = 'interval') {
  try {
    const result = await runMaintenance();
    _maintenanceState = {
      lastRunAt: result.at,
      lastResult: {
        reason,
        ...result
      },
      lastError: null,
      runs: _maintenanceState.runs + 1
    };
  } catch (error) {
    _maintenanceState = {
      ..._maintenanceState,
      lastRunAt: Date.now(),
      lastError: error instanceof Error ? error.message : String(error),
      runs: _maintenanceState.runs + 1
    };
    console.error('Maintenance run failed', error);
  } finally {
    _operatorPanel?.update?.();
  }
}

function renderBleTransportState(state, details = {}) {
  const statusEl = document.getElementById('ble-status');
  if (!statusEl) {
    return;
  }

  const labels = {
    connected: '🟢 Connected',
    disconnecting: '🟠 Disconnecting',
    disconnected: '🔴 Not connected',
    queued: '🟡 Queued for retry',
    sending: '📤 Sending',
    retrying: '🔄 Retrying',
    fallback: '🧭 Falling back transport',
    failed: '❌ Send failed',
    delivered: '✅ Delivered'
  };

  const classMap = {
    connected: 'ok',
    delivered: 'ok',
    sending: 'small',
    retrying: 'small',
    queued: 'small',
    fallback: 'small',
    disconnecting: 'small',
    disconnected: 'ng',
    failed: 'ng'
  };

  let statusText = labels[state] || `ℹ️ ${state}`;
  if (state === 'queued' && details.reason === 'retry-cooldown') {
    const eta = details.nextRetryAt ? formatLocalTime(details.nextRetryAt) : null;
    const remaining = details.remainingMs !== undefined
      ? formatRemainingDuration(details.remainingMs)
      : null;
    statusText = `🟡 Retry scheduled${remaining ? ` (${remaining})` : ''}${eta ? ` @ ${eta}` : ''}`;
  }

  statusEl.textContent = statusText;
  statusEl.className = classMap[state] || '';

  if (state === 'failed' && details.error) {
    setStatus(false, `BLE send failed: ${details.error}`);
  }

  if (state === 'failed') {
    setDeliveryStatus(DELIVERY_UI_STATUS.FAILED, details.error || 'Retry exhausted');
  } else if (state === 'retrying' || state === 'fallback') {
    setDeliveryStatus(DELIVERY_UI_STATUS.RETRYING, `${state}${details.attempt ? ` (attempt ${details.attempt})` : ''}`);
  } else if (state === 'delivered') {
    setDeliveryStatus(DELIVERY_UI_STATUS.DELIVERED, details.msgId ? `msgId: ${details.msgId}` : 'Delivered');
  } else if (state === 'queued' || state === 'sending' || state === 'disconnecting' || state === 'disconnected') {
    const queuedDetail = state === 'queued' && details.reason === 'retry-cooldown'
      ? `retry-cooldown (${formatRemainingDuration(details.remainingMs || 0)})`
      : state;
    setDeliveryStatus(DELIVERY_UI_STATUS.UNSENT, queuedDetail);
  }

  renderFailureGuide(state, details);
  refreshOutboxSnapshot();
  refreshInboxSnapshot();
}

/**
 * Attach all BLE event callbacks to a BLEManager instance.
 * Extracted so that each new connection (multi-link) can reuse the same wiring.
 * Registers/unregisters the manager with meshRuntime.addLink/removeLink directly,
 * avoiding the legacy onConnectionChange path that always resolves to a no-op stub.
 *
 * @param {BLEManager} manager
 * @returns {BLEManager} the same manager (for chaining)
 */
function _attachBleCallbacks(manager) {
  manager.onConnectionChange = (connected, device) => {
    const deviceEl = document.getElementById('ble-device-name');

    if (connected && device?.id) {
      bleManagers.set(device.id, manager);
      meshRuntime?.addLink(device.id, manager);
    } else if (!connected && device?.id) {
      bleManagers.delete(device.id);
      meshRuntime?.removeLink(device.id);
    }

    if (connected) {
      renderBleTransportState('connected');
      deviceEl.textContent = device.name || device.id || 'Unknown device';
    } else {
      renderBleTransportState('disconnected');
      deviceEl.textContent = bleManagers.size > 0 ? '(multi-link active)' : '(none)';
    }
    renderMeshRuntimeState();
  };

  manager.onMessageReceived = async (message) => {
    const messagesEl = document.getElementById('ble-messages');
    appendBleMessage(messagesEl, message);

    // Auto-fill decrypt input (set both value and textContent so Playwright's
    // toContainText assertion can find the content via child text nodes)
    const msgJson = JSON.stringify(message, null, 2);
    const inputEl = document.getElementById('input');
    /** @type {HTMLTextAreaElement} */ (inputEl).value = msgJson;
    inputEl.textContent = msgJson;
    setStatus(true, tr('status.bleReceived'));

    // Auto-decrypt encrypted messages (dmesh-msg / dmesh-group-msg only).
    // Route advertisements and other protocol messages are skipped.
    if (message.kind === 'dmesh-msg' || message.kind === 'dmesh-group-msg') {
      try {
        await window.decryptMsg();
      } catch (e) {
        console.warn('[BLE] Auto-decrypt failed (may not be for this node):', e instanceof Error ? e.message : String(e));
      }
    }
  };

  manager.onTransferState = ({ state, ...details }) => {
    renderBleTransportState(state, details);
    renderMeshRuntimeState();
  };

  manager.onError = (code, error) => {
    setStatus(false, formatErrorMessage(`Bluetooth error (${code})`, error));
    console.error('BLE Error:', code, error);
  };

  manager.onForward = async (message, ingressPeerId) => {
    if (!meshRuntime) {
      return;
    }

    const relayResult = await meshRuntime.onForward({
      message,
      ingressPeerId
    });

    renderMeshRuntimeState();
    if (relayResult.action === 'skipped') {
      setStatus(true, `Router considered forwarding for ${relayResult.msgId || '(no-msg-id)'}, skipped (${relayResult.reason})`);
    }
  };

  return manager;
}

function initBLE() {
  if (!_bleTestForceSupported && !BLEManager.isSupported()) {
    document.getElementById('ble-unsupported').style.display = 'block';
    document.getElementById('ble-supported').style.display = 'none';
    return;
  }
  document.getElementById('ble-unsupported').style.display = 'none';
  document.getElementById('ble-supported').style.display = '';

  bleManagers.clear();
  meshRuntime = createMeshRuntime(getCurrentLocalPeerId());
  bleManager = _attachBleCallbacks(bleManagerFactory({
    transportManager,
    router: meshRuntime.router
  }));

  const savedBleConfig = loadSavedBleProtocolConfig();
  if (savedBleConfig) {
    bleManager.updateProtocolConfig(savedBleConfig);
  }
  renderBleProtocolConfig(bleManager.getProtocolConfig());

  renderMeshRuntimeState();
}

function initTransportLayer() {
  transportManager = createTransportManager({
    nacl,
    naclUtil: naclUtil
  });

  transportManager.onError = (error, transportName) => {
    setStatus(false, `Transport error (${transportName}): ${error instanceof Error ? error.message : String(error)}`);
  };
}

function getCurrentLocalPeerId() {
  try {
    const raw = document.getElementById('my-id')?.textContent;
    if (!raw || raw.startsWith('(')) {
      return 'unknown';
    }
    const parsed = JSON.parse(raw);
    return parsed.fp || 'unknown';
  } catch {
    return 'unknown';
  }
}

function renderMeshRuntimeState() {
  const stateEl = document.getElementById('mesh-runtime-view');
  if (!stateEl || !meshRuntime) {
    return;
  }
  stateEl.textContent = JSON.stringify(meshRuntime.getSnapshot(), null, 2);
}

function getEncryptedMessageFromUI() {
  const encryptedText = document.getElementById('encrypted').textContent;
  if (!encryptedText || encryptedText === '') {
    throw new Error('No encrypted message to send. Encrypt a message first.');
  }

  return JSON.parse(encryptedText);
}

async function sendEncryptedViaTransport(transportName) {
  if (!transportManager) {
    throw new Error('Transport manager not initialized');
  }

  const message = getEncryptedMessageFromUI();
  await transportManager.send(transportName, message);
  setStatus(true, `Encrypted message sent via ${transportName}`);
}

function loadReceivedPayloadIntoDecryptInput(message, sourceLabel) {
  const inputEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('input'));
  if (!inputEl) {
    throw new Error('Decrypt input is unavailable');
  }
  const payloadText = JSON.stringify(message, null, 2);
  inputEl.value = payloadText;
  inputEl.textContent = payloadText;
  setStatus(true, `Received encrypted payload from ${sourceLabel}. Review and decrypt.`);
}

function loadDraftIntoEncryptInput(text, sourceLabel) {
  const contentEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('content'));
  if (!contentEl) {
    throw new Error('Encrypt message input is unavailable');
  }

  contentEl.value = text;
  contentEl.textContent = text;
  updateMessageDraftMetrics();
  setStatus(true, `Received share text from ${sourceLabel}. Ready to encrypt.`);
}

function loadContactPayloadIntoImportInput(contactPayloadText, sourceLabel) {
  const contactEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('contact-input'));
  if (!contactEl) {
    throw new Error('Contact input is unavailable');
  }
  contactEl.value = contactPayloadText;
  contactEl.textContent = contactPayloadText;
  contactEl.focus();
  contactEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setStatus(true, `Received contact payload from ${sourceLabel}. Review then tap Add Contact.`);
}

function loadGroupPayloadIntoImportInput(groupPayloadText, sourceLabel) {
  const groupJsonEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('group-json'));
  const groupModeRadio = /** @type {HTMLInputElement|null} */ (
    document.querySelector('input[name="message-mode"][value="group"]')
  );
  if (!groupJsonEl || !groupModeRadio) {
    throw new Error('Group import UI is unavailable');
  }

  groupModeRadio.checked = true;
  window.setMessageMode('group');
  groupJsonEl.value = groupPayloadText;
  groupJsonEl.textContent = groupPayloadText;
  groupJsonEl.focus();
  groupJsonEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setStatus(true, `Received group payload from ${sourceLabel}. Review then tap Join Group.`);
}

function getFirstReceivedMessage(messages = []) {
  if (!messages.length) {
    throw new Error('No receivable payload found');
  }
  const candidate = messages.find((message) => message?.kind === 'dmesh-msg' || message?.kind === 'dmesh-group-msg');
  if (!candidate) {
    throw new Error('Received payload is not an encrypted message');
  }
  return candidate;
}

function applyShortcutDeepLink(hash, { silent = false } = {}) {
  const normalized = (hash || '').trim().toLowerCase();
  const contentEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('content'));
  const decryptInputEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('input'));

  if (normalized === '#encrypt') {
    contentEl?.focus();
    contentEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!silent) {
      setStatus(true, 'Shortcut opened Encrypt Message section.');
    }
    return true;
  }

  if (normalized === '#decrypt') {
    decryptInputEl?.focus();
    decryptInputEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!silent) {
      setStatus(true, 'Shortcut opened Decrypt Message section.');
    }
    return true;
  }

  return false;
}

async function consumePendingShareTargetFromServiceWorker() {
  const params = new window.URLSearchParams(window.location.search);
  if (params.get('share-target') !== '1') {
    return null;
  }

  try {
    const response = await fetch('share-target-pending', { cache: 'no-store' });
    if (response.status === 204 || !response.ok) {
      return null;
    }
    const payload = await response.json();
    return {
      title: payload?.title || '',
      text: payload?.text || '',
      files: Array.isArray(payload?.files) ? payload.files : []
    };
  } catch (error) {
    console.warn('[Startup Intake] Could not consume pending share-target payload:', error);
    return null;
  }
}

async function handleStartupIntakeFromUrl() {
  const params = new window.URLSearchParams(window.location.search);
  const pendingSharePayload = await consumePendingShareTargetFromServiceWorker();
  const sharedText = pendingSharePayload?.text || params.get('text') || '';
  const sharedTitle = pendingSharePayload?.title || params.get('title') || '';
  const sharedFiles = pendingSharePayload?.files || [];
  const hasSharePayload = Boolean(sharedText || sharedTitle || sharedFiles.length);
  const hash = window.location.hash || '';

  if (hasSharePayload) {
    const intake = resolveStartupShareTargetIntake({
      title: sharedTitle,
      text: sharedText,
      files: sharedFiles
    });
    if (intake.route === 'decrypt') {
      loadReceivedPayloadIntoDecryptInput(intake.encryptedPayload, `share target ${intake.source || 'text'}`);
      applyShortcutDeepLink('#decrypt', { silent: true });
    } else if (intake.route === 'group-import') {
      loadGroupPayloadIntoImportInput(intake.groupPayloadText, `share target ${intake.source || 'text'}`);
    } else if (intake.route === 'contact-import') {
      loadContactPayloadIntoImportInput(intake.contactPayloadText, `share target ${intake.source || 'text'}`);
    } else {
      loadDraftIntoEncryptInput(intake.draftText, `share target ${intake.source || 'text'}`);
      applyShortcutDeepLink('#encrypt', { silent: true });
    }

    const cleanUrl = `${window.location.pathname}${hash || ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
    return;
  }

  applyShortcutDeepLink(hash);
}

window.receiveFromClipboard = async function() {
  if (!transportManager) {
    setStatus(false, 'Transport manager not initialized');
    return;
  }

  try {
    const messages = await transportManager.receive('clipboard');
    const received = getFirstReceivedMessage(messages);
    loadReceivedPayloadIntoDecryptInput(received, 'clipboard');
  } catch (error) {
    setStatus(false, formatErrorMessage('Clipboard receive failed', error));
  }
};

window.receiveFromFile = function() {
  const fileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('decrypt-file-input'));
  if (!fileInput) {
    setStatus(false, 'Decrypt file input not found');
    return;
  }
  fileInput.value = '';
  fileInput.click();
};

window.handleDecryptFileSelected = async function(file) {
  if (!transportManager) {
    setStatus(false, 'Transport manager not initialized');
    return;
  }
  try {
    const messages = await transportManager.receive('file', file);
    const received = getFirstReceivedMessage(messages);
    loadReceivedPayloadIntoDecryptInput(received, `file (${file.name || 'unnamed'})`);
  } catch (error) {
    setStatus(false, formatErrorMessage('File receive failed', error));
  }
};

function getBleProtocolConfigFromInputs() {
  const readNumber = (id, fallback) => {
    const value = Number((/** @type {HTMLInputElement|null} */ (document.getElementById(id)))?.value);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    ackTimeoutMs: readNumber('ble-ack-timeout', 2500),
    retryCount: readNumber('ble-retry-count', 3),
    retryDelayMs: readNumber('ble-retry-delay', 750),
    chunkDelayMs: readNumber('ble-chunk-delay', 30),
    reassemblyTimeoutMs: readNumber('ble-reassembly-timeout', 60000)
  };
}

function renderBleProtocolConfig(config = {}) {
  const safe = {
    ackTimeoutMs: config.ackTimeoutMs || 2500,
    retryCount: config.retryCount || 3,
    retryDelayMs: config.retryDelayMs || 750,
    chunkDelayMs: config.chunkDelayMs || 30,
    reassemblyTimeoutMs: config.reassemblyTimeoutMs || 60000
  };

  /** @type {HTMLInputElement} */ (document.getElementById('ble-ack-timeout')).value = String(safe.ackTimeoutMs);
  /** @type {HTMLInputElement} */ (document.getElementById('ble-retry-count')).value = String(safe.retryCount);
  /** @type {HTMLInputElement} */ (document.getElementById('ble-retry-delay')).value = String(safe.retryDelayMs);
  /** @type {HTMLInputElement} */ (document.getElementById('ble-chunk-delay')).value = String(safe.chunkDelayMs);
  /** @type {HTMLInputElement} */ (document.getElementById('ble-reassembly-timeout')).value = String(safe.reassemblyTimeoutMs);
}

function loadSavedBleProtocolConfig() {
  try {
    const raw = localStorage.getItem(BLE_CONFIG_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

window.applyBleConfig = function() {
  if (!bleManager) {
    setStatus(false, 'BLE manager is not initialized yet');
    return;
  }

  try {
    const nextConfig = getBleProtocolConfigFromInputs();
    const applied = bleManager.updateProtocolConfig(nextConfig);
    localStorage.setItem(BLE_CONFIG_STORAGE_KEY, JSON.stringify(applied));
    renderBleProtocolConfig(applied);
    updateMessageDraftMetrics();
    setStatus(true, `BLE config updated (retry=${applied.retryCount}, ack=${applied.ackTimeoutMs}ms)`);
  } catch (error) {
    setStatus(false, `BLE config update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

window.resetBleConfig = function() {
  if (!bleManager) {
    setStatus(false, 'BLE manager is not initialized yet');
    return;
  }

  try {
    localStorage.removeItem(BLE_CONFIG_STORAGE_KEY);
    const applied = bleManager.updateProtocolConfig({
      ackTimeoutMs: 2500,
      retryCount: 3,
      retryDelayMs: 750,
      chunkDelayMs: 30,
      reassemblyTimeoutMs: 60000
    });
    renderBleProtocolConfig(applied);
    updateMessageDraftMetrics();
    setStatus(true, 'BLE config reset to defaults');
  } catch (error) {
    setStatus(false, `BLE config reset failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

window.bleScan = async function() {
  if (!meshRuntime) {
    setStatus(false, 'Bluetooth not supported');
    return;
  }

  // Create a fresh BLEManager for each new connection to support multi-link.
  // Multiple simultaneous peers each get their own manager instance,
  // all registered with meshRuntime.addLink() via _attachBleCallbacks.
  const manager = _attachBleCallbacks(bleManagerFactory({
    transportManager,
    router: meshRuntime.router
  }));
  const savedBleConfig = loadSavedBleProtocolConfig();
  if (savedBleConfig) {
    manager.updateProtocolConfig(savedBleConfig);
  }

  try {
    renderBleTransportState('queued');
    setStatus(true, 'Scanning for devices...');
    await manager.scan();
    renderBleTransportState('sending');
    setStatus(true, 'Connecting...');
    await manager.connect();
    bleManager = manager;
    renderBleProtocolConfig(bleManager.getProtocolConfig());
    updateMessageDraftMetrics();
    setStatus(true, 'Connected via Bluetooth!');
  } catch (e) {
    setStatus(false, formatErrorMessage('Bluetooth', e));
  }
};

window.bleDisconnect = function() {
  if (bleManager) {
    bleManager.disconnect();
    setStatus(true, 'Disconnected');
  }
};

window.bleSendEncrypted = async function() {
  if (!bleManager) {
    setStatus(false, 'Bluetooth not supported');
    return;
  }

  const encryptedText = document.getElementById('encrypted').textContent;
  if (!encryptedText || encryptedText === '') {
    setStatus(false, 'No encrypted message to send. Encrypt a message first.');
    return;
  }

  try {
    const message = JSON.parse(encryptedText);
    await bleManager.sendMessage(message);
    if (bleManager.isConnected) {
      setStatus(true, 'Message sent via Bluetooth!');
    } else {
      // Persist to IndexedDB so the entry survives a page reload.
      // The real BLEManager also writes to its internal store; this idbPut
      // (same msgId keyPath) is a harmless overwrite in that case, and ensures
      // the outbox is populated even when a mock BLEManager is injected.
      const now = Date.now();
      await idbPut(STORE_OUTBOX, {
        msgId: message.msgId ?? `offline-${now}`,
        recipientFp: null,
        message,
        createdAt: now,
        status: 'pending',
        attempts: 0,
        lastAttempt: null,
        schemaVersion: 4,
        priority: 1,
        ttl: now + 7 * 24 * 60 * 60 * 1000,
        linkId: null
      });
      setStatus(true, 'Bluetooth is offline. Message queued in Outbox for later delivery.');
    }
    await refreshOutboxSnapshot();
  } catch (e) {
    setStatus(false, formatErrorMessage('Bluetooth send failed', e));
  }
};

window.flushOutboxNow = async function() {
  if (!bleManager) {
    setStatus(false, 'Bluetooth not supported');
    return;
  }

  if (!bleManager.isConnected) {
    setStatus(false, 'Bluetooth is offline. Connect a device and retry flush.');
    await refreshOutboxSnapshot();
    return;
  }

  try {
    await bleManager.flushOutbox();
    await refreshOutboxSnapshot();
    await refreshInboxSnapshot();
    updateMessageDraftMetrics();
    setStatus(true, 'Outbox flush completed');
  } catch (error) {
    setStatus(false, formatErrorMessage('Outbox flush failed', error));
  }
};

/* =========================
  Utility
========================= */

function bindUIActions() {
  const actionMap = {
    initOrLoad: () => window.initOrLoad(),
    resetAll: () => window.resetAll(),
    copyMyId: () => window.copyMyId(),
    showQRCode: () => window.showQRCode(),
    exportKeys: () => window.exportKeys(),
    importKeys: () => window.importKeys(),
    addContact: () => window.addContact(),
    scanQRCode: () => window.scanQRCode(),
    refreshContacts: () => window.refreshContacts(),
    deleteSelectedContact: () => window.deleteSelectedContact(),
    verifySelectedContact: () => window.verifySelectedContact(),
    markSelectedContactCompromised: () => window.markSelectedContactCompromised(),
    createGroup: () => window.createGroup(),
    joinGroup: () => window.joinGroup(),
    copyGroupOnboardingPayload: () => window.copyGroupOnboardingPayload(),
    copySenderStateSyncPayload: () => window.copySenderStateSyncPayload(),
    addSelectedMemberToGroup: () => window.addSelectedMemberToGroup(),
    removeSelectedMemberFromGroup: () => window.removeSelectedMemberFromGroup(),
    encryptMsg: () => window.encryptMsg(),
    copyEncrypted: () => window.copyEncrypted(),
    exportEncryptedFile: () => window.exportEncryptedFile(),
    receiveFromClipboard: () => window.receiveFromClipboard(),
    receiveFromFile: () => window.receiveFromFile(),
    scanMessageQRCode: () => window.scanMessageQRCode(),
    decryptMsg: () => window.decryptMsg(),
    bleScan: () => window.bleScan(),
    bleDisconnect: () => window.bleDisconnect(),
    bleSendEncrypted: () => window.bleSendEncrypted(),
    flushOutboxNow: () => window.flushOutboxNow(),
    applyBleConfig: () => window.applyBleConfig(),
    resetBleConfig: () => window.resetBleConfig(),
    closeQRModal: () => window.closeQRModal(),
    closeQRScanner: () => window.closeQRScanner(),
    installPWA: () => window.installPWA(),
    dismissInstall: () => window.dismissInstall(),
    applyDisasterTemplate: () => window.applyDisasterTemplate(),
    applyEmergencyTemplate: () => window.applyEmergencyTemplate(),
    confirmEmergencyTemplateOverwrite: () => window.confirmEmergencyTemplateOverwrite(),
    cancelEmergencyTemplateOverwrite: () => window.cancelEmergencyTemplateOverwrite()
  };

  document.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', (event) => {
      const action = /** @type {HTMLElement} */ (event.currentTarget).dataset.action;
      const handler = actionMap[action];
      if (!handler) {
        console.warn('No handler for action:', action);
        return;
      }
      handler();
    });
  });

  document.querySelectorAll('input[name="message-mode"]').forEach((element) => {
    element.addEventListener('change', () => {
      window.setMessageMode(/** @type {HTMLInputElement} */ (element).value);
    });
  });
  document.querySelectorAll('input[name="app-mode"]').forEach((element) => {
    element.addEventListener('change', () => {
      window.setAppMode(/** @type {HTMLInputElement} */ (element).value);
    });
  });

  document.getElementById('content')?.addEventListener('input', () => {
    updateMessageDraftMetrics();
  });

  const decryptFileInput = /** @type {HTMLInputElement|null} */ (document.getElementById('decrypt-file-input'));
  decryptFileInput?.addEventListener('change', async (event) => {
    const file = /** @type {HTMLInputElement} */ (event.currentTarget).files?.[0];
    if (!file) {
      return;
    }
    await window.handleDecryptFileSelected(file);
  });
}

function setTemplateOverwritePromptVisible(visible) {
  const promptEl = document.getElementById('template-overwrite-confirm');
  if (promptEl) {
    promptEl.style.display = visible ? 'block' : 'none';
  }
}

function getDisasterTemplateMap() {
  return {
    safety: 'template.safety.content',
    supplies: 'template.supplies.content',
    evacuation: 'template.evacuation.content',
    medical: 'template.medical.content',
    shelter: 'template.shelter.content'
  };
}



function setActionBusy(actionName, busy, loadingText) {
  const button = document.querySelector(`[data-action="${actionName}"]`);
  if (!button) {
    return;
  }

  if (busy) {
    if (!/** @type {HTMLElement} */ (button).dataset.originalText) {
      /** @type {HTMLElement} */ (button).dataset.originalText = button.textContent || "";
    }
    /** @type {HTMLButtonElement} */ (button).disabled = true;
    button.classList.add('loading-btn');
    button.setAttribute('aria-busy', 'true');
    if (loadingText) {
      button.textContent = loadingText;
    }
    return;
  }

  /** @type {HTMLButtonElement} */ (button).disabled = false;
  button.classList.remove('loading-btn');
  button.removeAttribute('aria-busy');
  if (/** @type {HTMLElement} */ (button).dataset.originalText) {
    button.textContent = /** @type {HTMLElement} */ (button).dataset.originalText;
    delete /** @type {HTMLElement} */ (button).dataset.originalText;
  }
}



function estimateBleChunkCount(byteLength) {
  const activeChunkSize = bleManager?.protocolConfig?.chunkSize || DEFAULT_BLE_CHUNK_SIZE;
  if (!byteLength) {
    return 0;
  }
  return Math.ceil(byteLength / Math.max(1, activeChunkSize));
}

function updateMessageDraftMetrics() {
  const contentEl = document.getElementById('content');
  const metricsEl = document.getElementById('message-metrics');
  const progressEl = document.getElementById('message-size-progress');
  const chunkEl = document.getElementById('chunk-estimate');
  if (!contentEl || !metricsEl || !progressEl || !chunkEl) {
    return;
  }

  const text = /** @type {HTMLTextAreaElement} */ (contentEl).value || '';
  const byteLength = new TextEncoder().encode(text).length;
  const usagePercent = Math.min(100, Math.round((byteLength / MAX_MESSAGE_BYTES) * 100));
  const estimatedChunks = estimateBleChunkCount(byteLength);
  const overLimit = byteLength > MAX_MESSAGE_BYTES || estimatedChunks > MAX_BLE_CHUNKS;

  metricsEl.textContent = `${byteLength} / ${MAX_MESSAGE_BYTES} bytes • ${usagePercent}%`;
  /** @type {HTMLProgressElement} */ (progressEl).max = MAX_MESSAGE_BYTES;
  /** @type {HTMLProgressElement} */ (progressEl).value = Math.min(byteLength, MAX_MESSAGE_BYTES);
  chunkEl.textContent = `Estimated BLE chunks: ${estimatedChunks} / ${MAX_BLE_CHUNKS}`;
  chunkEl.className = overLimit ? 'small ng' : 'small';

  if (overLimit) {
    chunkEl.textContent += ' ⚠️ message may exceed BLE limits';
  }
}

function getDisasterTemplateContent(templateKey) {
  const keyMap = getDisasterTemplateMap();
  const i18nKey = keyMap[templateKey];
  return i18nKey ? tr(i18nKey) : '';
}

function getEmergencyTemplateText(templateKey, fields = {}) {
  const base = getDisasterTemplateContent(templateKey);
  if (!base) {
    return '';
  }
  const name = (fields.name || '').trim();
  const location = (fields.location || '').trim();
  const status = (fields.status || '').trim();
  const people = (fields.people || '').trim();
  const details = (fields.details || '').trim();
  const lines = [base];
  if (name) lines.push(`Name/Team: ${name}`);
  if (location) lines.push(`Location: ${location}`);
  if (status) lines.push(`Status/Need: ${status}`);
  if (people) lines.push(`People count: ${people}`);
  if (details) lines.push(`Details: ${details}`);
  return lines.join('\n');
}

function applyTemplateToContent(templateText) {
  const contentEl = document.getElementById('content');
  if (!templateText) {
    setStatus(false, tr('status.templateLoadFail'));
    return;
  }

  const current = /** @type {HTMLTextAreaElement} */ (contentEl).value?.trim();
  if (current) {
    pendingTemplateText = templateText;
    setTemplateOverwritePromptVisible(true);
    return;
  }

  /** @type {HTMLTextAreaElement} */ (contentEl).value = templateText;
  contentEl.textContent = templateText;
  updateMessageDraftMetrics();
  contentEl.focus();
  pendingTemplateText = '';
  setTemplateOverwritePromptVisible(false);
  setStatus(true, tr('status.templateApplied'));
}

window.confirmEmergencyTemplateOverwrite = function() {
  if (!pendingTemplateText) {
    return;
  }
  const contentEl = document.getElementById('content');
  /** @type {HTMLTextAreaElement} */ (contentEl).value = pendingTemplateText;
  updateMessageDraftMetrics();
  contentEl.focus();
  pendingTemplateText = '';
  setTemplateOverwritePromptVisible(false);
  setStatus(true, tr('status.templateApplied'));
};

window.cancelEmergencyTemplateOverwrite = function() {
  pendingTemplateText = '';
  setTemplateOverwritePromptVisible(false);
  setStatus(true, tr('status.templateCancel'));
};

window.applyDisasterTemplate = function() {
  const selector = document.getElementById('disaster-template');
  const key = (/** @type {HTMLSelectElement|null} */ (selector))?.value || '';
  if (!key) {
    setStatus(false, tr('status.templateSelect'));
    return;
  }
  applyTemplateToContent(getDisasterTemplateContent(key));
};

window.applyEmergencyTemplate = function() {
  const key = (/** @type {HTMLSelectElement|null} */ (document.getElementById('emergency-template')))?.value || 'safety';
  const templateText = getEmergencyTemplateText(key, {
    name: (/** @type {HTMLInputElement|null} */ (document.getElementById('emergency-name')))?.value || '',
    location: (/** @type {HTMLInputElement|null} */ (document.getElementById('emergency-location')))?.value || '',
    status: (/** @type {HTMLInputElement|null} */ (document.getElementById('emergency-status')))?.value || '',
    people: (/** @type {HTMLInputElement|null} */ (document.getElementById('emergency-people')))?.value || '',
    details: (/** @type {HTMLInputElement|null} */ (document.getElementById('emergency-details')))?.value || ''
  });
  applyTemplateToContent(templateText);
};

window.setAppMode = function(mode) {
  const activeMode = mode === 'advanced' ? 'advanced' : 'emergency';
  document.querySelectorAll('input[name="app-mode"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLInputElement} */ (el).value === activeMode;
  });
  const advancedEl = document.getElementById('advanced-mode-sections');
  const emergencyEl = document.getElementById('emergency-mode-section');
  if (advancedEl) {
    advancedEl.style.display = activeMode === 'advanced' ? 'block' : 'none';
  }
  if (emergencyEl) {
    emergencyEl.style.display = activeMode === 'emergency' ? 'block' : 'none';
  }
  localStorage.setItem(APP_MODE_STORAGE_KEY, activeMode);
};

function getLocalSignPKB64(my) {
  return naclUtil.encodeBase64(my.signPKu8);
}

function hydrateLocalSenderState(state) {
  return GroupMesh.hydrateSenderKey(state, naclUtil);
}

function encodeSenderState(senderKey) {
  return {
    version: senderKey.version,
    chainKey: naclUtil.encodeBase64(senderKey.chainKey)
  };
}

function senderSignPKToMemberFp(senderSignPK) {
  try {
    const senderSignPKu8 = naclUtil.decodeBase64(senderSignPK);
    const senderFp = DMesh.fingerprintFromSignPK(senderSignPKu8, nacl);
    return naclUtil.encodeBase64(senderFp);
  } catch {
    return null;
  }
}

async function saveSenderStateMonotonic(groupId, senderSignPK, incomingSenderKeyState) {
  const existingState = await getSenderKeyState(groupId, senderSignPK);
  if (!shouldAcceptIncomingSenderState(existingState, incomingSenderKeyState)) {
    return false;
  }
  await saveSenderKeyState(groupId, senderSignPK, incomingSenderKeyState);
  return true;
}

function mergeUniqueMembers(...memberLists) {
  return Array.from(new Set(memberLists.flat().filter(Boolean)));
}

function shortFp(fp) {
  return fp ? `${fp.slice(0, 12)}...` : 'unknown';
}

async function getContactByFp(fp) {
  if (!fp) return null;
  return idbGet(STORE_CONTACTS, fp);
}

async function copyTextAndFillGroupTextarea(payloadText) {
  /** @type {HTMLInputElement} */ (document.getElementById('group-json')).value = payloadText;
  try {
    await navigator.clipboard.writeText(payloadText);
    return true;
  } catch {
    return false;
  }
}

/* =========================
  Key Management
========================= */
async function ensureMyKeys() {
  let signPK = await idbGet(STORE_KEYS, "my_sign_pk");
  let signSK = await idbGet(STORE_KEYS, "my_sign_sk");
  let boxPK = await idbGet(STORE_KEYS, "my_box_pk");
  let boxSK = await idbGet(STORE_KEYS, "my_box_sk");

  if (!signPK || !signSK) {
    const kp = DMesh.generateSignKeyPair(nacl);
    signPK = naclUtil.encodeBase64(kp.publicKey);
    signSK = naclUtil.encodeBase64(kp.secretKey);
    await idbPut(STORE_KEYS, signPK, "my_sign_pk");
    await idbPut(STORE_KEYS, signSK, "my_sign_sk");
  }

  if (!boxPK || !boxSK) {
    const kp = DMesh.generateBoxKeyPair(nacl);
    boxPK = naclUtil.encodeBase64(kp.publicKey);
    boxSK = naclUtil.encodeBase64(kp.secretKey);
    await idbPut(STORE_KEYS, boxPK, "my_box_pk");
    await idbPut(STORE_KEYS, boxSK, "my_box_sk");
  }

  return {
    signPKu8: naclUtil.decodeBase64(signPK),
    signSKu8: naclUtil.decodeBase64(signSK),
    boxPKu8: naclUtil.decodeBase64(boxPK),
    boxSKu8: naclUtil.decodeBase64(boxSK)
  };
}

async function buildMySignedIdentityPayload() {
  const my = await ensureMyKeys();
  return DMesh.createSignedPublicIdentity({
    name: "(optional)",
    signPK: my.signPKu8,
    signSK: my.signSKu8,
    boxPK: my.boxPKu8
  }, nacl, naclUtil);
}

window.initOrLoad = async function() {
  setActionBusy('initOrLoad', true, '🔑 Preparing...');
  try {
    const myId = await buildMySignedIdentityPayload();

    document.getElementById("my-id").textContent = JSON.stringify(myId, null, 2);
    meshRuntime?.setLocalPeerId(myId.fp);
    renderMeshRuntimeState();
    await window.refreshContacts();
    await window.refreshGroups();
    await refreshOutboxSnapshot();
    setStatus(true, `Keys ready. Fingerprint: ${myId.fp}`);
  } catch (e) {
    setStatus(false, e instanceof Error ? e.message : String(e));
  } finally {
    setActionBusy('initOrLoad', false);
  }
};

window.copyMyId = async function() {
  const myId = await buildMySignedIdentityPayload();
  const idText = JSON.stringify(myId, null, 2);
  document.getElementById("my-id").textContent = idText;
  await navigator.clipboard.writeText(idText);
  setStatus(true, "Signed public ID copied to clipboard");
};

window.exportKeys = async function() {
  const password = prompt("Enter password to encrypt your keys:");
  if (!password) return;

  // Check password strength
  const strength = checkPasswordStrength(password);
  if (strength.strength === "weak") {
    if (!confirm("WARNING: Password is weak (" + strength.message + ").\n\nUse a stronger password for better security.\n\nContinue anyway?")) return;
  }

  try {
    const signPK = await idbGet(STORE_KEYS, "my_sign_pk");
    const signSK = await idbGet(STORE_KEYS, "my_sign_sk");
    const boxPK = await idbGet(STORE_KEYS, "my_box_pk");
    const boxSK = await idbGet(STORE_KEYS, "my_box_sk");

    if (!signPK || !signSK || !boxPK || !boxSK) {
      return alert("No keys to export. Generate keys first.");
    }

    setStatus(true, "Encrypting keys (this may take a moment)...");

    const backup = await encryptKeys(
      { signPK, signSK, boxPK, boxSK },
      password,
      nacl,
      naclUtil
    );

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeline-mesh-keys-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const kdfLabel = backup.kdf === "argon2id" ? "Argon2id" : "PBKDF2";
    setStatus(true, "Keys exported securely (" + kdfLabel + " + NaCl secretbox)");
  } catch (e) {
    setStatus(false, "Export failed: " + (e instanceof Error ? e.message : String(e)));
  }
};

window.importKeys = async function() {
  const password = prompt("Enter password to decrypt your keys:");
  if (!password) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    try {
      const file = /** @type {HTMLInputElement} */ (e.target).files[0];
      const text = await file.text();
      const backup = JSON.parse(text);

      let keys;

      if (backup.version === 2) {
        // Secure format (PBKDF2/Argon2id + NaCl secretbox)
        setStatus(true, "Decrypting keys (this may take a moment)...");
        keys = await decryptKeys(backup, password, nacl, naclUtil);
      } else if (backup.version === 1 && backup.keys) {
        // Legacy XOR format - decrypt and warn
        const passwordHash = nacl.hash(naclUtil.decodeUTF8(password));
        const xorDecrypt = (encrypted) => {
          const encryptedBytes = naclUtil.decodeBase64(encrypted);
          const decrypted = new Uint8Array(encryptedBytes.length);
          for (let i = 0; i < encryptedBytes.length; i++) {
            decrypted[i] = encryptedBytes[i] ^ passwordHash[i % passwordHash.length];
          }
          return naclUtil.encodeBase64(decrypted);
        };
        keys = {
          signPK: xorDecrypt(backup.keys.signPK),
          signSK: xorDecrypt(backup.keys.signSK),
          boxPK: xorDecrypt(backup.keys.boxPK),
          boxSK: xorDecrypt(backup.keys.boxSK)
        };
      } else {
        return alert("Invalid or unsupported backup file format");
      }

      // Verify key lengths
      if (naclUtil.decodeBase64(keys.signPK).length !== 32 ||
          naclUtil.decodeBase64(keys.signSK).length !== 64 ||
          naclUtil.decodeBase64(keys.boxPK).length !== 32 ||
          naclUtil.decodeBase64(keys.boxSK).length !== 32) {
        return alert("Decryption failed - wrong password or corrupted file");
      }

      // Save to IndexedDB
      await idbPut(STORE_KEYS, keys.signPK, "my_sign_pk");
      await idbPut(STORE_KEYS, keys.signSK, "my_sign_sk");
      await idbPut(STORE_KEYS, keys.boxPK, "my_box_pk");
      await idbPut(STORE_KEYS, keys.boxSK, "my_box_sk");

      await window.initOrLoad();

      if (backup.version === 1) {
        setStatus(true, "Keys imported from LEGACY backup. Re-export recommended for better security.");
      } else {
        setStatus(true, "Keys imported successfully (secure format)");
      }
    } catch (e) {
      setStatus(false, "Import failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  input.click();
};

function resetSelectWithPlaceholder(selectEl, placeholder) {
  if (!selectEl) return;
  const option = document.createElement("option");
  option.value = "";
  option.textContent = placeholder;
  selectEl.replaceChildren(option);
}

window.resetAll = async function() {
  if (!confirm("⚠️ Delete ALL data (keys, contacts, replay DB)?\nThis cannot be undone!")) return;

  await resetDatabase();

  document.getElementById("my-id").textContent = tr('keys.notLoaded');
  document.getElementById("contacts-view").textContent = tr('contacts.none');
  resetSelectWithPlaceholder(document.getElementById("recipient-select"), tr('contacts.recipient.placeholder'));
  resetSelectWithPlaceholder(document.getElementById("group-select"), tr('encrypt.group.select'));
  document.getElementById("encrypted").textContent = "";
  document.getElementById("decrypted").textContent = "";
  setStatus(true, "All data deleted");
};


/* =========================
   Keyboard Shortcuts
========================= */
document.addEventListener("keydown", (event) => {

  // Don't trigger shortcuts while typing
  const tag = /** @type {HTMLElement} */ (event.target).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  // Ctrl + E → Encrypt
  if (event.ctrlKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    window.encryptMsg();
  }

  // Ctrl + D → Decrypt
  if (event.ctrlKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    window.decryptMsg();
  }

  // Ctrl + K → Generate / Load Keys
  if (event.ctrlKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    window.initOrLoad();
  }

  // Ctrl + Shift + C → Copy encrypted message to clipboard
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    window.copyEncrypted();
  }

  // Escape → Close open modal, or clear status message
  if (event.key === "Escape") {
    const qrModal = document.getElementById("qr-modal");
    const scannerModal = document.getElementById("qr-scanner-modal");

    if (qrModal.style.display === "block") {
      window.closeQRModal();
    } else if (scannerModal.style.display === "block") {
      window.closeQRScanner();
    } else {
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "";
    }
  }
});



/* =========================
  Contacts
========================= */
window.addContact = async function() {
  try {
    const obj = JSON.parse(/** @type {HTMLInputElement} */ (document.getElementById("contact-input")).value.trim());
    const verification = DMesh.verifyPublicIdentityPayload(obj, nacl, naclUtil);
    const fpB64 = verification.identity.fp;

    const contact = {
      fp: fpB64,
      name: verification.identity.name,
      signPK: verification.identity.signPK,
      boxPK: verification.identity.boxPK,
      addedAt: Date.now(),
      verified: VERIFICATION_STATUS.UNVERIFIED
    };

    await saveContact(contact);
    await window.refreshContacts();
    if (verification.signed) {
      setStatus(true, `Contact saved: ${contact.name} (fp: ${fpB64.slice(0, 16)}...) • signed identity verified`);
    } else {
      setStatus(false, `Contact saved with WARNING: ${contact.name} (fp: ${fpB64.slice(0, 16)}...) • ${verification.warning}`);
    }
  } catch (e) {
    setStatus(false, "Add contact failed: " + (e instanceof Error ? e.message : String(e)));
  }
};

window.refreshContacts = async function() {
  const contacts = await idbGetAll(STORE_CONTACTS);
  contacts.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const sel = document.getElementById("recipient-select");
  const selectedFpBefore = /** @type {HTMLSelectElement} */ (sel).value;
  resetSelectWithPlaceholder(sel, "Select Recipient");

  for (const c of contacts) {
    const opt = document.createElement("option");
    opt.value = c.fp;
    opt.textContent = `${c.name} [${c.fp.slice(0, 12)}...] ${getVerificationBadge(getContactVerificationStatus(c))}`;
    sel.appendChild(opt);
  }

  sel.onchange = async () => {
    syncEncryptRecipientLabel(sel);
    await refreshSelectedContactDetails();
  };

  const groupMemberSel = document.getElementById("group-member-select");
  if (groupMemberSel) {
    resetSelectWithPlaceholder(groupMemberSel, "Select Contact");
    for (const c of contacts) {
      const opt = document.createElement("option");
      opt.value = c.fp;
      opt.textContent = `${c.name} [${c.fp.slice(0, 12)}...]`;
      groupMemberSel.appendChild(opt);
    }
  }

  document.getElementById("contacts-view").textContent =
    contacts.length ? JSON.stringify(contacts, null, 2) : "(none)";

  if (selectedFpBefore && contacts.some((contact) => contact.fp === selectedFpBefore)) {
    /** @type {HTMLSelectElement} */ (sel).value = selectedFpBefore;
  }
  syncEncryptRecipientLabel(sel);
  await refreshSelectedContactDetails();
};

window.deleteSelectedContact = async function() {
  const fp = /** @type {HTMLInputElement} */ (document.getElementById("recipient-select")).value;
  if (!fp) return alert("Select a contact first");

  await idbDel(STORE_CONTACTS, fp);
  await window.refreshContacts();
  setStatus(true, `Contact deleted (fp: ${fp.slice(0, 16)}...)`);
};

window.verifySelectedContact = async function() {
  const fp = /** @type {HTMLInputElement} */ (document.getElementById("recipient-select")).value;
  if (!fp) return alert("Select a contact first");

  await verifyContact(fp);
  await window.refreshContacts();
  setStatus(true, `Contact verified (fp: ${fp.slice(0, 16)}...)`);
};

window.markSelectedContactCompromised = async function() {
  const fp = /** @type {HTMLInputElement} */ (document.getElementById("recipient-select")).value;
  if (!fp) return alert("Select a contact first");

  const reason = prompt("Reason for compromised status (optional):") || undefined;
  await markContactCompromised(fp, reason);
  await window.refreshContacts();
  setStatus(false, `Contact marked compromised (fp: ${fp.slice(0, 16)}...)`);
};


/* =========================
  Group Messaging
========================= */
window.setMessageMode = function(mode) {
  const isGroup = mode === 'group';
  document.querySelectorAll('input[name="message-mode"]').forEach((el) => {
    /** @type {HTMLInputElement} */ (el).checked = /** @type {HTMLInputElement} */ (el).value === mode;
  });
  document.getElementById('direct-controls').style.display = isGroup ? 'none' : 'block';
  document.getElementById('group-controls').style.display = isGroup ? 'block' : 'none';
};

window.refreshGroups = async function() {
  const groups = await getAllGroups();
  groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const sel = document.getElementById('group-select');
  resetSelectWithPlaceholder(sel, "Select Group");

  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = `${g.name} [${g.id.slice(0, 8)}...]`;
    sel.appendChild(opt);
  }

  sel.onchange = async () => {
    await renderSelectedGroup();
  };

  await renderSelectedGroup();
};

async function renderSelectedGroup() {
  const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
  if (!groupId) {
    document.getElementById('group-view').textContent = '(no group selected)';
    return;
  }
  const group = await getGroup(groupId);
  if (!group) {
    document.getElementById('group-view').textContent = '(group not found)';
    return;
  }
  const members = await getGroupMembers(groupId);
  document.getElementById('group-view').textContent = JSON.stringify({ ...group, members }, null, 2);
}

async function forceRotateSenderKey(group) {
  group.senderKey = {
    version: (group.senderKey?.version || 0) + 1,
    chainKey: naclUtil.encodeBase64(nacl.randomBytes(32))
  };
  group.updatedAt = Date.now();
  await saveGroup(group);

  const my = await ensureMyKeys();
  await saveSenderKeyState(group.id, getLocalSignPKB64(my), group.senderKey);
}

window.createGroup = async function() {
  try {
    const name = (/** @type {HTMLInputElement} */ (document.getElementById('group-name')).value || '').trim();
    if (!name) return alert('Group name is required');

    const my = await ensureMyKeys();
    const myFp = naclUtil.encodeBase64(DMesh.fingerprintFromSignPK(my.signPKu8, nacl));
    const group = GroupMesh.createGroup({
      name,
      createdBy: myFp,
      members: [myFp]
    }, nacl, naclUtil);

    await saveGroup(group);
    await saveGroupMembers(group.id, group.members);
    await saveSenderKeyState(group.id, getLocalSignPKB64(my), group.senderKey);

    await window.refreshGroups();
    /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value = group.id;
    await renderSelectedGroup();
    setStatus(true, `Group created: ${group.name}`);
  } catch (e) {
    setStatus(false, 'Create group failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

window.joinGroup = async function() {
  try {
    const raw = /** @type {HTMLInputElement} */ (document.getElementById('group-json')).value.trim();
    const parsed = JSON.parse(raw);
    const normalized = normalizeImportedGroupPayload(parsed);
    const authenticityWarning = normalized.authenticity?.warning || null;
    const signerSignPK = normalized.authenticity?.signerSignPK || null;

    const my = await ensureMyKeys();
    const myFp = naclUtil.encodeBase64(DMesh.fingerprintFromSignPK(my.signPKu8, nacl));
    if (normalized.mode === 'sender-sync') {
      const syncPayload = normalized.payload;
      const members = await getGroupMembers(syncPayload.groupId);
      const senderMemberFp = senderSignPKToMemberFp(syncPayload.senderSignPK);
      const signerMemberFp = signerSignPK ? senderSignPKToMemberFp(signerSignPK) : null;
      const [senderContact, signerContact] = await Promise.all([
        getContactByFp(senderMemberFp),
        getContactByFp(signerMemberFp)
      ]);
      const syncTrustChecks = [
        evaluateGroupActorVerification({
          actorLabel: `sender ${shortFp(senderMemberFp)}`,
          contact: senderContact
        })
      ];
      if (signerSignPK) {
        syncTrustChecks.push(evaluateGroupActorVerification({
          actorLabel: `signer ${shortFp(signerMemberFp)}`,
          contact: signerContact
        }));
      }
      const syncTrustSummary = summarizeGroupVerificationOutcomes(syncTrustChecks);
      if (!syncTrustSummary.ok) {
        setStatus(false, `Sender state sync rejected. ${syncTrustSummary.message}`);
        return;
      }
      if (syncTrustSummary.level === 'unverified') {
        const proceed = confirm(`${syncTrustSummary.message}\n\nContinue sender-state sync import?`);
        if (!proceed) {
          setStatus(false, 'Sender state sync canceled by user due to unverified signer/sender.');
          return;
        }
      }
      if (normalized.authenticity?.signed) {
        if (!signerSignPK || signerSignPK !== syncPayload.senderSignPK) {
          throw new Error('Sender-state sync signature verification failed: signer must match senderSignPK');
        }
        if (members.length && (!signerMemberFp || !members.includes(signerMemberFp))) {
          throw new Error('Sender-state sync signature verification failed: signer is not a current group member');
        }
      }
      if (members.length && (!senderMemberFp || !members.includes(senderMemberFp))) {
        throw new Error('Sender state sync rejected: sender is not a current group member');
      }

      const accepted = await saveSenderStateMonotonic(syncPayload.groupId, syncPayload.senderSignPK, syncPayload.senderKeyState);
      if (!accepted) {
        const warningSuffix = authenticityWarning ? ` ⚠️ ${authenticityWarning}` : '';
        const verificationSuffix = syncTrustSummary.message ? ` ⚠️ ${syncTrustSummary.message}` : '';
        setStatus(true, `Sender state sync skipped (kept newer/local richer state) for ${syncPayload.senderSignPK.slice(0, 12)}...${warningSuffix}${verificationSuffix}`);
        return;
      }
      const warningSuffix = authenticityWarning ? ` ⚠️ ${authenticityWarning}` : '';
      const verificationSuffix = syncTrustSummary.message ? ` ⚠️ ${syncTrustSummary.message}` : '';
      setStatus(true, `Sender state synced for group ${syncPayload.groupId.slice(0, 8)}... (${syncPayload.senderSignPK.slice(0, 12)}...)${warningSuffix}${verificationSuffix}`);
      return;
    }

    const onboardingPayload = normalized.mode === 'onboarding'
      ? normalized.payload
      : { group: normalized.payload, senderStates: [] };
    if (normalized.authenticity?.signed) {
      const signerMemberFp = signerSignPK ? senderSignPKToMemberFp(signerSignPK) : null;
      const onboardingMembers = onboardingPayload.group.members || [];
      if (!signerMemberFp || !onboardingMembers.includes(signerMemberFp)) {
        throw new Error('Onboarding payload signature verification failed: signer is not in onboarding members');
      }
    }

    const onboardingMembers = onboardingPayload.group.members || [];
    const memberContacts = await Promise.all(onboardingMembers.map((fp) => getContactByFp(fp)));
    const onboardingTrustChecks = onboardingMembers.map((fp, idx) => evaluateGroupActorVerification({
      actorLabel: `member ${shortFp(fp)}`,
      contact: memberContacts[idx]
    }));
    if (signerSignPK) {
      const signerMemberFp = senderSignPKToMemberFp(signerSignPK);
      const signerContact = await getContactByFp(signerMemberFp);
      onboardingTrustChecks.push(evaluateGroupActorVerification({
        actorLabel: `signer ${shortFp(signerMemberFp)}`,
        contact: signerContact
      }));
    }
    const onboardingTrustSummary = summarizeGroupVerificationOutcomes(onboardingTrustChecks);
    if (!onboardingTrustSummary.ok) {
      setStatus(false, `Join group rejected. ${onboardingTrustSummary.message}`);
      return;
    }
    if (onboardingTrustSummary.level === 'unverified') {
      const proceed = confirm(`${onboardingTrustSummary.message}\n\nContinue onboarding import?`);
      if (!proceed) {
        setStatus(false, 'Join group canceled by user due to unverified members/signer.');
        return;
      }
    }

    const mergedMembers = mergeUniqueMembers(onboardingMembers, [myFp]);
    const groupEntry = {
      ...onboardingPayload.group,
      members: mergedMembers
    };

    await saveGroup(groupEntry);
    await saveGroupMembers(groupEntry.id, mergedMembers);

    const filteredSenderStates = filterSenderStateEntriesByMembers(
      onboardingPayload.senderStates || [],
      mergedMembers,
      senderSignPKToMemberFp
    );

    for (const entry of filteredSenderStates) {
      if (entry?.senderSignPK && entry?.senderKeyState) {
        await saveSenderStateMonotonic(groupEntry.id, entry.senderSignPK, entry.senderKeyState);
      }
    }

    const localSignPK = getLocalSignPKB64(my);
    const localSenderState = await getSenderKeyState(groupEntry.id, localSignPK);
    if (!localSenderState) {
      await saveSenderKeyState(groupEntry.id, localSignPK, groupEntry.senderKey);
    }

    await window.refreshGroups();
    /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value = groupEntry.id;
    await renderSelectedGroup();
    const sharedStatesCount = filteredSenderStates.length;
    const warningSuffix = authenticityWarning ? ` ⚠️ ${authenticityWarning}` : '';
    const verificationSuffix = onboardingTrustSummary.message ? ` ⚠️ ${onboardingTrustSummary.message}` : '';
    setStatus(true, `Joined group: ${groupEntry.name || groupEntry.id} (sender states: ${sharedStatesCount})${warningSuffix}${verificationSuffix}`);
  } catch (e) {
    setStatus(false, 'Join group failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

window.copyGroupOnboardingPayload = async function() {
  try {
    const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
    if (!groupId) {
      throw new Error('Select a group');
    }
    const group = await getGroup(groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    const members = await getGroupMembers(groupId);
    const senderStates = await getSenderKeysForGroup(groupId);
    const filteredSenderStates = filterSenderStateEntriesByMembers(
      senderStates,
      members,
      senderSignPKToMemberFp
    );
    const payload = {
      type: 'lifeline-group-onboarding-v1',
      exportedAt: Date.now(),
      group: {
        ...group,
        members
      },
      senderStates: filteredSenderStates.map((entry) => ({
        senderSignPK: entry.senderSignPK,
        senderKeyState: entry.senderKeyState
      }))
    };
    const my = await ensureMyKeys();
    const signedPayload = GroupMesh.createSignedGroupPayloadEnvelope({
      payloadType: payload.type,
      payloadBody: payload,
      exportedAt: payload.exportedAt,
      exportedBySignPK: naclUtil.encodeBase64(my.signPKu8),
      signerSignSK: my.signSKu8
    }, nacl, naclUtil);
    const payloadText = JSON.stringify(signedPayload, null, 2);
    const copied = await copyTextAndFillGroupTextarea(payloadText);
    setStatus(true, copied
      ? `Onboarding payload copied for ${group.name || group.id}`
      : `Onboarding payload prepared in Group JSON for ${group.name || group.id}`);
  } catch (e) {
    setStatus(false, 'Copy onboarding payload failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

window.copySenderStateSyncPayload = async function() {
  try {
    const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
    if (!groupId) {
      throw new Error('Select a group');
    }
    const my = await ensureMyKeys();
    const senderSignPK = getLocalSignPKB64(my);
    const senderKeyState = await getSenderKeyState(groupId, senderSignPK);
    if (!senderKeyState) {
      throw new Error('Local sender state not found');
    }
    const payload = {
      type: 'lifeline-sender-state-sync-v1',
      exportedAt: Date.now(),
      groupId,
      senderSignPK,
      senderKeyState
    };
    const signedPayload = GroupMesh.createSignedGroupPayloadEnvelope({
      payloadType: payload.type,
      payloadBody: payload,
      exportedAt: payload.exportedAt,
      exportedBySignPK: senderSignPK,
      signerSignSK: my.signSKu8
    }, nacl, naclUtil);
    const payloadText = JSON.stringify(signedPayload, null, 2);
    const copied = await copyTextAndFillGroupTextarea(payloadText);
    setStatus(true, copied
      ? 'Sender-state sync payload copied'
      : 'Sender-state sync payload prepared in Group JSON');
  } catch (e) {
    setStatus(false, 'Copy sender-state payload failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

window.addSelectedMemberToGroup = async function() {
  try {
    const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
    const memberFp = /** @type {HTMLInputElement} */ (document.getElementById('group-member-select')).value;
    if (!groupId || !memberFp) return alert('Select group and member');

    const group = await getGroup(groupId);
    if (!group) return alert('Group not found');
    const memberContact = await getContactByFp(memberFp);
    const memberTrust = evaluateGroupActorVerification({
      actorLabel: `member ${shortFp(memberFp)}`,
      contact: memberContact
    });
    if (memberTrust.blocked) {
      setStatus(false, memberTrust.details);
      return;
    }
    if (memberTrust.warning) {
      const proceed = confirm(`${memberTrust.details}\n\nContinue adding this member to the group?`);
      if (!proceed) {
        setStatus(false, 'Add member canceled by user due to unverified contact.');
        return;
      }
    }

    const members = new Set(await getGroupMembers(groupId));
    members.add(memberFp);
    await addGroupMember(groupId, memberFp);
    group.members = Array.from(members);

    await forceRotateSenderKey(group);
    await saveGroupMembers(groupId, group.members);
    await renderSelectedGroup();
    const verificationSuffix = memberTrust.warning ? ` ⚠️ ${memberTrust.details}` : '';
    setStatus(true, `Member added. SenderKey rotated.${verificationSuffix}`);
  } catch (e) {
    setStatus(false, 'Add member failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

window.removeSelectedMemberFromGroup = async function() {
  try {
    const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
    const memberFp = /** @type {HTMLInputElement} */ (document.getElementById('group-member-select')).value;
    if (!groupId || !memberFp) return alert('Select group and member');

    const group = await getGroup(groupId);
    if (!group) return alert('Group not found');

    await removeGroupMember(groupId, memberFp);
    const senderStates = await getSenderKeysForGroup(groupId);
    for (const entry of senderStates) {
      const senderFp = senderSignPKToMemberFp(entry?.senderSignPK);
      if (senderFp && senderFp === memberFp) {
        await removeSenderKeyState(groupId, entry.senderSignPK);
      }
    }
    const members = (await getGroupMembers(groupId)).filter((fp) => fp !== memberFp);
    group.members = members;

    await forceRotateSenderKey(group);
    await saveGroupMembers(groupId, members);
    await renderSelectedGroup();
    setStatus(true, 'Member removed. SenderKey rotated.');
  } catch (e) {
    setStatus(false, 'Remove member failed: ' + (e instanceof Error ? e.message : String(e)));
  }
};

/* =========================
  Encryption
========================= */
window.encryptMsg = async function() {
  setActionBusy('encryptMsg', true, '🔒 Encrypting...');
  setStatus(true, '🔒 Encrypting...');
  try {
    const content = /** @type {HTMLInputElement} */ (document.getElementById("content")).value || "";
    const mode = (/** @type {HTMLInputElement|null} */ (document.querySelector('input[name="message-mode"]:checked')))?.value || 'direct';
    const my = await ensureMyKeys();

    if (mode === 'group') {
      const groupId = /** @type {HTMLInputElement} */ (document.getElementById('group-select')).value;
      if (!groupId) return alert('Select a group');

      const group = await getGroup(groupId);
      if (!group) return alert('Group not found');

      const localSignPK = getLocalSignPKB64(my);
      const senderState = await getSenderKeyState(groupId, localSignPK);
      if (!senderState) {
        throw new Error('SenderKey state not found. Re-join group.');
      }

      const senderKey = hydrateLocalSenderState(senderState);
      const encrypted = GroupMesh.encryptGroupMessage({
        content,
        groupId,
        senderKey,
        senderSignPK: my.signPKu8,
        senderSignSK: my.signSKu8
      }, nacl, naclUtil);

      await saveSenderKeyState(groupId, localSignPK, {
        ...encodeSenderState(encrypted.nextSenderKey),
        prevVersion: senderKey.version,
        prevChainKey: naclUtil.encodeBase64(senderKey.chainKey)
      });
      document.getElementById("encrypted").textContent = JSON.stringify(encrypted.message, null, 2);
      document.getElementById("encrypted-actions").style.display = "flex";
      setStatus(true, `Group encrypted for ${group.name}`);
      return;
    }

    const fp = /** @type {HTMLInputElement} */ (document.getElementById("recipient-select")).value;
    if (!fp) return alert("Select a recipient");

    const recipient = await idbGet(STORE_CONTACTS, fp);
    if (!recipient) return alert("Recipient not found");
    let verificationWarning = '';

    const recipientStatus = getContactVerificationStatus(recipient);
    if (recipientStatus === VERIFICATION_STATUS.COMPROMISED) {
      if (CONTACT_BLOCK_COMPROMISED_SEND) {
        setStatus(false, `Blocked: ${recipient.name} is marked compromised. Re-verify identity before sending.`);
        return;
      }
      if (!confirm(`Warning: ${recipient.name} is marked compromised. Continue sending anyway?`)) {
        return;
      }
    } else if (recipientStatus !== VERIFICATION_STATUS.VERIFIED) {
      verificationWarning = ` ⚠️ ${recipient.name} is unverified (TOFU). Verify safety number.`;
    }

    const message = await encryptInWorker({
      content,
      senderSignPK: my.signPKu8,
      senderSignSK: my.signSKu8,
      senderBoxPK: my.boxPKu8,
      senderBoxSK: my.boxSKu8,
      recipientBoxPK: naclUtil.decodeBase64(recipient.boxPK)
    });

    document.getElementById("encrypted").textContent = JSON.stringify(message, null, 2);
    document.getElementById("encrypted-actions").style.display = "flex";
    setStatus(true, `Encrypted for ${recipient.name}.${verificationWarning}`);
  } catch (e) {
    setStatus(false, formatErrorMessage('Encryption failed', e));
  } finally {
    setActionBusy('encryptMsg', false);
  }
};

window.copyEncrypted = async function() {
  try {
    await sendEncryptedViaTransport('clipboard');
  } catch (e) {
    setStatus(false, formatErrorMessage('Copy failed', e));
  }
};

window.exportEncryptedFile = async function() {
  try {
    await sendEncryptedViaTransport('file');
  } catch (e) {
    setStatus(false, formatErrorMessage('File export failed', e));
  }
};

/* =========================
  Decryption
========================= */

window.decryptMsg = async function() {
  setActionBusy('decryptMsg', true, '🔓 Decrypting...');
  try {
    renderDecryptVerification(null);
    const message = JSON.parse(/** @type {HTMLInputElement} */ (document.getElementById("input")).value.trim());
    const my = await ensureMyKeys();

    if (message.kind === 'dmesh-group-msg') {
      const group = await getGroup(message.groupId);
      if (!group) throw new Error('Unknown group');

      const members = await getGroupMembers(message.groupId);
      const senderSignPKu8 = naclUtil.decodeBase64(message.senderSignPK);
      const senderFpB64 = naclUtil.encodeBase64(DMesh.fingerprintFromSignPK(senderSignPKu8, nacl));
      if (!members.includes(senderFpB64)) {
        throw new Error('Sender is not a current group member');
      }

      const senderState = await getSenderKeyState(message.groupId, message.senderSignPK);
      if (!senderState) throw new Error('Missing sender state for group sender');

      let activeSenderKey;
      if (senderState.version === message.senderKeyVersion) {
        activeSenderKey = hydrateLocalSenderState(senderState);
      } else if (senderState.prevVersion === message.senderKeyVersion && senderState.prevChainKey) {
        activeSenderKey = hydrateLocalSenderState({ version: senderState.prevVersion, chainKey: senderState.prevChainKey });
      } else {
        throw new Error('SenderKey version mismatch. Import onboarding/sender-state sync payload from sender and retry.');
      }

      const decrypted = GroupMesh.decryptGroupMessage({
        message,
        senderKey: activeSenderKey
      }, nacl, naclUtil);

      await saveSenderKeyState(message.groupId, message.senderSignPK, encodeSenderState(decrypted.nextSenderKey));
      document.getElementById("decrypted").textContent = decrypted.payload.content;
      renderDecryptVerification({
        level: 'verified',
        details: [
          'sender verification: group-member validated',
          `group: ${group.name}`,
          `senderSignPK: ${message.senderSignPK.slice(0, 16)}...`
        ].join('\n')
      });
      setStatus(true, `✓ Group message decrypted (${group.name})`);
      return;
    }

    // Sender fingerprint
    const senderSignPK = naclUtil.decodeBase64(message.senderSignPK);
    const senderFp = DMesh.fingerprintFromSignPK(senderSignPK, nacl);
    const senderFpB64 = naclUtil.encodeBase64(senderFp);

    // Contact lookup
    let contact = await idbGet(STORE_CONTACTS, senderFpB64);

    let expectedSenderSignPK = null;
    let expectedSenderBoxPK = null;

    if (!contact) {
      if (!/** @type {HTMLInputElement} */ (document.getElementById("tofu")).checked) {
        setStatus(false, `Unknown sender (fp: ${senderFpB64.slice(0, 16)}...). Enable TOFU or add contact first.`);
        return;
      }
      // TOFU registration
      contact = {
        fp: senderFpB64,
        name: `TOFU-${senderFpB64.slice(0, 8)}`,
        signPK: message.senderSignPK,
        boxPK: message.senderBoxPK,
        addedAt: Date.now(),
        verified: VERIFICATION_STATUS.UNVERIFIED
      };
      await saveContact(contact);
      await window.refreshContacts();
    } else {
      // Known sender - expect keys to match
      expectedSenderSignPK = naclUtil.decodeBase64(contact.signPK);
      expectedSenderBoxPK = naclUtil.decodeBase64(contact.boxPK);
    }

    // Decrypt
    const result = await decryptInWorker({
      message,
      recipientBoxPK: my.boxPKu8,
      recipientBoxSK: my.boxSKu8,
      expectedSenderSignPK,
      expectedSenderBoxPK
    });

    await cleanupSeen(DMesh.REPLAY_RETENTION_MS);
    const replayAllowed = await checkAndMarkSeen(result.msgId, senderFpB64);
    document.getElementById("decrypted").textContent = result.content;
    const verificationOutcome = buildDecryptVerificationOutcome(contact, senderFpB64);
    renderDecryptVerification(verificationOutcome);
    if (!replayAllowed) {
      setStatus(false, `⚠️ Replay detected — message already received from ${contact.name} (fp: ${senderFpB64.slice(0, 16)}...)`);
    } else {
      setStatus(verificationOutcome.statusOk, verificationOutcome.message);
    }
  } catch (e) {
    setStatus(false, formatErrorMessage('Decryption failed', e));
    document.getElementById("decrypted").textContent = "";
    renderDecryptVerification(null);
  } finally {
    setActionBusy('decryptMsg', false);
  }
};

/* =========================
  QR Code Functions
========================= */
window.showQRCode = async function() {
  const myId = await buildMySignedIdentityPayload();
  const idText = JSON.stringify(myId, null, 2);
  document.getElementById("my-id").textContent = idText;

  // Clear previous QR code
  const qrContainer = document.getElementById("qr-code");
  qrContainer.replaceChildren();

  // Create canvas for QR code
  const canvas = document.createElement('canvas');
  qrContainer.appendChild(canvas);

  // Generate QR code
  await QRCode.toCanvas(canvas, idText, {
    width: 256,
    errorCorrectionLevel: 'M'
  });

  // Show modal
  document.getElementById("qr-modal").style.display = "block";
};

window.closeQRModal = function() {
  document.getElementById("qr-modal").style.display = "none";
};

let html5QrCodeScanner = null;

async function startQrScanner(mode, onDecoded) {
  const modal = document.getElementById("qr-scanner-modal");
  modal.style.display = "block";
  void mode;

  try {
    if (!html5QrCodeScanner) {
      html5QrCodeScanner = new Html5Qrcode("qr-reader");
    }

    await html5QrCodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decodedText) => {
        await onDecoded(decodedText);
      },
      (_errorMessage) => {
        // Scanning error (ignore, happens frequently)
      }
    );
  } catch (err) {
    alert("Camera access error: " + err);
    window.closeQRScanner();
  }
}

window.scanQRCode = async function() {
  await startQrScanner('contact', async (decodedText) => {
    /** @type {HTMLInputElement} */ (document.getElementById("contact-input")).value = decodedText;
    await window.closeQRScanner();
    await window.addContact();
  });
};

window.scanMessageQRCode = async function() {
  if (!transportManager) {
    setStatus(false, 'Transport manager not initialized');
    return;
  }

  await startQrScanner('message', async (decodedText) => {
    const qrTransport = transportManager.getTransport('qr');
    if (!qrTransport || typeof qrTransport.processScanned !== 'function') {
      setStatus(false, 'QR transport unavailable');
      await window.closeQRScanner();
      return;
    }

    const parsed = qrTransport.processScanned(decodedText);
    if (!parsed) {
      return;
    }

    if (parsed.kind === 'dmesh-chunk') {
      const progress = qrTransport.getChunkProgress(parsed.msgId);
      if (progress) {
        setStatus(true, `QR chunk ${progress.received}/${progress.total} received`);
      }
      return;
    }

    if (parsed.kind !== 'dmesh-msg' && parsed.kind !== 'dmesh-group-msg') {
      setStatus(false, `Scanned QR is ${parsed.kind}; expected encrypted message`);
      await window.closeQRScanner();
      return;
    }

    loadReceivedPayloadIntoDecryptInput(parsed, 'QR message');
    await window.closeQRScanner();
  });
};

window.closeQRScanner = async function() {
  if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
    try {
      await html5QrCodeScanner.stop();
    } catch (e) {
      console.error("QR scanner stop error:", e);
    }
  }
  document.getElementById("qr-scanner-modal").style.display = "none";
};

// Close modals when clicking outside
window.onclick = function(event) {
  const qrModal = document.getElementById("qr-modal");
  const scannerModal = document.getElementById("qr-scanner-modal");

  if (event.target === qrModal) {
    window.closeQRModal();
  }
  if (event.target === scannerModal) {
    window.closeQRScanner();
  }
};

/* =========================
  PWA Support
========================= */
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('install-prompt').style.display = 'block';
});

window.installPWA = async function() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;

  if (outcome === 'accepted') {
    setStatus(true, 'PWA installed successfully');
  }

  deferredPrompt = null;
  document.getElementById('install-prompt').style.display = 'none';
};

window.dismissInstall = function() {
  document.getElementById('install-prompt').style.display = 'none';
};

window.addEventListener('hashchange', () => {
  applyShortcutDeepLink(window.location.hash);
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => {
        console.log('SW registered:', registration);
      })
      .catch(err => {
        console.log('SW registration failed:', err);
      });
  });
}


window.__lifelineTest = {
  BLEManager,
  setBleManager(manager) {
    bleManager = manager;
    document.getElementById('ble-unsupported').style.display = 'none';
    document.getElementById('ble-supported').style.display = '';
  },
  setBleManagerFactory(factory) {
    bleManagerFactory = factory;
  },
  resetBle() {
    bleManager = null;
    _bleTestForceSupported = true;
    initBLE();
    _bleTestForceSupported = false;
  },
  getMeshRuntimeSnapshot() {
    return meshRuntime?.getSnapshot?.() || null;
  },
  getMaintenanceState() {
    return _maintenanceState;
  },
  async runMaintenanceNow(reason = 'manual-test') {
    await runAndRecordMaintenance(reason);
    return _maintenanceState;
  },
  simulateBleReceive(message) {
    if (!bleManager?.onMessageReceived) {
      throw new Error('BLE manager not initialized');
    }
    bleManager.onMessageReceived(message, 'encrypted');
  }
};

/* =========================
  KDF Status
========================= */
function updateKdfStatus() {
  const el = document.getElementById('kdf-status');
  if (!el) return;
  const key = isArgon2Available() ? 'keys.kdf.argon2id' : 'keys.kdf.pbkdf2';
  el.textContent = tr(key);
}

/* =========================
  Auto-init
========================= */
(async () => {
  try {
    // Initialize i18n and language toggle
    setLang(getLang());
    document.getElementById('lang-toggle')?.addEventListener('click', () => {
      setLang(getLang() === 'ja' ? 'en' : 'ja');
      updateKdfStatus();
    });

    bindUIActions();
    updateKdfStatus();
    const _migrationResult = await migrateLegacyV1IfNeeded();
    initTransportLayer();
    initBLE();  // Initialize Bluetooth

    const opPanelEl = document.getElementById('operator-panel');
    if (opPanelEl) {
      _operatorPanel = mountOperatorPanel(opPanelEl, {
        getSnapshot: () => meshRuntime?.getSnapshot() ?? {},
        getOutboxStats: () => _cachedOutboxStats,
        getMaintenanceStats: () => _maintenanceState,
        getPolicy: () => ({
          maintenance: {
            outboxTtlMs: OUTBOX_DEFAULT_TTL_MS,
            seenRetentionMs: SEEN_RETENTION_MS,
            chunkMaxAgeMs: CHUNK_MAX_AGE_MS
          },
          receivePath: {
            seenReplayRetentionMs: DMesh.REPLAY_RETENTION_MS,
            chunkCleanupMaxAgeMs: bleManager?.protocolConfig?.reassemblyTimeoutMs ?? null
          }
        })
      });
    }

    await window.initOrLoad();
    await window.refreshGroups();
    window.setMessageMode('direct');
    const savedMode = localStorage.getItem(APP_MODE_STORAGE_KEY) || 'advanced';
    window.setAppMode(savedMode);
    await refreshOutboxSnapshot();
    await refreshInboxSnapshot();
    await runAndRecordMaintenance('startup');
    updateMessageDraftMetrics();
    await handleStartupIntakeFromUrl();
    setInterval(() => {
      refreshOutboxSnapshot();
      refreshInboxSnapshot();
    }, 5000);
    if (_maintenanceTimer) {
      clearInterval(_maintenanceTimer);
    }
    _maintenanceTimer = setInterval(() => {
      runAndRecordMaintenance('interval');
    }, MAINTENANCE_INTERVAL_MS);
  } catch (e) {
    console.error("Auto-init failed:", e);
  }
})();
