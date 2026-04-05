import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as GroupMesh from "../../crypto/group.js";
import * as DMesh from "../../crypto/core.js";
import { shouldAcceptIncomingSenderState, filterSenderStateEntriesByMembers } from "../../app/src/group-sender-state.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function cloneSenderKeyState(senderKeyState) {
  return GroupMesh.hydrateSenderKey({
    version: senderKeyState.version,
    chainKey: naclUtil.encodeBase64(senderKeyState.chainKey)
  }, naclUtil);
}

test("integration: group create -> encrypt -> decrypt shared sender key state", () => {
  const alice = nacl.sign.keyPair();
  const bob = nacl.sign.keyPair();

  const group = GroupMesh.createGroup({
    name: "Medical Team",
    createdBy: naclUtil.encodeBase64(alice.publicKey),
    members: [naclUtil.encodeBase64(alice.publicKey), naclUtil.encodeBase64(bob.publicKey)]
  }, nacl, naclUtil);

  const senderState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);
  const receiverState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);

  const encrypted = GroupMesh.encryptGroupMessage({
    content: "Triaged zone A. Need water.",
    groupId: group.id,
    senderKey: senderState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);

  const decrypted = GroupMesh.decryptGroupMessage({
    message: encrypted.message,
    senderKey: receiverState,
    expectedSenderSignPK: alice.publicKey
  }, nacl, naclUtil);

  if (decrypted.payload.content !== "Triaged zone A. Need water.") {
    throw new Error("Group plaintext mismatch");
  }

  if (encrypted.nextSenderKey.version !== senderState.version + 1) {
    throw new Error("Sender key did not ratchet forward after encryption");
  }

  if (decrypted.nextSenderKey.version !== receiverState.version + 1) {
    throw new Error("Receiver key did not ratchet forward after decryption");
  }
});

test("integration: group sender key ratchet stays in sync across multiple messages", () => {
  const alice = nacl.sign.keyPair();
  const group = GroupMesh.createGroup({
    name: "Ops",
    createdBy: naclUtil.encodeBase64(alice.publicKey),
    members: [naclUtil.encodeBase64(alice.publicKey)]
  }, nacl, naclUtil);

  let senderState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);
  let receiverState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);

  const contents = [
    "phase-1 evac stable",
    "phase-2 route blocked",
    "phase-3 reroute complete"
  ];

  for (const content of contents) {
    const encrypted = GroupMesh.encryptGroupMessage({
      content,
      groupId: group.id,
      senderKey: senderState,
      senderSignPK: alice.publicKey,
      senderSignSK: alice.secretKey
    }, nacl, naclUtil);

    const decrypted = GroupMesh.decryptGroupMessage({
      message: encrypted.message,
      senderKey: receiverState,
      expectedSenderSignPK: alice.publicKey
    }, nacl, naclUtil);

    if (decrypted.payload.content !== content) {
      throw new Error(`Ratchet content mismatch for ${content}`);
    }

    senderState = cloneSenderKeyState(encrypted.nextSenderKey);
    receiverState = cloneSenderKeyState(decrypted.nextSenderKey);
  }

  if (senderState.version !== receiverState.version) {
    throw new Error("Sender/receiver sender key versions diverged");
  }
});

test("integration: group decrypt rejects wrong sender key state", () => {
  const alice = nacl.sign.keyPair();
  const group = GroupMesh.createGroup({
    name: "Logistics",
    createdBy: naclUtil.encodeBase64(alice.publicKey),
    members: [naclUtil.encodeBase64(alice.publicKey)]
  }, nacl, naclUtil);

  const senderState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);
  const encrypted = GroupMesh.encryptGroupMessage({
    content: "warehouse-4 supply",
    groupId: group.id,
    senderKey: senderState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);

  const staleReceiverState = cloneSenderKeyState(encrypted.nextSenderKey);

  let threw = false;
  try {
    GroupMesh.decryptGroupMessage({
      message: encrypted.message,
      senderKey: staleReceiverState,
      expectedSenderSignPK: alice.publicKey
    }, nacl, naclUtil);
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error("Expected decryption failure for wrong sender key state");
  }
});

test("integration: sender-state resync payload enables mismatch recovery", () => {
  const alice = nacl.sign.keyPair();
  const bob = nacl.sign.keyPair();
  const group = GroupMesh.createGroup({
    name: "Resync-Team",
    createdBy: naclUtil.encodeBase64(alice.publicKey),
    members: [naclUtil.encodeBase64(alice.publicKey), naclUtil.encodeBase64(bob.publicKey)]
  }, nacl, naclUtil);

  let aliceSenderState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);
  let bobViewOfAliceState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);

  const firstEncrypted = GroupMesh.encryptGroupMessage({
    content: "phase-1",
    groupId: group.id,
    senderKey: aliceSenderState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);
  aliceSenderState = cloneSenderKeyState(firstEncrypted.nextSenderKey);
  const firstDecrypted = GroupMesh.decryptGroupMessage({
    message: firstEncrypted.message,
    senderKey: bobViewOfAliceState,
    expectedSenderSignPK: alice.publicKey
  }, nacl, naclUtil);
  bobViewOfAliceState = cloneSenderKeyState(firstDecrypted.nextSenderKey);

  const secondEncrypted = GroupMesh.encryptGroupMessage({
    content: "phase-2",
    groupId: group.id,
    senderKey: aliceSenderState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);
  const secondMessageSenderState = cloneSenderKeyState(aliceSenderState);
  aliceSenderState = cloneSenderKeyState(secondEncrypted.nextSenderKey);

  // Bob gets stale/mismatched state (simulates drift across devices).
  bobViewOfAliceState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);

  let mismatchThrown = false;
  try {
    GroupMesh.decryptGroupMessage({
      message: secondEncrypted.message,
      senderKey: bobViewOfAliceState,
      expectedSenderSignPK: alice.publicKey
    }, nacl, naclUtil);
  } catch {
    mismatchThrown = true;
  }

  if (!mismatchThrown) {
    throw new Error("Expected mismatch with stale sender state");
  }

  // Resync payload shares sender state for the senderSignPK from Alice device.
  const resyncedSenderState = cloneSenderKeyState({
    version: secondEncrypted.message.senderKeyVersion,
    chainKey: secondMessageSenderState.chainKey
  });

  const recovered = GroupMesh.decryptGroupMessage({
    message: secondEncrypted.message,
    senderKey: resyncedSenderState,
    expectedSenderSignPK: alice.publicKey
  }, nacl, naclUtil);

  if (recovered.payload.content !== "phase-2") {
    throw new Error("Resync recovery failed to decrypt expected content");
  }
});

test("integration: stale sender-state import does not downgrade newer state", () => {
  const existing = {
    version: 5,
    chainKey: "newer-chain",
    prevVersion: 4,
    prevChainKey: "prev-chain"
  };
  const incomingStale = {
    version: 3,
    chainKey: "stale-chain"
  };

  if (shouldAcceptIncomingSenderState(existing, incomingStale)) {
    throw new Error("Stale sender-state should not be accepted");
  }
});

test("integration: same-version import preserves richer recovery metadata", () => {
  const existingRicher = {
    version: 7,
    chainKey: "same-version-chain",
    prevVersion: 6,
    prevChainKey: "rich-prev"
  };
  const incomingPoor = {
    version: 7,
    chainKey: "same-version-chain"
  };

  if (shouldAcceptIncomingSenderState(existingRicher, incomingPoor)) {
    throw new Error("Same-version import should not overwrite richer recovery metadata");
  }
});

test("integration: removed member sender state is not exported in onboarding payload filter", () => {
  const alice = nacl.sign.keyPair();
  const bob = nacl.sign.keyPair();
  const removed = nacl.sign.keyPair();

  const resolveMemberFp = (senderSignPK) => {
    try {
      const senderSignPKu8 = naclUtil.decodeBase64(senderSignPK);
      return naclUtil.encodeBase64(DMesh.fingerprintFromSignPK(senderSignPKu8, nacl));
    } catch {
      return null;
    }
  };

  const aliceFp = resolveMemberFp(naclUtil.encodeBase64(alice.publicKey));
  const bobFp = resolveMemberFp(naclUtil.encodeBase64(bob.publicKey));
  const removedFp = resolveMemberFp(naclUtil.encodeBase64(removed.publicKey));

  const currentMembers = [aliceFp, bobFp];
  const senderStateEntries = [
    {
      senderSignPK: naclUtil.encodeBase64(alice.publicKey),
      senderKeyState: { version: 10, chainKey: "alice-chain" }
    },
    {
      senderSignPK: naclUtil.encodeBase64(bob.publicKey),
      senderKeyState: { version: 11, chainKey: "bob-chain" }
    },
    {
      senderSignPK: naclUtil.encodeBase64(removed.publicKey),
      senderKeyState: { version: 12, chainKey: "removed-chain" }
    }
  ];

  const filtered = filterSenderStateEntriesByMembers(senderStateEntries, currentMembers, resolveMemberFp);
  if (filtered.length !== 2) {
    throw new Error("Expected removed member sender state to be excluded from export filter");
  }
  const filteredFps = filtered.map((entry) => resolveMemberFp(entry.senderSignPK));
  if (filteredFps.includes(removedFp)) {
    throw new Error("Removed member sender state leaked into onboarding export");
  }
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed += 1;
  }
}

console.log("\n" + "=".repeat(50));
console.log(`Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
