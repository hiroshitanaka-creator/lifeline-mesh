#!/usr/bin/env node
/**
 * Generate test vectors for Lifeline Mesh protocol
 *
 * Creates deterministic test vectors for interoperability testing
 * between different implementations.
 *
 * Usage: node generate-test-vectors.js > test-vectors.json
 */

import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import * as DMesh from "../crypto/core.js";

// Use deterministic keys for reproducible test vectors
// WARNING: These are NOT secure keys - for testing only!
function deterministicKeyPair(seed, type) {
  const seedBytes = naclUtil.decodeUTF8(seed);
  const hash = nacl.hash(seedBytes);
  const seed32 = hash.slice(0, 32);

  if (type === "sign") {
    return nacl.sign.keyPair.fromSeed(seed32);
  } else if (type === "box") {
    // For box keys, use the seed directly as secret key
    // and compute public key from it
    return nacl.box.keyPair.fromSecretKey(seed32);
  }
  throw new Error("Invalid key type");
}

// Deterministic nonce (kept for potential future use)
function _deterministicNonce(seed) {
  const seedBytes = naclUtil.decodeUTF8(seed);
  const hash = nacl.hash(seedBytes);
  return hash.slice(0, nacl.box.nonceLength);
}

// Override nacl.randomBytes for deterministic ephemeral keys
let ephemeralCounter = 0;
const originalRandomBytes = nacl.randomBytes;
function deterministicRandomBytes(n) {
  const seed = `ephemeral_${ephemeralCounter++}`;
  const seedBytes = naclUtil.decodeUTF8(seed);
  const hash = nacl.hash(seedBytes);
  return hash.slice(0, n);
}

function generateTestVectors() {
  const vectors = {
    version: 1,
    description: "Lifeline Mesh Protocol Test Vectors",
    generated: new Date().toISOString(),
    vectors: []
  };

  // Test Vector 1: Basic message encryption
  (() => {
    ephemeralCounter = 0;
    nacl.randomBytes = deterministicRandomBytes;

    const aliceSign = deterministicKeyPair("alice_sign_seed", "sign");
    const aliceBox = deterministicKeyPair("alice_box_seed", "box");
    const bobBox = deterministicKeyPair("bob_box_seed", "box");

    const timestamp = 1706012345678;
    const content = "Hello, Bob!";

    const message = DMesh.encryptMessage({
      content,
      senderSignPK: aliceSign.publicKey,
      senderSignSK: aliceSign.secretKey,
      senderBoxPK: aliceBox.publicKey,
      senderBoxSK: aliceBox.secretKey,
      recipientBoxPK: bobBox.publicKey,
      ts: timestamp
    }, nacl, naclUtil);

    nacl.randomBytes = originalRandomBytes;

    vectors.vectors.push({
      name: "basic_message",
      description: "Basic message from Alice to Bob",
      alice: {
        signPK: naclUtil.encodeBase64(aliceSign.publicKey),
        signSK: naclUtil.encodeBase64(aliceSign.secretKey),
        boxPK: naclUtil.encodeBase64(aliceBox.publicKey),
        boxSK: naclUtil.encodeBase64(aliceBox.secretKey)
      },
      bob: {
        boxPK: naclUtil.encodeBase64(bobBox.publicKey),
        boxSK: naclUtil.encodeBase64(bobBox.secretKey)
      },
      plaintext: {
        content,
        timestamp
      },
      message
    });
  })();

  // Test Vector 2: Empty message
  (() => {
    ephemeralCounter = 0;
    nacl.randomBytes = deterministicRandomBytes;

    const aliceSign = deterministicKeyPair("alice2_sign_seed", "sign");
    const aliceBox = deterministicKeyPair("alice2_box_seed", "box");
    const bobBox = deterministicKeyPair("bob2_box_seed", "box");

    const timestamp = 1706012345679;
    const content = "";

    const message = DMesh.encryptMessage({
      content,
      senderSignPK: aliceSign.publicKey,
      senderSignSK: aliceSign.secretKey,
      senderBoxPK: aliceBox.publicKey,
      senderBoxSK: aliceBox.secretKey,
      recipientBoxPK: bobBox.publicKey,
      ts: timestamp
    }, nacl, naclUtil);

    nacl.randomBytes = originalRandomBytes;

    vectors.vectors.push({
      name: "empty_message",
      description: "Empty message content",
      alice: {
        signPK: naclUtil.encodeBase64(aliceSign.publicKey),
        signSK: naclUtil.encodeBase64(aliceSign.secretKey),
        boxPK: naclUtil.encodeBase64(aliceBox.publicKey),
        boxSK: naclUtil.encodeBase64(aliceBox.secretKey)
      },
      bob: {
        boxPK: naclUtil.encodeBase64(bobBox.publicKey),
        boxSK: naclUtil.encodeBase64(bobBox.secretKey)
      },
      plaintext: {
        content,
        timestamp
      },
      message
    });
  })();

  // Test Vector 3: Unicode content
  (() => {
    ephemeralCounter = 0;
    nacl.randomBytes = deterministicRandomBytes;

    const aliceSign = deterministicKeyPair("alice3_sign_seed", "sign");
    const aliceBox = deterministicKeyPair("alice3_box_seed", "box");
    const bobBox = deterministicKeyPair("bob3_box_seed", "box");

    const timestamp = 1706012345680;
    const content = "こんにちは🌍 Hello 世界!";

    const message = DMesh.encryptMessage({
      content,
      senderSignPK: aliceSign.publicKey,
      senderSignSK: aliceSign.secretKey,
      senderBoxPK: aliceBox.publicKey,
      senderBoxSK: aliceBox.secretKey,
      recipientBoxPK: bobBox.publicKey,
      ts: timestamp
    }, nacl, naclUtil);

    nacl.randomBytes = originalRandomBytes;

    vectors.vectors.push({
      name: "unicode_message",
      description: "Message with Unicode and emoji",
      alice: {
        signPK: naclUtil.encodeBase64(aliceSign.publicKey),
        signSK: naclUtil.encodeBase64(aliceSign.secretKey),
        boxPK: naclUtil.encodeBase64(aliceBox.publicKey),
        boxSK: naclUtil.encodeBase64(aliceBox.secretKey)
      },
      bob: {
        boxPK: naclUtil.encodeBase64(bobBox.publicKey),
        boxSK: naclUtil.encodeBase64(bobBox.secretKey)
      },
      plaintext: {
        content,
        timestamp
      },
      message
    });
  })();

  // Test Vector 4: Large message (near limit)
  (() => {
    ephemeralCounter = 0;
    nacl.randomBytes = deterministicRandomBytes;

    const aliceSign = deterministicKeyPair("alice4_sign_seed", "sign");
    const aliceBox = deterministicKeyPair("alice4_box_seed", "box");
    const bobBox = deterministicKeyPair("bob4_box_seed", "box");

    const timestamp = 1706012345681;
    // Generate ~1KB of content (well under 150KB limit for test speed)
    const content = "A".repeat(1024);

    const message = DMesh.encryptMessage({
      content,
      senderSignPK: aliceSign.publicKey,
      senderSignSK: aliceSign.secretKey,
      senderBoxPK: aliceBox.publicKey,
      senderBoxSK: aliceBox.secretKey,
      recipientBoxPK: bobBox.publicKey,
      ts: timestamp
    }, nacl, naclUtil);

    nacl.randomBytes = originalRandomBytes;

    vectors.vectors.push({
      name: "large_message",
      description: "Large message (1KB content)",
      alice: {
        signPK: naclUtil.encodeBase64(aliceSign.publicKey),
        signSK: naclUtil.encodeBase64(aliceSign.secretKey),
        boxPK: naclUtil.encodeBase64(aliceBox.publicKey),
        boxSK: naclUtil.encodeBase64(aliceBox.secretKey)
      },
      bob: {
        boxPK: naclUtil.encodeBase64(bobBox.publicKey),
        boxSK: naclUtil.encodeBase64(bobBox.secretKey)
      },
      plaintext: {
        content: `${content.slice(0, 50)}... (${content.length} chars)`,
        contentLength: content.length,
        timestamp
      },
      message
    });
  })();

  // Test Vector 5: Public identity
  (() => {
    const aliceSign = deterministicKeyPair("alice_id_sign_seed", "sign");
    const aliceBox = deterministicKeyPair("alice_id_box_seed", "box");

    const identity = DMesh.createPublicIdentity({
      name: "Alice",
      signPK: aliceSign.publicKey,
      boxPK: aliceBox.publicKey
    }, nacl, naclUtil);

    vectors.vectors.push({
      name: "public_identity",
      description: "Alice's public identity",
      keys: {
        signPK: naclUtil.encodeBase64(aliceSign.publicKey),
        boxPK: naclUtil.encodeBase64(aliceBox.publicKey)
      },
      identity
    });
  })();

  // Test Vector 6: Fingerprint derivation
  (() => {
    const aliceSign = deterministicKeyPair("alice_fp_sign_seed", "sign");
    const fp = DMesh.fingerprintFromSignPK(aliceSign.publicKey, nacl);

    vectors.vectors.push({
      name: "fingerprint",
      description: "Fingerprint derivation from signing public key",
      signPK: naclUtil.encodeBase64(aliceSign.publicKey),
      fingerprint: naclUtil.encodeBase64(fp)
    });
  })();

  return vectors;
}

// Generate and output test vectors
const vectors = generateTestVectors();
console.log(JSON.stringify(vectors, null, 2));
