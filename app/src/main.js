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
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  getRecentOutbox,
  getRecentInbox,
  resetDatabase,
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
  getSenderKeyState,
  removeSenderKeyState,
  migrateLegacyV1IfNeeded
} from './db.js';
import { encryptInWorker, decryptInWorker } from './worker-client.js';
import { appendBleMessage, formatErrorMessage, formatLocalTime, setStatus } from './ui-utils.js';
import { createTransportManager } from '../../crypto/transport.js';
import { t as tr, setLang, getLang, applyTranslations } from './i18n.js';


/* =========================
  BLE Manager
========================= */
let bleManager = null;
let _bleTestForceSupported = false;
let lastEncryptedMessage = null;
let bleManagerFactory = () => new BLEManager();
let transportManager = null;

const DELIVERY_UI_STATUS = {
  UNSENT: 'unsent',
  RETRYING: 'retrying',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

const BLE_CONFIG_STORAGE_KEY = "lifeline:bleProtocolConfig";
const MAX_MESSAGE_BYTES = 150 * 1024;
const MAX_BLE_CHUNKS = 255;
const DEFAULT_BLE_CHUNK_SIZE = 140;

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
  } catch (error) {
    outboxEl.textContent = `outbox read failed: ${error.message}`;
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
    inboxEl.textContent = `inbox read failed: ${error.message}`;
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

function initBLE() {
  if (!_bleTestForceSupported && !BLEManager.isSupported()) {
    document.getElementById('ble-unsupported').style.display = 'block';
    document.getElementById('ble-supported').style.display = 'none';
    return;
  }
  document.getElementById('ble-unsupported').style.display = 'none';
  document.getElementById('ble-supported').style.display = '';

  bleManager = bleManagerFactory();

  const savedBleConfig = loadSavedBleProtocolConfig();
  if (savedBleConfig) {
    bleManager.updateProtocolConfig(savedBleConfig);
  }
  renderBleProtocolConfig(bleManager.getProtocolConfig());

  bleManager.onConnectionChange = (connected, device) => {
    const statusEl = document.getElementById('ble-status');
    const deviceEl = document.getElementById('ble-device-name');

    if (connected) {
      renderBleTransportState('connected');
      deviceEl.textContent = device.name || device.id || 'Unknown device';
    } else {
      renderBleTransportState('disconnected');
      deviceEl.textContent = '(none)';
    }
  };

  bleManager.onMessageReceived = (message) => {
    const messagesEl = document.getElementById('ble-messages');
    appendBleMessage(messagesEl, message);

    // Auto-fill decrypt input
    document.getElementById('input').value = JSON.stringify(message, null, 2);
    setStatus(true, 'Received message via Bluetooth - ready to decrypt');
  };

  bleManager.onTransferState = ({ state, ...details }) => {
    renderBleTransportState(state, details);
  };

  bleManager.onError = (code, error) => {
    setStatus(false, formatErrorMessage(`Bluetooth error (${code})`, error));
    console.error('BLE Error:', code, error);
  };
}

function initTransportLayer() {
  transportManager = createTransportManager({
    nacl,
    naclUtil: nacl.util
  });

  transportManager.onError = (error, transportName) => {
    setStatus(false, `Transport error (${transportName}): ${error.message}`);
  };
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

function getBleProtocolConfigFromInputs() {
  const readNumber = (id, fallback) => {
    const value = Number(document.getElementById(id)?.value);
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

  document.getElementById('ble-ack-timeout').value = String(safe.ackTimeoutMs);
  document.getElementById('ble-retry-count').value = String(safe.retryCount);
  document.getElementById('ble-retry-delay').value = String(safe.retryDelayMs);
  document.getElementById('ble-chunk-delay').value = String(safe.chunkDelayMs);
  document.getElementById('ble-reassembly-timeout').value = String(safe.reassemblyTimeoutMs);
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
    setStatus(false, `BLE config update failed: ${error.message}`);
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
    setStatus(false, `BLE config reset failed: ${error.message}`);
  }
};

window.bleScan = async function() {
  if (!bleManager) {
    setStatus(false, 'Bluetooth not supported');
    return;
  }

  try {
    renderBleTransportState('queued');
    setStatus(true, 'Scanning for devices...');
    await bleManager.scan();
    renderBleTransportState('sending');
    setStatus(true, 'Connecting...');
    await bleManager.connect();
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

// Attach util to nacl for compatibility with existing code
nacl.util = naclUtil;

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
    createGroup: () => window.createGroup(),
    joinGroup: () => window.joinGroup(),
    addSelectedMemberToGroup: () => window.addSelectedMemberToGroup(),
    removeSelectedMemberFromGroup: () => window.removeSelectedMemberFromGroup(),
    encryptMsg: () => window.encryptMsg(),
    copyEncrypted: () => window.copyEncrypted(),
    exportEncryptedFile: () => window.exportEncryptedFile(),
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
    applyDisasterTemplate: () => window.applyDisasterTemplate()
  };

  document.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', (event) => {
      const action = event.currentTarget.dataset.action;
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
      window.setMessageMode(element.value);
    });
  });

  document.getElementById('content')?.addEventListener('input', () => {
    updateMessageDraftMetrics();
  });
}



function setActionBusy(actionName, busy, loadingText) {
  const button = document.querySelector(`[data-action="${actionName}"]`);
  if (!button) {
    return;
  }

  if (busy) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.classList.add('loading-btn');
    button.setAttribute('aria-busy', 'true');
    if (loadingText) {
      button.textContent = loadingText;
    }
    return;
  }

  button.disabled = false;
  button.classList.remove('loading-btn');
  button.removeAttribute('aria-busy');
  if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
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

  const text = contentEl.value || '';
  const byteLength = new TextEncoder().encode(text).length;
  const usagePercent = Math.min(100, Math.round((byteLength / MAX_MESSAGE_BYTES) * 100));
  const estimatedChunks = estimateBleChunkCount(byteLength);
  const overLimit = byteLength > MAX_MESSAGE_BYTES || estimatedChunks > MAX_BLE_CHUNKS;

  metricsEl.textContent = `${byteLength} / ${MAX_MESSAGE_BYTES} bytes • ${usagePercent}%`;
  progressEl.max = MAX_MESSAGE_BYTES;
  progressEl.value = Math.min(byteLength, MAX_MESSAGE_BYTES);
  chunkEl.textContent = `Estimated BLE chunks: ${estimatedChunks} / ${MAX_BLE_CHUNKS}`;
  chunkEl.className = overLimit ? 'small ng' : 'small';

  if (overLimit) {
    chunkEl.textContent += ' ⚠️ message may exceed BLE limits';
  }
}

function getDisasterTemplateContent(templateKey) {
  const keyMap = {
    safety: 'template.safety.content',
    supplies: 'template.supplies.content',
    evacuation: 'template.evacuation.content',
    medical: 'template.medical.content'
  };
  const i18nKey = keyMap[templateKey];
  return i18nKey ? tr(i18nKey) : '';
}

window.applyDisasterTemplate = function() {
  const selector = document.getElementById('disaster-template');
  const contentEl = document.getElementById('content');
  const key = selector?.value || '';
  if (!key) {
    setStatus(false, tr('status.templateSelect'));
    return;
  }

  const template = getDisasterTemplateContent(key);
  if (!template) {
    setStatus(false, tr('status.templateLoadFail'));
    return;
  }

  const current = contentEl.value?.trim();
  if (current) {
    const shouldOverwrite = confirm(tr('status.templateOverwrite'));
    if (!shouldOverwrite) {
      return;
    }
  }

  contentEl.value = template;
  updateMessageDraftMetrics();
  contentEl.focus();
  setStatus(true, tr('status.templateApplied'));
};

function getLocalSignPKB64(my) {
  return nacl.util.encodeBase64(my.signPKu8);
}

function hydrateLocalSenderState(state) {
  return GroupMesh.hydrateSenderKey(state, nacl.util);
}

function encodeSenderState(senderKey) {
  return {
    version: senderKey.version,
    chainKey: nacl.util.encodeBase64(senderKey.chainKey)
  };
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
    signPK = nacl.util.encodeBase64(kp.publicKey);
    signSK = nacl.util.encodeBase64(kp.secretKey);
    await idbPut(STORE_KEYS, signPK, "my_sign_pk");
    await idbPut(STORE_KEYS, signSK, "my_sign_sk");
  }

  if (!boxPK || !boxSK) {
    const kp = DMesh.generateBoxKeyPair(nacl);
    boxPK = nacl.util.encodeBase64(kp.publicKey);
    boxSK = nacl.util.encodeBase64(kp.secretKey);
    await idbPut(STORE_KEYS, boxPK, "my_box_pk");
    await idbPut(STORE_KEYS, boxSK, "my_box_sk");
  }

  return {
    signPKu8: nacl.util.decodeBase64(signPK),
    signSKu8: nacl.util.decodeBase64(signSK),
    boxPKu8: nacl.util.decodeBase64(boxPK),
    boxSKu8: nacl.util.decodeBase64(boxSK)
  };
}

window.initOrLoad = async function() {
  setActionBusy('initOrLoad', true, '🔑 Preparing...');
  try {
    const my = await ensureMyKeys();
    const myId = DMesh.createPublicIdentity({
      name: "(optional)",
      signPK: my.signPKu8,
      boxPK: my.boxPKu8
    }, nacl, naclUtil);

    document.getElementById("my-id").textContent = JSON.stringify(myId, null, 2);
    await refreshContacts();
    await refreshGroups();
    await refreshOutboxSnapshot();
    setStatus(true, `Keys ready. Fingerprint: ${myId.fp}`);
  } catch (e) {
    setStatus(false, e.message);
  } finally {
    setActionBusy('initOrLoad', false);
  }
};

window.copyMyId = async function() {
  const idText = document.getElementById("my-id").textContent;
  if (!idText || !idText.trim().startsWith('{')) return alert("Generate keys first");
  await navigator.clipboard.writeText(idText);
  setStatus(true, "Public ID copied to clipboard");
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
      nacl.util
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
    setStatus(false, "Export failed: " + e.message);
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
      const file = e.target.files[0];
      const text = await file.text();
      const backup = JSON.parse(text);

      let keys;

      if (backup.version === 2) {
        // Secure format (PBKDF2/Argon2id + NaCl secretbox)
        setStatus(true, "Decrypting keys (this may take a moment)...");
        keys = await decryptKeys(backup, password, nacl, nacl.util);
      } else if (backup.version === 1 && backup.keys) {
        // Legacy XOR format - decrypt and warn
        const passwordHash = nacl.hash(nacl.util.decodeUTF8(password));
        const xorDecrypt = (encrypted) => {
          const encryptedBytes = nacl.util.decodeBase64(encrypted);
          const decrypted = new Uint8Array(encryptedBytes.length);
          for (let i = 0; i < encryptedBytes.length; i++) {
            decrypted[i] = encryptedBytes[i] ^ passwordHash[i % passwordHash.length];
          }
          return nacl.util.encodeBase64(decrypted);
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
      if (nacl.util.decodeBase64(keys.signPK).length !== 32 ||
          nacl.util.decodeBase64(keys.signSK).length !== 64 ||
          nacl.util.decodeBase64(keys.boxPK).length !== 32 ||
          nacl.util.decodeBase64(keys.boxSK).length !== 32) {
        return alert("Decryption failed - wrong password or corrupted file");
      }

      // Save to IndexedDB
      await idbPut(STORE_KEYS, keys.signPK, "my_sign_pk");
      await idbPut(STORE_KEYS, keys.signSK, "my_sign_sk");
      await idbPut(STORE_KEYS, keys.boxPK, "my_box_pk");
      await idbPut(STORE_KEYS, keys.boxSK, "my_box_sk");

      await initOrLoad();

      if (backup.version === 1) {
        setStatus(true, "Keys imported from LEGACY backup. Re-export recommended for better security.");
      } else {
        setStatus(true, "Keys imported successfully (secure format)");
      }
    } catch (e) {
      setStatus(false, "Import failed: " + e.message);
    }
  };

  input.click();
};

window.resetAll = async function() {
  if (!confirm("⚠️ Delete ALL data (keys, contacts, replay DB)?\nThis cannot be undone!")) return;

  await resetDatabase();

  document.getElementById("my-id").textContent = tr('keys.notLoaded');
  document.getElementById("contacts-view").textContent = tr('contacts.none');
  document.getElementById("recipient-select").innerHTML = `<option value="">${tr('contacts.recipient.placeholder')}</option>`;
  document.getElementById("group-select").innerHTML = `<option value="">${tr('encrypt.group.select')}</option>`;
  document.getElementById("encrypted").textContent = "";
  document.getElementById("decrypted").textContent = "";
  setStatus(true, "All data deleted");
};


/* =========================
   Keyboard Shortcuts
========================= */
document.addEventListener("keydown", (event) => {

  // Don't trigger shortcuts while typing
  const tag = event.target.tagName;
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

  // Escape → Close any open modal
  if (event.key === "Escape") {
    const qrModal = document.getElementById("qr-modal");
    const scannerModal = document.getElementById("qr-scanner-modal");

    if (qrModal.style.display === "block") {
      window.closeQRModal();
    }

    if (scannerModal.style.display === "block") {
      window.closeQRScanner();
    }
  }
});



/* =========================
  Contacts
========================= */
window.addContact = async function() {
  try {
    const obj = JSON.parse(document.getElementById("contact-input").value.trim());

    if (!obj || !obj.signPK || !obj.boxPK) {
      return alert("Invalid format. Need: signPK and boxPK");
    }

    const signPKu8 = nacl.util.decodeBase64(obj.signPK);
    const boxPKu8 = nacl.util.decodeBase64(obj.boxPK);

    if (signPKu8.length !== 32) return alert("Invalid signPK length");
    if (boxPKu8.length !== 32) return alert("Invalid boxPK length");

    const fp = DMesh.fingerprintFromSignPK(signPKu8, nacl);
    const fpB64 = nacl.util.encodeBase64(fp);

    const contact = {
      fp: fpB64,
      name: obj.name || `Contact-${fpB64.slice(0, 8)}`,
      signPK: obj.signPK,
      boxPK: obj.boxPK,
      addedAt: Date.now()
    };

    await idbPut(STORE_CONTACTS, contact);
    await refreshContacts();
    setStatus(true, `Contact saved: ${contact.name} (fp: ${fpB64.slice(0, 16)}...)`);
  } catch (e) {
    setStatus(false, "Add contact failed: " + e.message);
  }
};

window.refreshContacts = async function() {
  const contacts = await idbGetAll(STORE_CONTACTS);
  contacts.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const sel = document.getElementById("recipient-select");
  sel.innerHTML = `<option value="">Select Recipient</option>`;

  for (const c of contacts) {
    const opt = document.createElement("option");
    opt.value = c.fp;
    opt.textContent = `${c.name} [${c.fp.slice(0, 12)}...]`;
    sel.appendChild(opt);
  }

  sel.onchange = () => {
    const selected = sel.options[sel.selectedIndex].text;
    document.getElementById("encrypt-recipient").textContent = selected || "(select above)";
  };

  const groupMemberSel = document.getElementById("group-member-select");
  if (groupMemberSel) {
    groupMemberSel.innerHTML = `<option value="">Select Contact</option>`;
    for (const c of contacts) {
      const opt = document.createElement("option");
      opt.value = c.fp;
      opt.textContent = `${c.name} [${c.fp.slice(0, 12)}...]`;
      groupMemberSel.appendChild(opt);
    }
  }

  document.getElementById("contacts-view").textContent =
    contacts.length ? JSON.stringify(contacts, null, 2) : "(none)";
};

window.deleteSelectedContact = async function() {
  const fp = document.getElementById("recipient-select").value;
  if (!fp) return alert("Select a contact first");

  await idbDel(STORE_CONTACTS, fp);
  await refreshContacts();
  setStatus(true, `Contact deleted (fp: ${fp.slice(0, 16)}...)`);
};


/* =========================
  Group Messaging
========================= */
window.setMessageMode = function(mode) {
  const isGroup = mode === 'group';
  document.querySelectorAll('input[name="message-mode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
  document.getElementById('direct-controls').style.display = isGroup ? 'none' : 'block';
  document.getElementById('group-controls').style.display = isGroup ? 'block' : 'none';
};

window.refreshGroups = async function() {
  const groups = await getAllGroups();
  groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const sel = document.getElementById('group-select');
  sel.innerHTML = `<option value="">Select Group</option>`;

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
  const groupId = document.getElementById('group-select').value;
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
    chainKey: nacl.util.encodeBase64(nacl.randomBytes(32))
  };
  group.updatedAt = Date.now();
  await saveGroup(group);

  const my = await ensureMyKeys();
  await saveSenderKeyState(group.id, getLocalSignPKB64(my), group.senderKey);
}

window.createGroup = async function() {
  try {
    const name = (document.getElementById('group-name').value || '').trim();
    if (!name) return alert('Group name is required');

    const my = await ensureMyKeys();
    const myFp = nacl.util.encodeBase64(DMesh.fingerprintFromSignPK(my.signPKu8, nacl));
    const group = GroupMesh.createGroup({
      name,
      createdBy: myFp,
      members: [myFp]
    }, nacl, nacl.util);

    await saveGroup(group);
    await saveGroupMembers(group.id, group.members);
    await saveSenderKeyState(group.id, getLocalSignPKB64(my), group.senderKey);

    await refreshGroups();
    document.getElementById('group-select').value = group.id;
    await renderSelectedGroup();
    setStatus(true, `Group created: ${group.name}`);
  } catch (e) {
    setStatus(false, 'Create group failed: ' + e.message);
  }
};

window.joinGroup = async function() {
  try {
    const raw = document.getElementById('group-json').value.trim();
    const parsed = JSON.parse(raw);
    if (!parsed.id || !parsed.senderKey) {
      throw new Error('Invalid group JSON');
    }

    const my = await ensureMyKeys();
    const myFp = nacl.util.encodeBase64(DMesh.fingerprintFromSignPK(my.signPKu8, nacl));
    const members = Array.from(new Set([...(parsed.members || []), myFp]));
    parsed.members = members;

    await saveGroup(parsed);
    await saveGroupMembers(parsed.id, members);
    await saveSenderKeyState(parsed.id, getLocalSignPKB64(my), parsed.senderKey);

    await refreshGroups();
    document.getElementById('group-select').value = parsed.id;
    await renderSelectedGroup();
    setStatus(true, `Joined group: ${parsed.name || parsed.id}`);
  } catch (e) {
    setStatus(false, 'Join group failed: ' + e.message);
  }
};

window.addSelectedMemberToGroup = async function() {
  try {
    const groupId = document.getElementById('group-select').value;
    const memberFp = document.getElementById('group-member-select').value;
    if (!groupId || !memberFp) return alert('Select group and member');

    const group = await getGroup(groupId);
    if (!group) return alert('Group not found');

    const members = new Set(await getGroupMembers(groupId));
    members.add(memberFp);
    await addGroupMember(groupId, memberFp);
    group.members = Array.from(members);

    await forceRotateSenderKey(group);
    await saveGroupMembers(groupId, group.members);
    await renderSelectedGroup();
    setStatus(true, 'Member added. SenderKey rotated.');
  } catch (e) {
    setStatus(false, 'Add member failed: ' + e.message);
  }
};

window.removeSelectedMemberFromGroup = async function() {
  try {
    const groupId = document.getElementById('group-select').value;
    const memberFp = document.getElementById('group-member-select').value;
    if (!groupId || !memberFp) return alert('Select group and member');

    const group = await getGroup(groupId);
    if (!group) return alert('Group not found');

    await removeGroupMember(groupId, memberFp);
    await removeSenderKeyState(groupId, memberFp);
    const members = (await getGroupMembers(groupId)).filter((fp) => fp !== memberFp);
    group.members = members;

    await forceRotateSenderKey(group);
    await saveGroupMembers(groupId, members);
    await renderSelectedGroup();
    setStatus(true, 'Member removed. SenderKey rotated.');
  } catch (e) {
    setStatus(false, 'Remove member failed: ' + e.message);
  }
};

/* =========================
  Encryption
========================= */
window.encryptMsg = async function() {
  setActionBusy('encryptMsg', true, '🔒 Encrypting...');
  setStatus(true, '🔒 Encrypting...');
  try {
    const content = document.getElementById("content").value || "";
    const mode = document.querySelector('input[name="message-mode"]:checked')?.value || 'direct';
    const my = await ensureMyKeys();

    if (mode === 'group') {
      const groupId = document.getElementById('group-select').value;
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
      }, nacl, nacl.util);

      await saveSenderKeyState(groupId, localSignPK, {
        ...encodeSenderState(encrypted.nextSenderKey),
        prevVersion: senderKey.version,
        prevChainKey: nacl.util.encodeBase64(senderKey.chainKey)
      });
      document.getElementById("encrypted").textContent = JSON.stringify(encrypted.message, null, 2);
      document.getElementById("encrypted-actions").style.display = "flex";
      setStatus(true, `Group encrypted for ${group.name}`);
      return;
    }

    const fp = document.getElementById("recipient-select").value;
    if (!fp) return alert("Select a recipient");

    const recipient = await idbGet(STORE_CONTACTS, fp);
    if (!recipient) return alert("Recipient not found");

    const message = await encryptInWorker({
      content,
      senderSignPK: my.signPKu8,
      senderSignSK: my.signSKu8,
      senderBoxPK: my.boxPKu8,
      senderBoxSK: my.boxSKu8,
      recipientBoxPK: nacl.util.decodeBase64(recipient.boxPK)
    });

    document.getElementById("encrypted").textContent = JSON.stringify(message, null, 2);
    document.getElementById("encrypted-actions").style.display = "flex";
    setStatus(true, `Encrypted for ${recipient.name}`);
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
    const message = JSON.parse(document.getElementById("input").value.trim());
    const my = await ensureMyKeys();

    if (message.kind === 'dmesh-group-msg') {
      const group = await getGroup(message.groupId);
      if (!group) throw new Error('Unknown group');

      const members = await getGroupMembers(message.groupId);
      const senderSignPKu8 = nacl.util.decodeBase64(message.senderSignPK);
      const senderFpB64 = nacl.util.encodeBase64(DMesh.fingerprintFromSignPK(senderSignPKu8, nacl));
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
        throw new Error('SenderKey version mismatch. Re-sync group state required.');
      }

      const decrypted = GroupMesh.decryptGroupMessage({
        message,
        senderKey: activeSenderKey
      }, nacl, nacl.util);

      await saveSenderKeyState(message.groupId, message.senderSignPK, encodeSenderState(decrypted.nextSenderKey));
      document.getElementById("decrypted").textContent = decrypted.payload.content;
      setStatus(true, `✓ Group message decrypted (${group.name})`);
      return;
    }

    // Sender fingerprint
    const senderSignPK = nacl.util.decodeBase64(message.senderSignPK);
    const senderFp = DMesh.fingerprintFromSignPK(senderSignPK, nacl);
    const senderFpB64 = nacl.util.encodeBase64(senderFp);

    // Contact lookup
    let contact = await idbGet(STORE_CONTACTS, senderFpB64);

    let expectedSenderSignPK = null;
    let expectedSenderBoxPK = null;

    if (!contact) {
      if (!document.getElementById("tofu").checked) {
        setStatus(false, `Unknown sender (fp: ${senderFpB64.slice(0, 16)}...). Enable TOFU or add contact first.`);
        return;
      }
      // TOFU registration
      contact = {
        fp: senderFpB64,
        name: `TOFU-${senderFpB64.slice(0, 8)}`,
        signPK: message.senderSignPK,
        boxPK: message.senderBoxPK,
        addedAt: Date.now()
      };
      await idbPut(STORE_CONTACTS, contact);
      await refreshContacts();
    } else {
      // Known sender - expect keys to match
      expectedSenderSignPK = nacl.util.decodeBase64(contact.signPK);
      expectedSenderBoxPK = nacl.util.decodeBase64(contact.boxPK);
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
    if (!replayAllowed) {
      setStatus(false, `⚠️ Replay detected — message already received from ${contact.name} (fp: ${senderFpB64.slice(0, 16)}...)`);
    } else {
      setStatus(true, `✓ Decrypted from ${contact.name} (fp: ${senderFpB64.slice(0, 16)}...)`);
    }
  } catch (e) {
    setStatus(false, formatErrorMessage('Decryption failed', e));
    document.getElementById("decrypted").textContent = "";
  } finally {
    setActionBusy('decryptMsg', false);
  }
};

/* =========================
  QR Code Functions
========================= */
window.showQRCode = async function() {
  const idText = document.getElementById("my-id").textContent;
  if (!idText || !idText.trim().startsWith('{')) {
    return alert("Generate keys first");
  }

  // Clear previous QR code
  const qrContainer = document.getElementById("qr-code");
  qrContainer.innerHTML = "";

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

window.scanQRCode = async function() {
  const modal = document.getElementById("qr-scanner-modal");
  modal.style.display = "block";

  try {
    if (!html5QrCodeScanner) {
      html5QrCodeScanner = new Html5Qrcode("qr-reader");
    }

    await html5QrCodeScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        // Successfully scanned
        document.getElementById("contact-input").value = decodedText;
        closeQRScanner();
        addContact();
      },
      (errorMessage) => {
        // Scanning error (ignore, happens frequently)
      }
    );
  } catch (err) {
    alert("Camera access error: " + err);
    closeQRScanner();
  }
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
    closeQRModal();
  }
  if (event.target === scannerModal) {
    closeQRScanner();
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
  el.innerHTML = tr(key);
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
    const migrationResult = await migrateLegacyV1IfNeeded();
    initBLE();  // Initialize Bluetooth
    initTransportLayer();
    await initOrLoad();
    await refreshGroups();
    setMessageMode('direct');
    await refreshOutboxSnapshot();
    await refreshInboxSnapshot();
    updateMessageDraftMetrics();
    setInterval(() => {
      refreshOutboxSnapshot();
      refreshInboxSnapshot();
    }, 5000);
  } catch (e) {
    console.error("Auto-init failed:", e);
  }
})();
