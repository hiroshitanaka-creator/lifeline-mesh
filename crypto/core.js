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

// v1.0 (legacy): Strict timestamp skew
export const MAX_SKEW_MS = 10 * 60 * 1000; // 10 minutes

// v1.1: Delay-tolerant networking constants
export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Chunking constants
export const CHUNK_OVERHEAD = 150; // JSON envelope overhead (bytes)
export const QR_MAX_CHUNK_SIZE = 2048;
export const SMS_MAX_CHUNK_SIZE = 1200;
export const LORA_MAX_CHUNK_SIZE = 200;
export const BLE_MAX_CHUNK_SIZE = 512;

// Legacy alias
export const REPLAY_RETENTION_MS = SEEN_RETENTION_MS;

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
// Message ID (v1.1)
// ============================================================================

/**
 * Generate Message ID from ciphertext
 * Uses first 32 bytes of SHA-512 hash (equivalent to SHA-256 output size)
 * @param {Uint8Array} ciphertext - Encrypted payload
 * @param {object} nacl - TweetNaCl instance
 * @returns {Uint8Array} - 32-byte message ID
 */
export function messageIdFromCiphertext(ciphertext, nacl) {
  const h = nacl.hash(ciphertext); // SHA-512 → 64 bytes
  return h.slice(0, 32); // First 32 bytes (SHA-256 equivalent)
}

// ============================================================================
// Expiration Validation (v1.1 DTN)
// ============================================================================

/**
 * Check if a message is still valid (not expired)
 * v1.1 uses expiration-based validation instead of strict timestamp skew
 *
 * @param {object} message - Message object with ts and optional exp
 * @param {object} [options] - Validation options
 * @param {boolean} [options.strictMode=false] - Use v1.0 strict timestamp validation
 * @returns {boolean} - True if message is valid
 */
export function isMessageValid(message, options = {}) {
  const now = Date.now();

  // v1.0 strict mode (legacy)
  if (options.strictMode) {
    return Math.abs(now - message.ts) <= MAX_SKEW_MS;
  }

  // v1.1: Expiration-based validation
  if (message.exp !== undefined) {
    return now <= message.exp;
  }

  // Fallback: ts + DEFAULT_TTL
  return now <= (message.ts + DEFAULT_TTL_MS);
}

/**
 * Calculate expiration timestamp from TTL
 * @param {number} ts - Creation timestamp (milliseconds)
 * @param {number} [ttlMs] - Time to live in milliseconds (defaults to DEFAULT_TTL_MS)
 * @returns {number} - Expiration timestamp
 */
export function calculateExpiration(ts, ttlMs = DEFAULT_TTL_MS) {
  return ts + ttlMs;
}

// ============================================================================
// Safety Numbers (v1.1)
// ============================================================================

/**
 * Generate a human-readable safety number from fingerprints
 * Used for out-of-band verification of contact identity
 *
 * @param {Uint8Array} fp1 - First fingerprint (16 bytes)
 * @param {Uint8Array} fp2 - Second fingerprint (16 bytes)
 * @returns {string} - 8-digit safety number (e.g., "1234-5678")
 */
export function generateSafetyNumber(fp1, fp2) {
  // Sort fingerprints for consistent ordering regardless of who initiates
  const sorted = [fp1, fp2].sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  });

  // XOR the fingerprints
  const combined = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    combined[i] = sorted[0][i] ^ sorted[1][i];
  }

  // Extract 8 decimal digits from first 4 bytes
  const view = new DataView(combined.buffer, combined.byteOffset, 4);
  const num = view.getUint32(0, false) % 100000000;
  const padded = num.toString().padStart(8, "0");

  // Format as XXXX-XXXX
  return `${padded.slice(0, 4)}-${padded.slice(4)}`;
}

// ============================================================================
// Chunking (v1.1)
// ============================================================================

/**
 * Split a message into chunks for constrained transports
 *
 * @param {object} msgJson - Complete message object (dmesh-msg)
 * @param {number} maxChunkSize - Maximum chunk size in bytes
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object[]} - Array of chunk objects (dmesh-chunk)
 */
export function chunkMessage(msgJson, maxChunkSize, nacl, naclUtil) {
  const msgBytes = naclUtil.decodeUTF8(JSON.stringify(msgJson));
  const ciphertext = naclUtil.decodeBase64(msgJson.ciphertext);
  const msgId = messageIdFromCiphertext(ciphertext, nacl);
  const msgIdB64 = naclUtil.encodeBase64(msgId);

  const dataSize = maxChunkSize - CHUNK_OVERHEAD;
  if (dataSize <= 0) {
    throw new Error("Max chunk size too small");
  }

  const chunks = [];
  const total = Math.ceil(msgBytes.length / dataSize);

  for (let i = 0; i < total; i++) {
    const start = i * dataSize;
    const end = Math.min(start + dataSize, msgBytes.length);
    const chunkData = msgBytes.slice(start, end);

    chunks.push({
      v: 1,
      kind: "dmesh-chunk",
      msgId: msgIdB64,
      seq: i,
      total,
      data: naclUtil.encodeBase64(chunkData)
    });
  }

  return chunks;
}

/**
 * Reassemble chunks into original message
 *
 * @param {object[]} chunks - Array of chunk objects (dmesh-chunk)
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Reassembled message object (dmesh-msg)
 */
export function reassembleChunks(chunks, naclUtil) {
  if (!chunks || chunks.length === 0) {
    throw new Error("No chunks provided");
  }

  // Validate all chunks have same kind
  if (!chunks.every(c => c.kind === "dmesh-chunk")) {
    throw new Error("Invalid chunk kind");
  }

  // Sort by sequence
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);

  // Verify completeness
  const expectedTotal = sorted[0].total;
  if (sorted.length !== expectedTotal) {
    throw new Error(`Incomplete chunks: have ${sorted.length}, need ${expectedTotal}`);
  }

  // Verify sequence numbers are consecutive
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].seq !== i) {
      throw new Error(`Missing chunk sequence ${i}`);
    }
  }

  // Verify all msgId match
  const msgId = sorted[0].msgId;
  if (!sorted.every(c => c.msgId === msgId)) {
    throw new Error("Message ID mismatch across chunks");
  }

  // Reassemble
  const dataArrays = sorted.map(c => naclUtil.decodeBase64(c.data));
  const totalLength = dataArrays.reduce((sum, arr) => sum + arr.length, 0);
  const msgBytes = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of dataArrays) {
    msgBytes.set(arr, offset);
    offset += arr.length;
  }

  const msgText = naclUtil.encodeUTF8(msgBytes);
  return JSON.parse(msgText);
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
 * @param {number} [params.ttlMs] - Time to live in ms (v1.1, defaults to DEFAULT_TTL_MS)
 * @param {string} [params.type] - Message type (v1.1: text, im_safe, need_help, etc.)
 * @param {object} [params.payloadExtra] - Additional payload fields (v1.1: location, urgency, etc.)
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {object} - Encrypted message object with msgId and exp (v1.1)
 */
export function encryptMessage({ content, senderSignPK, senderSignSK, senderBoxPK, senderBoxSK: _senderBoxSK, recipientBoxPK, ts, ttlMs, type, payloadExtra }, nacl, naclUtil) {
  const timestamp = ts ?? Date.now();
  const expiration = calculateExpiration(timestamp, ttlMs);

  // Check content size
  const contentBlob = new Blob([content]);
  if (contentBlob.size > MAX_BYTES) {
    throw new Error(`Content too large (max ${MAX_BYTES} bytes)`);
  }

  // Generate ephemeral key pair
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  // Construct payload (v1.1 with optional type and extra fields)
  const payload = {
    v: 1,
    ts: timestamp,
    type: type || "text",
    content,
    ...payloadExtra
  };
  const payloadBytes = naclUtil.decodeUTF8(JSON.stringify(payload));

  // Encrypt with ephemeral key
  const shared = nacl.box.before(recipientBoxPK, eph.secretKey);
  const ciphertext = nacl.box.after(payloadBytes, nonce, shared);

  if (!ciphertext) {
    throw new Error("Encryption failed");
  }

  // Generate message ID from ciphertext (v1.1)
  const msgId = messageIdFromCiphertext(ciphertext, nacl);

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

  // Return message object (v1.1 with msgId and exp)
  return {
    v: 1,
    kind: "dmesh-msg",
    msgId: naclUtil.encodeBase64(msgId),
    ts: timestamp,
    exp: expiration,
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
 * @param {Function} [params.replayCheck] - Function(msgId, senderFp) => boolean (true if allowed)
 * @param {object} [params.options] - Additional options
 * @param {boolean} [params.options.strictMode=false] - Use v1.0 strict timestamp validation
 * @param {object} nacl - TweetNaCl instance
 * @param {object} naclUtil - TweetNaCl-util instance
 * @returns {{content: string, senderSignPK: Uint8Array, senderBoxPK: Uint8Array, senderFp: Uint8Array, ts: number, msgId: string, type: string, payload: object}}
 */
export function decryptMessage({ message, recipientBoxPK, recipientBoxSK, expectedSenderSignPK, expectedSenderBoxPK, replayCheck, options = {} }, nacl, naclUtil) {
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
  } catch {
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

  // v1.1: Expiration-based validation (delay-tolerant)
  // v1.0: Strict timestamp skew check (legacy, use options.strictMode)
  if (!isMessageValid(message, options)) {
    if (options.strictMode) {
      throw new Error("Timestamp skew too large");
    } else {
      throw new Error("Message expired");
    }
  }

  // Compute or verify message ID (v1.1)
  const computedMsgId = messageIdFromCiphertext(ciphertext, nacl);
  const msgIdB64 = naclUtil.encodeBase64(computedMsgId);

  // If message has msgId, verify it matches
  if (message.msgId && message.msgId !== msgIdB64) {
    throw new Error("Message ID mismatch");
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

  // Replay check (optional) - v1.1 uses msgId + senderFp
  if (replayCheck) {
    const senderFpB64 = naclUtil.encodeBase64(senderFp);
    const allowed = replayCheck(msgIdB64, senderFpB64);
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
  } catch {
    throw new Error("Payload JSON parse failed");
  }

  // Return extended result (v1.1)
  return {
    content: payload.content ?? text,
    senderSignPK,
    senderBoxPK,
    senderFp,
    ts,
    msgId: msgIdB64,
    type: payload.type || "text",
    payload
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
