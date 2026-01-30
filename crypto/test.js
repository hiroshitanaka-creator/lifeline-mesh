/**
 * Basic smoke tests for crypto core functions
 * Run with: node test.js
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as DMesh from "./core.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    failed++;
  }
}

// ============================================================================
// Tests
// ============================================================================

test("generateSignKeyPair produces valid keys", () => {
  const kp = DMesh.generateSignKeyPair(nacl);
  if (kp.publicKey.length !== 32) throw new Error("Invalid public key length");
  if (kp.secretKey.length !== 64) throw new Error("Invalid secret key length");
});

test("generateBoxKeyPair produces valid keys", () => {
  const kp = DMesh.generateBoxKeyPair(nacl);
  if (kp.publicKey.length !== 32) throw new Error("Invalid public key length");
  if (kp.secretKey.length !== 32) throw new Error("Invalid secret key length");
});

test("fingerprintFromSignPK produces 16-byte fingerprint", () => {
  const kp = DMesh.generateSignKeyPair(nacl);
  const fp = DMesh.fingerprintFromSignPK(kp.publicKey, nacl);
  if (fp.length !== 16) throw new Error("Invalid fingerprint length");
});

test("createPublicIdentity creates valid identity object", () => {
  const signKP = DMesh.generateSignKeyPair(nacl);
  const boxKP = DMesh.generateBoxKeyPair(nacl);
  const id = DMesh.createPublicIdentity({
    name: "Alice",
    signPK: signKP.publicKey,
    boxPK: boxKP.publicKey
  }, nacl, naclUtil);

  if (id.v !== 1) throw new Error("Invalid version");
  if (id.kind !== "dmesh-id") throw new Error("Invalid kind");
  if (id.name !== "Alice") throw new Error("Invalid name");
  if (!id.fp) throw new Error("Missing fingerprint");
  if (!id.signPK) throw new Error("Missing signPK");
  if (!id.boxPK) throw new Error("Missing boxPK");
});

test("encryptMessage creates valid encrypted message", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    ts: Date.now()
  }, nacl, naclUtil);

  if (msg.v !== 1) throw new Error("Invalid version");
  if (msg.kind !== "dmesh-msg") throw new Error("Invalid kind");
  if (!msg.ts) throw new Error("Missing timestamp");
  if (!msg.senderSignPK) throw new Error("Missing senderSignPK");
  if (!msg.senderBoxPK) throw new Error("Missing senderBoxPK");
  if (!msg.recipientBoxPK) throw new Error("Missing recipientBoxPK");
  if (!msg.ephPK) throw new Error("Missing ephPK");
  if (!msg.nonce) throw new Error("Missing nonce");
  if (!msg.ciphertext) throw new Error("Missing ciphertext");
  if (!msg.signature) throw new Error("Missing signature");
});

test("decryptMessage decrypts valid message", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey
  }, nacl, naclUtil);

  const result = DMesh.decryptMessage({
    message: msg,
    recipientBoxPK: bobBox.publicKey,
    recipientBoxSK: bobBox.secretKey,
    expectedSenderSignPK: null, // TOFU
    expectedSenderBoxPK: null
  }, nacl, naclUtil);

  if (result.content !== "Hello, Bob!") throw new Error("Decrypted content mismatch");
  if (!result.senderSignPK) throw new Error("Missing senderSignPK");
  if (!result.senderBoxPK) throw new Error("Missing senderBoxPK");
  if (!result.senderFp) throw new Error("Missing senderFp");
  if (!result.ts) throw new Error("Missing timestamp");
});

test("decryptMessage rejects message for wrong recipient", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);
  const eveBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey
  }, nacl, naclUtil);

  try {
    DMesh.decryptMessage({
      message: msg,
      recipientBoxPK: eveBox.publicKey, // Eve tries to decrypt
      recipientBoxSK: eveBox.secretKey,
      expectedSenderSignPK: null,
      expectedSenderBoxPK: null
    }, nacl, naclUtil);
    throw new Error("Should have rejected wrong recipient");
  } catch (e) {
    if (!e.message.includes("Not intended for this recipient")) {
      throw new Error("Wrong error message: " + e.message);
    }
  }
});

test("decryptMessage rejects tampered signature", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey
  }, nacl, naclUtil);

  // Tamper with signature
  msg.signature = naclUtil.encodeBase64(new Uint8Array(64));

  try {
    DMesh.decryptMessage({
      message: msg,
      recipientBoxPK: bobBox.publicKey,
      recipientBoxSK: bobBox.secretKey,
      expectedSenderSignPK: null,
      expectedSenderBoxPK: null
    }, nacl, naclUtil);
    throw new Error("Should have rejected tampered signature");
  } catch (e) {
    if (!e.message.includes("Invalid signature")) {
      throw new Error("Wrong error message: " + e.message);
    }
  }
});

test("decryptMessage rejects sender key mismatch", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);
  const eveSign = DMesh.generateSignKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey
  }, nacl, naclUtil);

  try {
    DMesh.decryptMessage({
      message: msg,
      recipientBoxPK: bobBox.publicKey,
      recipientBoxSK: bobBox.secretKey,
      expectedSenderSignPK: eveSign.publicKey, // Expect Eve, but Alice sent
      expectedSenderBoxPK: null
    }, nacl, naclUtil);
    throw new Error("Should have rejected key mismatch");
  } catch (e) {
    if (!e.message.includes("Sender signing key mismatch")) {
      throw new Error("Wrong error message: " + e.message);
    }
  }
});

test("decryptMessage rejects timestamp skew in strict mode (v1.0)", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  // Message from 1 hour ago
  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    ts: Date.now() - (60 * 60 * 1000)
  }, nacl, naclUtil);

  try {
    DMesh.decryptMessage({
      message: msg,
      recipientBoxPK: bobBox.publicKey,
      recipientBoxSK: bobBox.secretKey,
      expectedSenderSignPK: null,
      expectedSenderBoxPK: null,
      options: { strictMode: true } // v1.0 strict mode
    }, nacl, naclUtil);
    throw new Error("Should have rejected timestamp skew");
  } catch (e) {
    if (!e.message.includes("Timestamp skew too large")) {
      throw new Error("Wrong error message: " + e.message);
    }
  }
});

test("decryptMessage accepts delayed message in DTN mode (v1.1)", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  // Message from 1 hour ago - would fail in strict mode
  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    ts: Date.now() - (60 * 60 * 1000) // 1 hour ago
  }, nacl, naclUtil);

  // v1.1 DTN mode - should accept (within 7 day default TTL)
  const result = DMesh.decryptMessage({
    message: msg,
    recipientBoxPK: bobBox.publicKey,
    recipientBoxSK: bobBox.secretKey,
    expectedSenderSignPK: null,
    expectedSenderBoxPK: null,
    options: { strictMode: false }
  }, nacl, naclUtil);

  if (result.content !== "Hello, Bob!") throw new Error("Decryption failed");
});

test("decryptMessage rejects expired message (v1.1)", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  // Create message with short TTL that's already expired
  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    ts: Date.now() - (60 * 60 * 1000), // 1 hour ago
    ttlMs: 30 * 60 * 1000 // 30 minute TTL (already expired)
  }, nacl, naclUtil);

  try {
    DMesh.decryptMessage({
      message: msg,
      recipientBoxPK: bobBox.publicKey,
      recipientBoxSK: bobBox.secretKey,
      expectedSenderSignPK: null,
      expectedSenderBoxPK: null,
      options: { strictMode: false }
    }, nacl, naclUtil);
    throw new Error("Should have rejected expired message");
  } catch (e) {
    if (!e.message.includes("expired")) {
      throw new Error("Wrong error message: " + e.message);
    }
  }
});

test("encryptMessage includes msgId and exp (v1.1)", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    type: "im_safe"
  }, nacl, naclUtil);

  if (!msg.msgId) throw new Error("Missing msgId");
  if (!msg.exp) throw new Error("Missing exp");
  if (msg.exp <= msg.ts) throw new Error("exp should be after ts");
});

test("generateSafetyNumber is symmetric", () => {
  const aliceFp = DMesh.fingerprintFromSignPK(
    DMesh.generateSignKeyPair(nacl).publicKey, nacl
  );
  const bobFp = DMesh.fingerprintFromSignPK(
    DMesh.generateSignKeyPair(nacl).publicKey, nacl
  );

  const sn1 = DMesh.generateSafetyNumber(aliceFp, bobFp);
  const sn2 = DMesh.generateSafetyNumber(bobFp, aliceFp);

  if (sn1 !== sn2) throw new Error("Safety number should be symmetric");
  if (!/^\d{4}-\d{4}$/.test(sn1)) throw new Error("Invalid safety number format");
});

test("messageIdFromCiphertext produces 32-byte ID", () => {
  const ciphertext = nacl.randomBytes(100);
  const msgId = DMesh.messageIdFromCiphertext(ciphertext, nacl);
  if (msgId.length !== 32) throw new Error("Invalid msgId length");
});

test("isMessageValid validates expiration correctly", () => {
  const now = Date.now();

  // Valid: no exp, within default TTL
  const valid1 = { ts: now - 1000, v: 1 };
  if (!DMesh.isMessageValid(valid1)) throw new Error("Should be valid (within TTL)");

  // Valid: exp in future
  const valid2 = { ts: now - 1000, exp: now + 60000, v: 1 };
  if (!DMesh.isMessageValid(valid2)) throw new Error("Should be valid (exp in future)");

  // Invalid: exp in past
  const invalid1 = { ts: now - 60000, exp: now - 1000, v: 1 };
  if (DMesh.isMessageValid(invalid1)) throw new Error("Should be invalid (exp in past)");

  // Strict mode: timestamp skew
  const invalid2 = { ts: now - 15 * 60 * 1000, v: 1 }; // 15 min ago
  if (DMesh.isMessageValid(invalid2, { strictMode: true })) {
    throw new Error("Should be invalid in strict mode");
  }
});

test("decryptMessage calls replay check function", () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);

  const msg = DMesh.encryptMessage({
    content: "Hello, Bob!",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey
  }, nacl, naclUtil);

  let replayCheckCalled = false;
  const replayCheck = (_senderFp, _nonceB64) => {
    replayCheckCalled = true;
    return true; // Allow
  };

  DMesh.decryptMessage({
    message: msg,
    recipientBoxPK: bobBox.publicKey,
    recipientBoxSK: bobBox.secretKey,
    expectedSenderSignPK: null,
    expectedSenderBoxPK: null,
    replayCheck
  }, nacl, naclUtil);

  if (!replayCheckCalled) throw new Error("Replay check not called");
});

test("u32be converts number to big-endian bytes", () => {
  const bytes = DMesh.u32be(0x12345678);
  if (bytes.length !== 4) throw new Error("Invalid length");
  if (bytes[0] !== 0x12) throw new Error("Invalid byte 0");
  if (bytes[1] !== 0x34) throw new Error("Invalid byte 1");
  if (bytes[2] !== 0x56) throw new Error("Invalid byte 2");
  if (bytes[3] !== 0x78) throw new Error("Invalid byte 3");
});

test("u64beFromNumber converts timestamp to big-endian bytes", () => {
  const ts = 1706012345678;
  const bytes = DMesh.u64beFromNumber(ts);
  if (bytes.length !== 8) throw new Error("Invalid length");

  // Reconstruct number from bytes
  const dv = new DataView(bytes.buffer);
  const hi = dv.getUint32(0, false);
  const lo = dv.getUint32(4, false);
  const reconstructed = hi * 4294967296 + lo;

  if (reconstructed !== ts) throw new Error("Reconstruction mismatch");
});

test("concatU8 concatenates arrays correctly", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([3, 4, 5]);
  const c = new Uint8Array([6]);
  const result = DMesh.concatU8([a, b, c]);

  if (result.length !== 6) throw new Error("Invalid length");
  if (result[0] !== 1 || result[1] !== 2 || result[2] !== 3 ||
      result[3] !== 4 || result[4] !== 5 || result[5] !== 6) {
    throw new Error("Invalid concatenation");
  }
});

// ============================================================================
// Summary
// ============================================================================

console.log("\n" + "=".repeat(50));
console.log(`Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
