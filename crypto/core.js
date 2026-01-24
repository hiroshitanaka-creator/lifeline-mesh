/**
 * Lifeline Mesh - Core Cryptographic Functions
 *
 * Pure cryptographic operations extracted from the UI implementation.
 * Can be used in both browser and Node.js environments.
 *
 * Dependencies: TweetNaCl, TweetNaCl-util
 */

// ============================================================================
// Constants
// ============================================================================

export const DOMAIN = "DMESH_MSG_V1";
export const MAX_BYTES = 150 * 1024; // 150 KB
export const MAX_SKEW_MS = 10 * 60 * 1000; // 10 minutes
export const REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ============================================================================
// Byte Utilities
// ============================================================================

/**
 * Concatenate multiple Uint8Array into one
 * @param {Uint8Array[]} arrs - Arrays to concatenate
 * @returns {Uint8Array}
 */
export function concatU8(arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/**
 * Convert number to 4-byte big-endian Uint8Array
 * @param {number} n - Number to convert (uint32)
 * @returns {Uint8Array}
 */
export function u32be(n) {
  const b = new Uint8Array(4);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, n >>> 0, false); // big-endian
  return b;
}

/**
 * Convert number to 8-byte big-endian Uint8Array
 * @param {number} ts - Timestamp in milliseconds
 * @returns {Uint8Array}
 */
export function u64beFromNumber(ts) {
  // JS number has 53-bit precision. Date.now() is safe.
  const hi = Math.floor(ts / 4294967296);
  const lo = ts >>> 0;
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, hi >>> 0, false);
  dv.setUint32(4, lo >>> 0, false);
  return b;
}

// ============================================================================
// Fingerprint
// ============================================================================

/**
 * Generate fingerprint from signing public key
 * Uses first 16 bytes of SHA-512 hash
 * @param {Uint8Array} signPKu8 - Ed25519 public key (32 bytes)
 * @param {object} nacl - TweetNaCl instance
 * @returns {Uint8Array} - 16-byte fingerprint
 */
export function fingerprintFromSignPK(signPKu8, nacl) {
  const h = nacl.hash(signPKu8); // SHA-512 → 64 bytes
  return h.slice(0, 16); // First 16 bytes
}

// ============================================================================
// Signature Construction
// ============================================================================

/**
 * Build SignBytes for signature generation/verification
 *
 * SignBytes = concat([
 *   DOMAIN (12 bytes),
 *   senderSignPK (32 bytes),
 *   senderBoxPK (32 bytes),
 *   recipientBoxPK (32 bytes),
 *   ephPK (32 bytes),
 *   nonce (24 bytes),
 *   ts_u64be (8 bytes),
 *   ct_len_u32be (4 bytes),
 *   ciphertext (variable)
 * ])
 *
 * @param {object} params
 * @param {Uint8Array} params.senderSignPK - Sender's Ed25519 public key
 * @param {Uint8Array} params.senderBoxPK - Sender's X25519 public key
 * @param {Uint8Array} params.recipientBoxPK - Recipient's X25519 public key
 * @param {Uint8Array} params.ephPK - Ephemeral X25519 public key
 * @param {Uint8Array} params.nonce - 24-byte nonce
 * @param {number} params.ts - Timestamp (Unix milliseconds)
 * @param {Uint8Array} params.ciphertext - Encrypted payload
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {Uint8Array}
 */
export function buildSignBytes({ senderSignPK, senderBoxPK, recipientBoxPK, ephPK, nonce, ts, ciphertext }, naclUtil) {
  const DOMAIN_BYTES = naclUtil.decodeUTF8(DOMAIN);
  return concatU8([
    DOMAIN_BYTES,
    senderSignPK,
    senderBoxPK,
    recipientBoxPK,
    ephPK,
    nonce,
    u64beFromNumber(ts),
    u32be(ciphertext.length),
    ciphertext
  ]);
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate Ed25519 signing key pair
 * @param {object} nacl - TweetNaCl instance
 * @returns {{publicKey: Uint8Array, secretKey: Uint8Array}}
 */
export function generateSignKeyPair(nacl) {
  return nacl.sign.keyPair();
}

/**
 * Generate X25519 box (encryption) key pair
 * @param {object} nacl - TweetNaCl instance
 * @returns {{publicKey: Uint8Array, secretKey: Uint8Array}}
 */
export function generateBoxKeyPair(nacl) {
  return nacl.box.keyPair();
}

// ============================================================================
// Encryption
// ============================================================================

/**
 * Encrypt and sign a message
 *
 * @param {object} params
 * @param {string} params.content - Message content
 * @param {Uint8Array} params.senderSignPK - Sender's Ed25519 public key
 * @param {Uint8Array} params.senderSignSK - Sender's Ed25519 secret key
 * @param {Uint8Array} params.senderBoxPK - Sender's X25519 public key
 * @param {Uint8Array} params.senderBoxSK - Sender's X25519 secret key
 * @param {Uint8Array} params.recipientBoxPK - Recipient's X25519 public key
 * @param {number} [params.ts] - Timestamp (defaults to Date.now())
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Encrypted message object
 */
export function encryptMessage({ content, senderSignPK, senderSignSK, senderBoxPK, senderBoxSK, recipientBoxPK, ts }, nacl, naclUtil) {
  const timestamp = ts ?? Date.now();

  // Check content size
  const contentBlob = new Blob([content]);
  if (contentBlob.size > MAX_BYTES) {
    throw new Error(`Content too large (max ${MAX_BYTES} bytes)`);
  }

  // Generate ephemeral key pair
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Construct payload
  const payload = {
    v: 1,
    ts: timestamp,
    content
  };
  const payloadBytes = naclUtil.decodeUTF8(JSON.stringify(payload));

  // Encrypt with ephemeral key
  const shared = nacl.box.before(recipientBoxPK, eph.secretKey);
  const ciphertext = nacl.box.after(payloadBytes, nonce, shared);

  if (!ciphertext) {
    throw new Error("Encryption failed");
  }

  // Build signature bytes
  const signBytes = buildSignBytes({
    senderSignPK,
    senderBoxPK,
    recipientBoxPK,
    ephPK: eph.publicKey,
    nonce,
    ts: timestamp,
    ciphertext
  }, naclUtil);

  // Sign
  const signature = nacl.sign.detached(signBytes, senderSignSK);

  // Return message object
  return {
    v: 1,
    kind: "dmesh-msg",
    ts: timestamp,
    senderSignPK: naclUtil.encodeBase64(senderSignPK),
    senderBoxPK: naclUtil.encodeBase64(senderBoxPK),
    recipientBoxPK: naclUtil.encodeBase64(recipientBoxPK),
    ephPK: naclUtil.encodeBase64(eph.publicKey),
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    signature: naclUtil.encodeBase64(signature)
  };
}

// ============================================================================
// Decryption
// ============================================================================

/**
 * Verify and decrypt a message
 *
 * @param {object} params
 * @param {object} params.message - Encrypted message object
 * @param {Uint8Array} params.recipientBoxPK - Recipient's X25519 public key
 * @param {Uint8Array} params.recipientBoxSK - Recipient's X25519 secret key
 * @param {Uint8Array|null} [params.expectedSenderSignPK] - Expected sender's Ed25519 public key (null for TOFU)
 * @param {Uint8Array|null} [params.expectedSenderBoxPK] - Expected sender's X25519 box key (null for TOFU)
 * @param {Function} [params.replayCheck] - Function(senderFp, nonceB64) => boolean (true if allowed)
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {{content: string, senderSignPK: Uint8Array, senderBoxPK: Uint8Array, senderFp: Uint8Array, ts: number}}
 */
export function decryptMessage({ message, recipientBoxPK, recipientBoxSK, expectedSenderSignPK, expectedSenderBoxPK, replayCheck }, nacl, naclUtil) {
  // Validate message format
  if (!message || message.v !== 1 || message.kind !== "dmesh-msg") {
    throw new Error("Invalid message format");
  }

  // Decode base64 fields
  let senderSignPK, senderBoxPK, recipientBoxPKMsg, ephPK, nonce, ciphertext, signature;
  try {
    senderSignPK = naclUtil.decodeBase64(message.senderSignPK);
    senderBoxPK = naclUtil.decodeBase64(message.senderBoxPK);
    recipientBoxPKMsg = naclUtil.decodeBase64(message.recipientBoxPK);
    ephPK = naclUtil.decodeBase64(message.ephPK);
    nonce = naclUtil.decodeBase64(message.nonce);
    ciphertext = naclUtil.decodeBase64(message.ciphertext);
    signature = naclUtil.decodeBase64(message.signature);
  } catch (e) {
    throw new Error("Base64 decode failed");
  }

  // Validate lengths
  if (senderSignPK.length !== nacl.sign.publicKeyLength) throw new Error("senderSignPK length invalid");
  if (senderBoxPK.length !== nacl.box.publicKeyLength) throw new Error("senderBoxPK length invalid");
  if (recipientBoxPKMsg.length !== nacl.box.publicKeyLength) throw new Error("recipientBoxPK length invalid");
  if (ephPK.length !== nacl.box.publicKeyLength) throw new Error("ephPK length invalid");
  if (nonce.length !== nacl.box.nonceLength) throw new Error("nonce length invalid");
  if (signature.length !== nacl.sign.signatureLength) throw new Error("signature length invalid");

  const ts = Number(message.ts);
  if (!Number.isFinite(ts)) throw new Error("ts invalid");

  // Timestamp skew check
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    throw new Error("Timestamp skew too large");
  }

  // Recipient binding check
  if (naclUtil.encodeBase64(recipientBoxPK) !== message.recipientBoxPK) {
    throw new Error("Not intended for this recipient");
  }

  // Sender fingerprint
  const senderFp = fingerprintFromSignPK(senderSignPK, nacl);

  // Key consistency check (if known sender)
  if (expectedSenderSignPK !== null && expectedSenderSignPK !== undefined) {
    if (naclUtil.encodeBase64(expectedSenderSignPK) !== message.senderSignPK) {
      throw new Error("Sender signing key mismatch");
    }
  }
  if (expectedSenderBoxPK !== null && expectedSenderBoxPK !== undefined) {
    if (naclUtil.encodeBase64(expectedSenderBoxPK) !== message.senderBoxPK) {
      throw new Error("Sender box key mismatch");
    }
  }

  // Signature verification
  const signBytes = buildSignBytes({
    senderSignPK,
    senderBoxPK,
    recipientBoxPK: recipientBoxPKMsg,
    ephPK,
    nonce,
    ts,
    ciphertext
  }, naclUtil);

  const verified = nacl.sign.detached.verify(signBytes, signature, senderSignPK);
  if (!verified) {
    throw new Error("Invalid signature");
  }

  // Replay check (optional)
  if (replayCheck) {
    const allowed = replayCheck(naclUtil.encodeBase64(senderFp), message.nonce);
    if (!allowed) {
      throw new Error("Replay detected");
    }
  }

  // Decrypt
  const shared = nacl.box.before(ephPK, recipientBoxSK);
  const plaintext = nacl.box.open.after(ciphertext, nonce, shared);
  if (!plaintext) {
    throw new Error("Decryption failed");
  }

  const text = naclUtil.encodeUTF8(plaintext);

  // Parse payload
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error("Payload JSON parse failed");
  }

  return {
    content: payload.content ?? text,
    senderSignPK,
    senderBoxPK,
    senderFp,
    ts
  };
}

// ============================================================================
// Public Identity
// ============================================================================

/**
 * Create a public identity object
 * @param {object} params
 * @param {string} params.name - Display name
 * @param {Uint8Array} params.signPK - Ed25519 public key
 * @param {Uint8Array} params.boxPK - X25519 public key
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Public identity object
 */
export function createPublicIdentity({ name, signPK, boxPK }, nacl, naclUtil) {
  const fp = fingerprintFromSignPK(signPK, nacl);
  return {
    v: 1,
    kind: "dmesh-id",
    name,
    fp: naclUtil.encodeBase64(fp),
    signPK: naclUtil.encodeBase64(signPK),
    boxPK: naclUtil.encodeBase64(boxPK)
  };
}
