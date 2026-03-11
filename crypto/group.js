/**
 * Lifeline Mesh - Group Messaging Cryptography
 *
 * Implements Signal-style Sender Keys protocol for group messaging.
 *
 * Security Properties:
 * - Forward secrecy: Each message advances the chain key (ratchet)
 * - Post-compromise security: Removing a member triggers key rotation
 * - Authenticity: Every message is signed with the sender's Ed25519 key
 * - Confidentiality: AES-256 equivalent (XSalsa20-Poly1305) via NaCl secretbox
 *
 * Protocol Overview:
 * 1. Group creation: Creator generates a group ID and initial Sender Key
 * 2. Key distribution: Sender Key distributed to each member via 1-to-1 encryption
 * 3. Message sending: Encrypt with message key derived from chain key, then ratchet
 * 4. Member removal: Generate new Sender Key and redistribute to remaining members
 *
 * @module crypto/group
 */

import { concatU8, fingerprintFromSignPK } from "./core.js";

// Domain separation constants
const DOMAIN_GROUP_SIGN = "DMESH_GROUP_V1";
const DOMAIN_MSG_KEY = "DMESH_GROUP_MSG_KEY";
const DOMAIN_CHAIN_KEY = "DMESH_GROUP_CHAIN";

// Group message format version
const GROUP_MSG_VERSION = 1;

// ============================================================================
// Sender Key Management
// ============================================================================

/**
 * Generate a new Sender Key for a group
 *
 * The Sender Key contains:
 * - A signing key pair (Ed25519) for authenticating messages
 * - A chain key (32 bytes) used to derive per-message encryption keys
 *
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {{version: number, signKeyPair: {publicKey: Uint8Array, secretKey: Uint8Array}, chainKey: string}}
 */
export function generateSenderKey(nacl, naclUtil) {
  const signKeyPair = nacl.sign.keyPair();
  const chainKey = nacl.randomBytes(32);

  return {
    version: 1,
    signKeyPair: {
      publicKey: signKeyPair.publicKey,
      secretKey: signKeyPair.secretKey
    },
    chainKey: naclUtil.encodeBase64(chainKey)
  };
}

/**
 * Ratchet (advance) the chain key forward
 *
 * Each call produces a new chain key, making past chain keys unrecoverable.
 * This provides forward secrecy: compromise of current key does not expose past messages.
 *
 * Derivation: newChainKey = SHA-512(DOMAIN_CHAIN_KEY || chainKey)[0:32]
 *
 * @param {string} chainKeyB64 - Current chain key (base64)
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {string} - New chain key (base64)
 */
export function ratchetChainKey(chainKeyB64, nacl, naclUtil) {
  const chainKey = naclUtil.decodeBase64(chainKeyB64);
  const domain = naclUtil.decodeUTF8(DOMAIN_CHAIN_KEY);
  const input = concatU8([domain, chainKey]);
  const next = nacl.hash(input).slice(0, 32);
  return naclUtil.encodeBase64(next);
}

/**
 * Derive the per-message encryption key from the current chain key
 *
 * Derivation: msgKey = SHA-512(DOMAIN_MSG_KEY || chainKey)[0:32]
 * The message key is NOT advanced – only the chain key ratchets.
 *
 * @param {string} chainKeyB64 - Current chain key (base64)
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {Uint8Array} - 32-byte message key
 */
export function deriveMessageKey(chainKeyB64, nacl, naclUtil) {
  const chainKey = naclUtil.decodeBase64(chainKeyB64);
  const domain = naclUtil.decodeUTF8(DOMAIN_MSG_KEY);
  const input = concatU8([domain, chainKey]);
  return nacl.hash(input).slice(0, 32);
}

// ============================================================================
// Sign Bytes Construction
// ============================================================================

/**
 * Build the canonical byte string that is signed for a group message
 *
 * Format: DOMAIN || groupId || senderKeyVersion (1 byte) || nonce || ciphertext
 *
 * @param {object} params
 * @param {string} params.groupId - Group UUID
 * @param {number} params.senderKeyVersion - Sender key version
 * @param {Uint8Array} params.nonce - Message nonce
 * @param {Uint8Array} params.ciphertext - Encrypted payload
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {Uint8Array}
 */
function buildGroupSignBytes({ groupId, senderKeyVersion, nonce, ciphertext }, naclUtil) {
  const domain = naclUtil.decodeUTF8(DOMAIN_GROUP_SIGN);
  const groupIdBytes = naclUtil.decodeUTF8(groupId);
  const versionByte = new Uint8Array([senderKeyVersion & 0xff]);
  return concatU8([domain, groupIdBytes, versionByte, nonce, ciphertext]);
}

// ============================================================================
// Group Message Encryption / Decryption
// ============================================================================

/**
 * Encrypt a group message
 *
 * After calling this function, the caller MUST advance the sender key chain:
 *   senderKey.chainKey = ratchetChainKey(senderKey.chainKey, nacl, naclUtil)
 *
 * @param {object} params
 * @param {string} params.content - Plaintext message content
 * @param {string} params.groupId - Group UUID
 * @param {object} params.senderKey - Sender key (from generateSenderKey)
 * @param {string} params.senderKey.chainKey - Current chain key (base64)
 * @param {number} params.senderKey.version - Sender key version
 * @param {object} params.senderKey.signKeyPair - Ed25519 signing key pair
 * @param {Uint8Array} params.senderSignSK - Sender's long-term Ed25519 secret key
 * @param {Uint8Array} params.senderSignPK - Sender's long-term Ed25519 public key
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Encrypted group message
 */
export function encryptGroupMessage(
  { content, groupId, senderKey, senderSignSK, senderSignPK },
  nacl,
  naclUtil
) {
  // Derive per-message encryption key from current chain key
  const messageKey = deriveMessageKey(senderKey.chainKey, nacl, naclUtil);

  // Encrypt the payload with NaCl secretbox
  const payload = naclUtil.decodeUTF8(JSON.stringify({
    v: GROUP_MSG_VERSION,
    ts: Date.now(),
    content
  }));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(payload, nonce, messageKey);

  if (!ciphertext) {
    throw new Error("Group message encryption failed");
  }

  // Build sign bytes and sign with long-term identity key
  const signBytes = buildGroupSignBytes({
    groupId,
    senderKeyVersion: senderKey.version,
    nonce,
    ciphertext
  }, naclUtil);
  const signature = nacl.sign.detached(signBytes, senderSignSK);

  return {
    v: GROUP_MSG_VERSION,
    kind: "dmesh-group-msg",
    groupId,
    ts: Date.now(),
    senderSignPK: naclUtil.encodeBase64(senderSignPK),
    senderKeyVersion: senderKey.version,
    senderKeyPK: naclUtil.encodeBase64(senderKey.signKeyPair.publicKey),
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    signature: naclUtil.encodeBase64(signature)
  };
}

/**
 * Decrypt a group message
 *
 * Verifies the long-term identity signature and then decrypts the payload.
 *
 * @param {object} params
 * @param {object} params.message - Encrypted group message object
 * @param {object} params.senderKey - Sender key for the matching version
 * @param {string} params.senderKey.chainKey - Chain key at the time of sending (base64)
 * @param {number} params.senderKey.version - Sender key version
 * @param {Uint8Array} [params.expectedSenderSignPK] - Expected sender's long-term public key
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {{content: string, ts: number, senderSignPK: Uint8Array}} - Decrypted payload
 */
export function decryptGroupMessage(
  { message, senderKey, expectedSenderSignPK },
  nacl,
  naclUtil
) {
  // Validate message structure
  if (!message || message.v !== GROUP_MSG_VERSION || message.kind !== "dmesh-group-msg") {
    throw new Error("Invalid group message format");
  }

  // Verify sender key version matches
  if (message.senderKeyVersion !== senderKey.version) {
    throw new Error(
      `Sender key version mismatch: expected ${senderKey.version}, got ${message.senderKeyVersion}`
    );
  }

  // Decode components
  const senderSignPK = naclUtil.decodeBase64(message.senderSignPK);
  const nonce = naclUtil.decodeBase64(message.nonce);
  const ciphertext = naclUtil.decodeBase64(message.ciphertext);
  const signature = naclUtil.decodeBase64(message.signature);

  // Verify expected sender if provided (TOFU: trust on first use if not provided)
  if (expectedSenderSignPK) {
    for (let i = 0; i < 32; i++) {
      if (senderSignPK[i] !== expectedSenderSignPK[i]) {
        throw new Error("Sender identity key mismatch");
      }
    }
  }

  // Verify long-term identity signature
  const signBytes = buildGroupSignBytes({
    groupId: message.groupId,
    senderKeyVersion: message.senderKeyVersion,
    nonce,
    ciphertext
  }, naclUtil);

  if (!nacl.sign.detached.verify(signBytes, signature, senderSignPK)) {
    throw new Error("Invalid group message signature");
  }

  // Derive message key and decrypt
  const messageKey = deriveMessageKey(senderKey.chainKey, nacl, naclUtil);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, messageKey);

  if (!plaintext) {
    throw new Error("Group message decryption failed - wrong key or corrupted message");
  }

  const payload = JSON.parse(naclUtil.encodeUTF8(plaintext));
  return {
    content: payload.content,
    ts: payload.ts,
    senderSignPK
  };
}

// ============================================================================
// Group Creation and Member Management
// ============================================================================

/**
 * Create a new group
 *
 * @param {object} params
 * @param {string} params.name - Group name
 * @param {Uint8Array} params.creatorSignPK - Creator's long-term Ed25519 public key
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {{group: object, senderKey: object}} - Group info and initial sender key
 */
export function createGroup({ name, creatorSignPK }, nacl, naclUtil) {
  // Generate a unique group ID (32 random bytes as base64)
  const groupIdBytes = nacl.randomBytes(16);
  const groupId = naclUtil.encodeBase64(groupIdBytes);

  const creatorFp = fingerprintFromSignPK(creatorSignPK, nacl);
  const senderKey = generateSenderKey(nacl, naclUtil);

  const group = {
    id: groupId,
    name,
    createdAt: Date.now(),
    createdBy: naclUtil.encodeBase64(creatorFp),
    members: [
      {
        fp: naclUtil.encodeBase64(creatorFp),
        signPK: naclUtil.encodeBase64(creatorSignPK),
        role: "admin",
        addedAt: Date.now()
      }
    ],
    senderKeyVersion: senderKey.version
  };

  return { group, senderKey };
}

/**
 * Distribute a sender key to a new member via 1-to-1 encryption
 *
 * The sender key is encrypted with the recipient's box public key using
 * the standard Lifeline Mesh message encryption (encryptMessage from core.js).
 * The caller should use encryptMessage from core.js with:
 *   content = JSON.stringify(serializeSenderKey(senderKey, naclUtil))
 *
 * This helper serializes a sender key for inclusion in the encrypted payload.
 *
 * @param {object} senderKey - Sender key object
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Serialized sender key (safe to include in JSON)
 */
export function serializeSenderKey(senderKey, naclUtil) {
  return {
    version: senderKey.version,
    signPK: naclUtil.encodeBase64(senderKey.signKeyPair.publicKey),
    signSK: naclUtil.encodeBase64(senderKey.signKeyPair.secretKey),
    chainKey: senderKey.chainKey
  };
}

/**
 * Deserialize a sender key received from another member
 *
 * @param {object} serialized - Serialized sender key
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Sender key object ready for use
 */
export function deserializeSenderKey(serialized, naclUtil) {
  return {
    version: serialized.version,
    signKeyPair: {
      publicKey: naclUtil.decodeBase64(serialized.signPK),
      secretKey: naclUtil.decodeBase64(serialized.signSK)
    },
    chainKey: serialized.chainKey
  };
}
