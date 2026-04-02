import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as GroupMesh from "../../crypto/group.js";

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


test("integration: group sender-state resync unblocks version mismatch across two devices", () => {
  const alice = nacl.sign.keyPair();

  const group = GroupMesh.createGroup({
    name: "Resync",
    createdBy: naclUtil.encodeBase64(alice.publicKey),
    members: [naclUtil.encodeBase64(alice.publicKey)]
  }, nacl, naclUtil);

  let aliceState = GroupMesh.hydrateSenderKey(group.senderKey, naclUtil);
  let bobSenderStateRecord = {
    version: aliceState.version,
    chainKey: naclUtil.encodeBase64(aliceState.chainKey)
  };

  const m1 = GroupMesh.encryptGroupMessage({
    content: "m1",
    groupId: group.id,
    senderKey: aliceState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);
  aliceState = cloneSenderKeyState(m1.nextSenderKey);
  const d1 = GroupMesh.decryptGroupMessage({
    message: m1.message,
    senderKey: GroupMesh.resolveSenderKeyForMessage(bobSenderStateRecord, m1.message, naclUtil)
  }, nacl, naclUtil);
  bobSenderStateRecord = {
    ...GroupMesh.createSenderKeyStateMessage({
      groupId: group.id,
      senderSignPK: m1.message.senderSignPK,
      senderKey: d1.nextSenderKey
    }, naclUtil).senderKey
  };

  const m2 = GroupMesh.encryptGroupMessage({
    content: "m2",
    groupId: group.id,
    senderKey: aliceState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);
  aliceState = cloneSenderKeyState(m2.nextSenderKey);

  const m3 = GroupMesh.encryptGroupMessage({
    content: "m3",
    groupId: group.id,
    senderKey: aliceState,
    senderSignPK: alice.publicKey,
    senderSignSK: alice.secretKey
  }, nacl, naclUtil);
  aliceState = cloneSenderKeyState(m3.nextSenderKey);

  let mismatch = false;
  try {
    GroupMesh.resolveSenderKeyForMessage(bobSenderStateRecord, m3.message, naclUtil);
  } catch (error) {
    mismatch = String(error?.message || error).includes("SenderKey version mismatch");
  }
  if (!mismatch) {
    throw new Error("Expected sender key version mismatch before resync");
  }

  const resyncPayload = GroupMesh.createSenderKeyStateMessage({
    groupId: group.id,
    senderSignPK: m3.message.senderSignPK,
    senderKey: cloneSenderKeyState(m2.nextSenderKey)
  }, naclUtil);
  bobSenderStateRecord = {
    ...resyncPayload.senderKey
  };

  const decryptedAfterResync = GroupMesh.decryptGroupMessage({
    message: m3.message,
    senderKey: GroupMesh.resolveSenderKeyForMessage(bobSenderStateRecord, m3.message, naclUtil)
  }, nacl, naclUtil);

  if (decryptedAfterResync.payload.content !== "m3") {
    throw new Error("Resynced sender state failed to decrypt latest message");
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
