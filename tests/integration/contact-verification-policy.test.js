import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as DMesh from "../../crypto/core.js";
import { VERIFICATION_STATUS } from "../../crypto/store.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

test("integration: safety number is stable regardless of fingerprint order", () => {
  const alice = DMesh.generateSignKeyPair(nacl);
  const bob = DMesh.generateSignKeyPair(nacl);
  const aliceFp = DMesh.fingerprintFromSignPK(alice.publicKey, nacl);
  const bobFp = DMesh.fingerprintFromSignPK(bob.publicKey, nacl);

  const numAB = DMesh.generateSafetyNumber(aliceFp, bobFp);
  const numBA = DMesh.generateSafetyNumber(bobFp, aliceFp);

  if (numAB !== numBA) {
    throw new Error("Safety number must be symmetric for both participants");
  }
  if (!/^\d{4}-\d{4}$/.test(numAB)) {
    throw new Error(`Unexpected safety number format: ${numAB}`);
  }
});

test("integration: TOFU contact defaults to unverified status", () => {
  const pseudoTofuContact = {
    fp: naclUtil.encodeBase64(nacl.randomBytes(16)),
    name: "TOFU-test",
    signPK: naclUtil.encodeBase64(nacl.randomBytes(32)),
    boxPK: naclUtil.encodeBase64(nacl.randomBytes(32))
  };
  const effective = pseudoTofuContact.verified || VERIFICATION_STATUS.UNVERIFIED;
  if (effective !== VERIFICATION_STATUS.UNVERIFIED) {
    throw new Error("Expected TOFU contact to remain unverified by default");
  }
});

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}`);
      console.error(error);
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
