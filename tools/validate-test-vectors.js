#!/usr/bin/env node
/**
 * Validate test vectors for Lifeline Mesh protocol
 *
 * Verifies that an implementation correctly handles test vectors.
 * Used for interoperability testing.
 *
 * Usage: node validate-test-vectors.js test-vectors.json
 */

import fs from 'fs';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as DMesh from '../crypto/core.js';

let passed = 0;
let failed = 0;

// Decrypt message without timestamp validation (for test vectors with old timestamps)
function decryptMessageSkipTimestamp({ message, recipientBoxPK, recipientBoxSK, expectedSenderSignPK, expectedSenderBoxPK }) {
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

  // SKIP timestamp skew check for test vectors

  // Recipient binding check
  if (naclUtil.encodeBase64(recipientBoxPK) !== message.recipientBoxPK) {
    throw new Error("Not intended for this recipient");
  }

  // Sender fingerprint
  const senderFp = DMesh.fingerprintFromSignPK(senderSignPK, nacl);

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
  const signBytes = DMesh.buildSignBytes({
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

function validateTestVectors(vectorsPath) {
  const data = fs.readFileSync(vectorsPath, 'utf8');
  const vectors = JSON.parse(data);

  console.log(`Validating test vectors from: ${vectorsPath}`);
  console.log(`Version: ${vectors.version}`);
  console.log(`Generated: ${vectors.generated}`);
  console.log(`Vectors: ${vectors.vectors.length}\n`);

  for (const vector of vectors.vectors) {
    if (vector.name === 'basic_message' || vector.name === 'empty_message' ||
        vector.name === 'unicode_message' || vector.name === 'large_message') {
      validateMessageVector(vector);
    } else if (vector.name === 'public_identity') {
      validateIdentityVector(vector);
    } else if (vector.name === 'fingerprint') {
      validateFingerprintVector(vector);
    }
  }
}

function validateMessageVector(vector) {
  const name = vector.name;

  // Decode keys
  const aliceSignPK = naclUtil.decodeBase64(vector.alice.signPK);
  const aliceSignSK = naclUtil.decodeBase64(vector.alice.signSK);
  const aliceBoxPK = naclUtil.decodeBase64(vector.alice.boxPK);
  const aliceBoxSK = naclUtil.decodeBase64(vector.alice.boxSK);
  const bobBoxPK = naclUtil.decodeBase64(vector.bob.boxPK);
  const bobBoxSK = naclUtil.decodeBase64(vector.bob.boxSK);

  // Test 1: Verify message structure
  test(`${name}: message structure`, () => {
    if (vector.message.v !== 1) throw new Error('Invalid version');
    if (vector.message.kind !== 'dmesh-msg') throw new Error('Invalid kind');
    if (!vector.message.ts) throw new Error('Missing timestamp');
    if (!vector.message.senderSignPK) throw new Error('Missing senderSignPK');
    if (!vector.message.senderBoxPK) throw new Error('Missing senderBoxPK');
    if (!vector.message.recipientBoxPK) throw new Error('Missing recipientBoxPK');
    if (!vector.message.ephPK) throw new Error('Missing ephPK');
    if (!vector.message.nonce) throw new Error('Missing nonce');
    if (!vector.message.ciphertext) throw new Error('Missing ciphertext');
    if (!vector.message.signature) throw new Error('Missing signature');
  });

  // Test 2: Decrypt message as Bob
  // NOTE: We skip timestamp check for test vectors since they have fixed old timestamps
  test(`${name}: decrypt message`, () => {
    const result = decryptMessageSkipTimestamp({
      message: vector.message,
      recipientBoxPK: bobBoxPK,
      recipientBoxSK: bobBoxSK,
      expectedSenderSignPK: aliceSignPK,
      expectedSenderBoxPK: aliceBoxPK
    });

    const expectedContent = vector.plaintext.contentLength !== undefined
      ? 'A'.repeat(vector.plaintext.contentLength)
      : vector.plaintext.content;

    if (result.content !== expectedContent) {
      throw new Error(`Content mismatch: expected "${expectedContent.slice(0, 50)}", got "${result.content.slice(0, 50)}"`);
    }
    if (result.ts !== vector.plaintext.timestamp) {
      throw new Error(`Timestamp mismatch: expected ${vector.plaintext.timestamp}, got ${result.ts}`);
    }
  });

  // Test 3: Verify signature independently
  test(`${name}: verify signature`, () => {
    const msg = vector.message;
    const senderSignPK = naclUtil.decodeBase64(msg.senderSignPK);
    const senderBoxPK = naclUtil.decodeBase64(msg.senderBoxPK);
    const recipientBoxPK = naclUtil.decodeBase64(msg.recipientBoxPK);
    const ephPK = naclUtil.decodeBase64(msg.ephPK);
    const nonce = naclUtil.decodeBase64(msg.nonce);
    const ciphertext = naclUtil.decodeBase64(msg.ciphertext);
    const signature = naclUtil.decodeBase64(msg.signature);

    const signBytes = DMesh.buildSignBytes({
      senderSignPK,
      senderBoxPK,
      recipientBoxPK,
      ephPK,
      nonce,
      ts: msg.ts,
      ciphertext
    }, naclUtil);

    const verified = nacl.sign.detached.verify(signBytes, signature, senderSignPK);
    if (!verified) throw new Error('Signature verification failed');
  });

  // Test 4: Reject decryption with wrong recipient
  test(`${name}: reject wrong recipient`, () => {
    // Try to decrypt with Alice's keys (should fail - message is for Bob)
    try {
      decryptMessageSkipTimestamp({
        message: vector.message,
        recipientBoxPK: aliceBoxPK,
        recipientBoxSK: aliceBoxSK,
        expectedSenderSignPK: null,
        expectedSenderBoxPK: null
      });
      throw new Error('Should have rejected wrong recipient');
    } catch (e) {
      if (!e.message.includes('Not intended for this recipient')) {
        throw new Error('Wrong error: ' + e.message);
      }
    }
  });

  // Test 5: Reject tampered ciphertext
  test(`${name}: reject tampered ciphertext`, () => {
    const tamperedMsg = { ...vector.message };
    const ct = naclUtil.decodeBase64(tamperedMsg.ciphertext);
    ct[0] ^= 1; // Flip one bit
    tamperedMsg.ciphertext = naclUtil.encodeBase64(ct);

    try {
      decryptMessageSkipTimestamp({
        message: tamperedMsg,
        recipientBoxPK: bobBoxPK,
        recipientBoxSK: bobBoxSK,
        expectedSenderSignPK: null,
        expectedSenderBoxPK: null
      });
      throw new Error('Should have rejected tampered ciphertext');
    } catch (e) {
      if (!e.message.includes('Invalid signature')) {
        throw new Error('Wrong error: ' + e.message);
      }
    }
  });
}

function validateIdentityVector(vector) {
  test(`${vector.name}: identity structure`, () => {
    const id = vector.identity;
    if (id.v !== 1) throw new Error('Invalid version');
    if (id.kind !== 'dmesh-id') throw new Error('Invalid kind');
    if (!id.name) throw new Error('Missing name');
    if (!id.fp) throw new Error('Missing fingerprint');
    if (!id.signPK) throw new Error('Missing signPK');
    if (!id.boxPK) throw new Error('Missing boxPK');
  });

  test(`${vector.name}: fingerprint matches`, () => {
    const signPK = naclUtil.decodeBase64(vector.keys.signPK);
    const fp = DMesh.fingerprintFromSignPK(signPK, nacl);
    const expectedFp = vector.identity.fp;
    const actualFp = naclUtil.encodeBase64(fp);

    if (actualFp !== expectedFp) {
      throw new Error(`Fingerprint mismatch: expected ${expectedFp}, got ${actualFp}`);
    }
  });
}

function validateFingerprintVector(vector) {
  test(`${vector.name}: fingerprint derivation`, () => {
    const signPK = naclUtil.decodeBase64(vector.signPK);
    const fp = DMesh.fingerprintFromSignPK(signPK, nacl);
    const actualFp = naclUtil.encodeBase64(fp);

    if (actualFp !== vector.fingerprint) {
      throw new Error(`Fingerprint mismatch: expected ${vector.fingerprint}, got ${actualFp}`);
    }
  });
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node validate-test-vectors.js <test-vectors.json>');
  process.exit(1);
}

try {
  validateTestVectors(args[0]);

  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
