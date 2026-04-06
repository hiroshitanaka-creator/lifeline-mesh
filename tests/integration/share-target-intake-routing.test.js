import assert from "node:assert/strict";
import {
  normalizeShareTargetText,
  parseSharedContactPayload,
  parseSharedEncryptedPayload,
  parseSharedGroupPayload,
  resolveShareTargetIntake,
  resolveStartupShareTargetIntake
} from "../../app/src/share-target-intake.js";

const encryptedPayload = {
  kind: "dmesh-msg",
  msgId: "share-target-routing-test",
  senderSignPK: "sender-sign",
  senderBoxPK: "sender-box",
  nonce: "nonce",
  ephPK: "epk",
  ciphertext: "ciphertext",
  sig: "signature",
  ts: 1700000000000,
  ttlMs: 60000
};

function testTitleWithEncryptedTextRoutesToDecrypt() {
  const jsonText = JSON.stringify(encryptedPayload);
  const resolved = resolveShareTargetIntake({
    title: "From Alice",
    text: jsonText
  });

  assert.equal(resolved.route, "decrypt");
  assert.deepEqual(resolved.encryptedPayload, encryptedPayload);
}

function testPlainTextRoutesToEncryptWithTitleAndNewline() {
  const resolved = resolveShareTargetIntake({
    title: "Shelter Update",
    text: "Bring water and batteries"
  });

  assert.equal(resolved.route, "encrypt");
  assert.equal(resolved.draftText, "Shelter Update\nBring water and batteries");
}

function testParseSharedEncryptedPayload() {
  const jsonText = JSON.stringify(encryptedPayload);
  const parsed = parseSharedEncryptedPayload(jsonText);
  assert.deepEqual(parsed, encryptedPayload);
  assert.equal(parseSharedEncryptedPayload("not-json"), null);
}

function testParseSharedContactPayload() {
  const identity = {
    kind: "dmesh-id",
    name: "Alice",
    fp: "fp",
    signPK: "sign",
    boxPK: "box"
  };
  assert.deepEqual(parseSharedContactPayload(JSON.stringify(identity)), identity);
  assert.equal(parseSharedContactPayload("{\"kind\":\"unknown\"}"), null);
}

function testParseSharedGroupPayload() {
  const onboardingPayload = {
    type: "lifeline-group-onboarding-v1",
    group: { id: "g1", senderKey: { version: 1, chainKey: "abc" } }
  };
  assert.deepEqual(parseSharedGroupPayload(JSON.stringify(onboardingPayload)), onboardingPayload);
  assert.equal(parseSharedGroupPayload("{\"type\":\"unsupported\"}"), null);
}

function testSharedFileEncryptedRoutesToDecrypt() {
  const resolved = resolveStartupShareTargetIntake({
    title: "ignored title",
    text: "ignored text",
    files: [
      {
        name: "encrypted-message.dmesh",
        type: "application/json",
        text: JSON.stringify(encryptedPayload)
      }
    ]
  });

  assert.equal(resolved.route, "decrypt");
  assert.equal(resolved.source, "file (encrypted-message.dmesh)");
  assert.deepEqual(resolved.encryptedPayload, encryptedPayload);
}

function testSharedFileGroupPayloadRoutesToGroupImport() {
  const groupPayload = {
    type: "lifeline-group-onboarding-v1",
    group: { id: "group-file", senderKey: { version: 2, chainKey: "def" } }
  };

  const resolved = resolveStartupShareTargetIntake({
    files: [
      {
        name: "group-onboarding.json",
        type: "application/json",
        text: JSON.stringify(groupPayload)
      }
    ]
  });

  assert.equal(resolved.route, "group-import");
  assert.equal(resolved.source, "file (group-onboarding.json)");
  assert.deepEqual(JSON.parse(resolved.groupPayloadText), groupPayload);
}

function testNormalizeShareTargetText() {
  assert.equal(
    normalizeShareTargetText({ title: "Alert", text: "Message" }),
    "Alert\nMessage"
  );
  assert.equal(normalizeShareTargetText({ title: "Only title", text: "" }), "Only title");
  assert.equal(normalizeShareTargetText({ title: "", text: "Only text" }), "Only text");
}

testTitleWithEncryptedTextRoutesToDecrypt();
testPlainTextRoutesToEncryptWithTitleAndNewline();
testParseSharedEncryptedPayload();
testParseSharedContactPayload();
testParseSharedGroupPayload();
testSharedFileEncryptedRoutesToDecrypt();
testSharedFileGroupPayloadRoutesToGroupImport();
testNormalizeShareTargetText();

console.log("share-target intake routing tests passed");
