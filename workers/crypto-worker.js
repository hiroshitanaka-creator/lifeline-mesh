/**
 * Lifeline Mesh - Crypto Web Worker
 *
 * Runs all CPU-intensive cryptographic operations on a background thread
 * so the main thread (UI) stays responsive during key generation,
 * encryption, and decryption.
 *
 * Communication protocol:
 *   Request:  { id, type, payload }
 *   Response: { id, result } | { id, error }
 *
 * Supported operations (type):
 *   generateKeys       — generate sign + box key pairs
 *   encryptMessage     — encrypt a direct message
 *   decryptMessage     — decrypt a direct message
 *   generateSenderKey  — generate a group Sender Key
 *   ratchetChainKey    — advance the group chain key
 *   encryptGroupMessage — encrypt a group message
 *   decryptGroupMessage — decrypt a group message
 *   createGroup        — initialise a new group
 *   fingerprintFromSignPK — derive fingerprint
 *   generateSafetyNumber  — derive safety number for contact verification
 *
 * @module workers/crypto-worker
 */

// Dynamic imports are resolved relative to this worker file.
// Using importScripts is not needed for module workers (type:"module").
import nacl from "../node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../node_modules/tweetnacl-util/nacl-util.js";
import * as DMesh from "../crypto/core.js";
import * as Group from "../crypto/group.js";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Decode all base64 fields in a plain object whose keys end with "PK", "SK",
 * "Bytes", or are explicitly listed, returning a shallow copy with Uint8Arrays.
 *
 * This lets the client send everything as base64 JSON (which is serializable)
 * while the worker receives the raw bytes it needs for crypto operations.
 */
function decodeKeys(obj) {
  const out = { ...obj };
  const keyFields = [
    "senderSignPK", "senderSignSK", "senderBoxPK", "senderBoxSK",
    "recipientBoxPK", "recipientBoxSK",
    "expectedSenderSignPK", "expectedSenderBoxPK",
    "creatorSignPK"
  ];
  for (const field of keyFields) {
    if (out[field] && typeof out[field] === "string") {
      out[field] = naclUtil.decodeBase64(out[field]);
    }
  }
  return out;
}

/**
 * Encode all Uint8Array values in a plain object to base64 strings so the
 * result can be transferred back to the main thread via postMessage.
 */
function encodeResult(obj) {
  if (obj instanceof Uint8Array) {
    return naclUtil.encodeBase64(obj);
  }
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = encodeResult(v);
    }
    return out;
  }
  if (Array.isArray(obj)) {
    return obj.map(encodeResult);
  }
  return obj;
}

// ============================================================================
// Operation Handlers
// ============================================================================

const handlers = {
  /**
   * Generate fresh sign + box key pairs
   * Returns { signPK, signSK, boxPK, boxSK } — all base64
   */
  generateKeys() {
    const signKP = DMesh.generateSignKeyPair(nacl);
    const boxKP = DMesh.generateBoxKeyPair(nacl);
    return {
      signPK: naclUtil.encodeBase64(signKP.publicKey),
      signSK: naclUtil.encodeBase64(signKP.secretKey),
      boxPK: naclUtil.encodeBase64(boxKP.publicKey),
      boxSK: naclUtil.encodeBase64(boxKP.secretKey)
    };
  },

  /**
   * Encrypt a direct message
   * payload: { content, senderSignPK, senderSignSK, senderBoxPK, senderBoxSK,
   *            recipientBoxPK, ts?, ttlMs?, type? }
   * All key fields are base64 strings.
   */
  encryptMessage(payload) {
    const p = decodeKeys(payload);
    const msg = DMesh.encryptMessage(p, nacl, naclUtil);
    return msg; // already JSON-serializable (all fields are base64 strings)
  },

  /**
   * Decrypt a direct message
   * payload: { message, recipientBoxPK, recipientBoxSK,
   *            expectedSenderSignPK?, expectedSenderBoxPK?, replayCheck? }
   */
  decryptMessage(payload) {
    const p = decodeKeys(payload);
    const result = DMesh.decryptMessage(p, nacl, naclUtil);
    return encodeResult(result);
  },

  /**
   * Generate a new group Sender Key
   * Returns { version, signPK, signSK, chainKey } — all base64
   */
  generateSenderKey() {
    const sk = Group.generateSenderKey(nacl, naclUtil);
    return Group.serializeSenderKey(sk, naclUtil);
  },

  /**
   * Advance (ratchet) a chain key
   * payload: { chainKey }
   * Returns { chainKey } (new value, base64)
   */
  ratchetChainKey(payload) {
    const next = Group.ratchetChainKey(payload.chainKey, nacl, naclUtil);
    return { chainKey: next };
  },

  /**
   * Encrypt a group message
   * payload: { content, groupId, senderKey (serialized), senderSignSK, senderSignPK }
   */
  encryptGroupMessage(payload) {
    const { content, groupId, senderKey: sk, senderSignSK, senderSignPK } = payload;
    const senderKey = Group.deserializeSenderKey(sk, naclUtil);
    const signSK = naclUtil.decodeBase64(senderSignSK);
    const signPK = naclUtil.decodeBase64(senderSignPK);
    const msg = Group.encryptGroupMessage(
      { content, groupId, senderKey, senderSignSK: signSK, senderSignPK: signPK },
      nacl,
      naclUtil
    );
    return msg;
  },

  /**
   * Decrypt a group message
   * payload: { message, senderKey (serialized), expectedSenderSignPK? }
   */
  decryptGroupMessage(payload) {
    const { message, senderKey: sk, expectedSenderSignPK } = payload;
    const senderKey = Group.deserializeSenderKey(sk, naclUtil);
    const expected = expectedSenderSignPK
      ? naclUtil.decodeBase64(expectedSenderSignPK)
      : undefined;
    const result = Group.decryptGroupMessage(
      { message, senderKey, expectedSenderSignPK: expected },
      nacl,
      naclUtil
    );
    return encodeResult(result);
  },

  /**
   * Initialise a new group
   * payload: { name, creatorSignPK }
   */
  createGroup(payload) {
    const creatorSignPK = naclUtil.decodeBase64(payload.creatorSignPK);
    const { group, senderKey } = Group.createGroup(
      { name: payload.name, creatorSignPK },
      nacl,
      naclUtil
    );
    return { group, senderKey: Group.serializeSenderKey(senderKey, naclUtil) };
  },

  /**
   * Derive a fingerprint from a signing public key
   * payload: { signPK } (base64)
   * Returns { fp } (base64)
   */
  fingerprintFromSignPK(payload) {
    const signPK = naclUtil.decodeBase64(payload.signPK);
    const fp = DMesh.fingerprintFromSignPK(signPK, nacl);
    return { fp: naclUtil.encodeBase64(fp) };
  },

  /**
   * Generate a safety number for contact verification
   * payload: { fp1, fp2 } (both base64)
   * Returns { safetyNumber }
   */
  generateSafetyNumber(payload) {
    const fp1 = naclUtil.decodeBase64(payload.fp1);
    const fp2 = naclUtil.decodeBase64(payload.fp2);
    const safetyNumber = DMesh.generateSafetyNumber(fp1, fp2);
    return { safetyNumber };
  }
};

// ============================================================================
// Message Dispatcher
// ============================================================================

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  if (!id || !type) {
    return; // Malformed request; ignore silently
  }

  const handler = handlers[type];
  if (!handler) {
    self.postMessage({ id, error: `Unknown operation: ${type}` });
    return;
  }

  try {
    // Handlers may return a Promise (async operations like key backup) or a plain value
    const result = await handler(payload || {});
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
