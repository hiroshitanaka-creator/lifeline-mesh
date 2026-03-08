/* =========================
  Imports
========================= */
import * as DMesh from '../../crypto/core.js';
import { BLEManager } from '../../bluetooth/ble-manager.js';
import { encryptKeys, decryptKeys, checkPasswordStrength } from '../../crypto/key-backup.js';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import {
  STORE_KEYS,
  STORE_CONTACTS,
  idbGet,
  idbPut,
  idbDel,
  idbGetAll,
  resetDatabase,
  checkAndMarkSeen,
  cleanupSeen
} from './db.js';
import { encryptInWorker, decryptInWorker } from './worker-client.js';


/* =========================
  BLE Manager
========================= */
let bleManager = null;
let lastEncryptedMessage = null;

function initBLE() {
  if (!BLEManager.isSupported()) {
    document.getElementById('ble-unsupported').style.display = 'block';
    document.getElementById('ble-supported').style.display = 'none';
    return;
  }

  bleManager = new BLEManager();

  bleManager.onConnectionChange = (connected, device) => {
    const statusEl = document.getElementById('ble-status');
    const deviceEl = document.getElementById('ble-device-name');

    if (connected) {
      statusEl.textContent = '🟢 Connected';
      statusEl.className = 'ok';
      deviceEl.textContent = device.name || device.id || 'Unknown device';
    } else {
      statusEl.textContent = '🔴 Not connected';
      statusEl.className = 'ng';
      deviceEl.textContent = '(none)';
    }
  };

  bleManager.onMessageReceived = (message, type) => {
    const messagesEl = document.getElementById('ble-messages');
    const timestamp = new Date().toLocaleTimeString();
    const current = messagesEl.textContent === '(none)' ? '' : messagesEl.textContent + '\n---\n';
    messagesEl.textContent = current + `[${timestamp}] Received:\n${JSON.stringify(message, null, 2)}`;

    // Auto-fill decrypt input
    document.getElementById('input').value = JSON.stringify(message, null, 2);
    setStatus(true, 'Received message via Bluetooth - ready to decrypt');
  };

  bleManager.onError = (code, error) => {
    setStatus(false, `Bluetooth error: ${code}`);
    console.error('BLE Error:', code, error);
  };
}

window.bleScan = async function() {
  if (!bleManager) {
    setStatus(false, 'Bluetooth not supported');
    return;
  }

  try {
    setStatus(true, 'Scanning for devices...');
    await bleManager.scan();
    setStatus(true, 'Connecting...');
    await bleManager.connect();
    setStatus(true, 'Connected via Bluetooth!');
  } catch (e) {
    setStatus(false, 'Bluetooth: ' + e.message);
  }
};

window.bleDisconnect = function() {
  if (bleManager) {
    bleManager.disconnect();
    setStatus(true, 'Disconnected');
  }
};

window.bleSendEncrypted = async function() {
  if (!bleManager || !bleManager.isConnected) {
    setStatus(false, 'Not connected via Bluetooth');
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
    setStatus(true, 'Message sent via Bluetooth!');
  } catch (e) {
    setStatus(false, 'Bluetooth send failed: ' + e.message);
  }
};

// Attach util to nacl for compatibility with existing code
nacl.util = naclUtil;

/* =========================
  Utility
========================= */
function setStatus(ok, msg) {
  document.getElementById("status").innerHTML = (ok ? `<span class="ok">✓ OK</span> ` : `<span class="ng">✗ ERROR</span> `) + msg;
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
  try {
    const my = await ensureMyKeys();
    const myId = DMesh.createPublicIdentity({
      name: "(optional)",
      signPK: my.signPKu8,
      boxPK: my.boxPKu8
    });

    document.getElementById("my-id").textContent = JSON.stringify(myId, null, 2);
    await refreshContacts();
    setStatus(true, `Keys ready. Fingerprint: ${myId.fp}`);
  } catch (e) {
    setStatus(false, e.message);
  }
};

window.copyMyId = async function() {
  const t = document.getElementById("my-id").textContent;
  if (!t || t === "(not loaded)") return alert("Generate keys first");
  await navigator.clipboard.writeText(t);
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

  document.getElementById("my-id").textContent = "(not loaded)";
  document.getElementById("contacts-view").textContent = "(none)";
  document.getElementById("recipient-select").innerHTML = `<option value="">Select Recipient</option>`;
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
  Encryption
========================= */
window.encryptMsg = async function() {
  try {
    const content = document.getElementById("content").value || "";
    const fp = document.getElementById("recipient-select").value;

    if (!fp) return alert("Select a recipient");

    const recipient = await idbGet(STORE_CONTACTS, fp);
    if (!recipient) return alert("Recipient not found");

    const my = await ensureMyKeys();

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
    setStatus(false, "Encryption failed: " + e.message);
  }
};

window.copyEncrypted = async function() {
  const text = document.getElementById("encrypted").textContent;
  await navigator.clipboard.writeText(text);
  setStatus(true, "Encrypted message copied to clipboard");
};

/* =========================
  Decryption
========================= */

window.decryptMsg = async function() {
  try {
    const message = JSON.parse(document.getElementById("input").value.trim());
    const my = await ensureMyKeys();

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

    await cleanupSeen(DMesh.REPLAY_RETENTION_MS);
    const replayAllowed = await checkAndMarkSeen(message.msgId, senderFpB64);
    if (!replayAllowed) {
      throw new Error('Replay detected');
    }

    // Decrypt
    const result = await decryptInWorker({
      message,
      recipientBoxPK: my.boxPKu8,
      recipientBoxSK: my.boxSKu8,
      expectedSenderSignPK,
      expectedSenderBoxPK
    });

    document.getElementById("decrypted").textContent = result.content;
    setStatus(true, `✓ Decrypted from ${contact.name} (fp: ${senderFpB64.slice(0, 16)}...)`);
  } catch (e) {
    setStatus(false, "Decryption failed: " + e.message);
    document.getElementById("decrypted").textContent = "";
  }
};

/* =========================
  QR Code Functions
========================= */
window.showQRCode = async function() {
  const idText = document.getElementById("my-id").textContent;
  if (!idText || idText === "(not loaded)") {
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
  setBleManager(manager) {
    bleManager = manager;
  },
  simulateBleReceive(message) {
    if (!bleManager?.onMessageReceived) {
      throw new Error('BLE manager not initialized');
    }
    bleManager.onMessageReceived(message, 'encrypted');
  }
};

/* =========================
  Auto-init
========================= */
(async () => {
  try {
    initBLE();  // Initialize Bluetooth
    await initOrLoad();
  } catch (e) {
    console.error("Auto-init failed:", e);
  }
})();
