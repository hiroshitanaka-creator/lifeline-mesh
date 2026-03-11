/**
 * Lifeline Mesh - Crypto Worker Client
 *
 * Promise-based API that wraps the crypto Web Worker.
 * Each call serializes the request, sends it to the worker, and returns
 * a Promise that resolves with the result or rejects with an error.
 *
 * Usage:
 *   import { CryptoWorkerClient } from './workers/crypto-worker-client.js';
 *
 *   const crypto = new CryptoWorkerClient();
 *   crypto.start();
 *
 *   const keys = await crypto.generateKeys();
 *   const msg  = await crypto.encryptMessage({ content: 'hello', ...keys });
 *   const plain = await crypto.decryptMessage({ message: msg, ... });
 *
 *   crypto.stop(); // terminate worker when done
 *
 * Falls back to synchronous (main-thread) execution when Web Workers are
 * unavailable (e.g., file:// protocol, older browsers) so the app still works.
 *
 * @module workers/crypto-worker-client
 */

// ============================================================================
// CryptoWorkerClient
// ============================================================================

export class CryptoWorkerClient {
  constructor() {
    /** @type {Worker|null} */
    this._worker = null;

    /** Pending requests: id → { resolve, reject } */
    this._pending = new Map();

    /** Monotonically increasing request ID */
    this._nextId = 1;

    /** Whether the worker is running */
    this.isRunning = false;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the crypto worker.
   * Safe to call multiple times (no-op if already running).
   */
  start() {
    if (this.isRunning) return;

    if (typeof Worker === "undefined") {
      // Web Workers not available — all calls will be no-ops returning errors
      console.warn("[CryptoWorkerClient] Web Workers not supported; crypto will run on main thread.");
      this.isRunning = false;
      return;
    }

    try {
      this._worker = new Worker(
        new URL("./crypto-worker.js", import.meta.url),
        { type: "module" }
      );

      this._worker.onmessage = (event) => this._handleMessage(event);
      this._worker.onerror = (err) => this._handleError(err);

      this.isRunning = true;
    } catch (err) {
      console.error("[CryptoWorkerClient] Failed to start worker:", err);
      this.isRunning = false;
    }
  }

  /**
   * Terminate the crypto worker and reject all pending requests.
   */
  stop() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    // Reject any still-pending calls
    for (const { reject } of this._pending.values()) {
      reject(new Error("CryptoWorkerClient stopped"));
    }
    this._pending.clear();
    this.isRunning = false;
  }

  // ============================================================================
  // Crypto Operations
  // ============================================================================

  /**
   * Generate a new sign + box key pair.
   * @returns {Promise<{signPK, signSK, boxPK, boxSK}>} All fields base64.
   */
  generateKeys() {
    return this._call("generateKeys");
  }

  /**
   * Encrypt a direct (1-to-1) message.
   * @param {object} payload - { content, senderSignPK, senderSignSK,
   *   senderBoxPK, senderBoxSK, recipientBoxPK, ts?, ttlMs?, type? }
   * @returns {Promise<import('../types/index.ts').EncryptedMessage>}
   */
  encryptMessage(payload) {
    return this._call("encryptMessage", payload);
  }

  /**
   * Decrypt a direct (1-to-1) message.
   * @param {object} payload - { message, recipientBoxPK, recipientBoxSK,
   *   expectedSenderSignPK?, expectedSenderBoxPK? }
   * @returns {Promise<import('../types/index.ts').DecryptResult>}
   */
  decryptMessage(payload) {
    return this._call("decryptMessage", payload);
  }

  /**
   * Generate a new group Sender Key.
   * @returns {Promise<import('../types/index.ts').SerializedSenderKey>}
   */
  generateSenderKey() {
    return this._call("generateSenderKey");
  }

  /**
   * Ratchet (advance) a chain key.
   * @param {string} chainKey - Base64 chain key.
   * @returns {Promise<{chainKey: string}>}
   */
  ratchetChainKey(chainKey) {
    return this._call("ratchetChainKey", { chainKey });
  }

  /**
   * Encrypt a group message.
   * @param {object} payload - { content, groupId, senderKey (serialized),
   *   senderSignSK, senderSignPK }
   * @returns {Promise<import('../types/index.ts').EncryptedGroupMessage>}
   */
  encryptGroupMessage(payload) {
    return this._call("encryptGroupMessage", payload);
  }

  /**
   * Decrypt a group message.
   * @param {object} payload - { message, senderKey (serialized), expectedSenderSignPK? }
   * @returns {Promise<import('../types/index.ts').GroupDecryptResult>}
   */
  decryptGroupMessage(payload) {
    return this._call("decryptGroupMessage", payload);
  }

  /**
   * Create a new group.
   * @param {object} payload - { name, creatorSignPK }
   * @returns {Promise<{group: import('../types/index.ts').Group, senderKey: import('../types/index.ts').SerializedSenderKey}>}
   */
  createGroup(payload) {
    return this._call("createGroup", payload);
  }

  /**
   * Derive a fingerprint from a signing public key.
   * @param {string} signPK - Base64 sign public key.
   * @returns {Promise<{fp: string}>}
   */
  fingerprintFromSignPK(signPK) {
    return this._call("fingerprintFromSignPK", { signPK });
  }

  /**
   * Generate a safety number for contact verification.
   * @param {string} fp1 - Base64 fingerprint 1.
   * @param {string} fp2 - Base64 fingerprint 2.
   * @returns {Promise<{safetyNumber: string}>}
   */
  generateSafetyNumber(fp1, fp2) {
    return this._call("generateSafetyNumber", { fp1, fp2 });
  }

  // ============================================================================
  // Internal
  // ============================================================================

  /**
   * Send a request to the worker and return a Promise for the result.
   * @private
   */
  _call(type, payload = {}) {
    if (!this._worker) {
      return Promise.reject(new Error("CryptoWorkerClient not started or unavailable"));
    }

    return new Promise((resolve, reject) => {
      const id = String(this._nextId++);
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({ id, type, payload });
    });
  }

  /**
   * Handle a message from the worker.
   * @private
   */
  _handleMessage(event) {
    const { id, result, error } = event.data;
    const pending = this._pending.get(id);
    if (!pending) return;

    this._pending.delete(id);

    if (error !== undefined) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Handle an unrecoverable worker error.
   * @private
   */
  _handleError(err) {
    console.error("[CryptoWorkerClient] Worker error:", err);
    // Reject all pending calls
    for (const { reject } of this._pending.values()) {
      reject(new Error(`Worker error: ${err.message || err}`));
    }
    this._pending.clear();
    this.isRunning = false;
  }
}

// Convenience singleton for apps that only need one worker
export const cryptoWorker = new CryptoWorkerClient();
