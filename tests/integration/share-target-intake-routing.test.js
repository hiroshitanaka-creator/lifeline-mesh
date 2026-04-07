import assert from "node:assert/strict";
import {
  normalizeShareTargetText,
  parseSharedContactPayload,
  parseSharedEncryptedPayload,
  parseSharedGroupPayload,
  resolveShareTargetFileIntake,
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
  const signedIdentity = {
    kind: "dmesh-id",
    name: "Alice",
    fp: "fp",
    signPK: "sign",
    boxPK: "box",
    sig: "signed"
  };
  const legacyIdentity = {
    kind: "dmesh-id",
    name: "Alice",
    signPK: "sign",
    boxPK: "box"
  };
  const senderOnlyIdentity = {
    name: "Alice sender-only",
    signPK: "sign-only",
    boxPK: "box-only"
  };

  assert.deepEqual(parseSharedContactPayload(JSON.stringify(signedIdentity)), signedIdentity);
  assert.deepEqual(parseSharedContactPayload(JSON.stringify(legacyIdentity)), legacyIdentity);
  assert.deepEqual(parseSharedContactPayload(JSON.stringify(senderOnlyIdentity)), senderOnlyIdentity);
  assert.equal(parseSharedContactPayload("{\"kind\":\"unknown\"}"), null);
  assert.equal(parseSharedContactPayload("{\"name\":\"missing keys\"}"), null);
}

function testSharedTextSenderOnlyContactRoutesToContactImport() {
  const senderOnlyIdentity = {
    name: "Sender Only",
    signPK: "sender-sign",
    boxPK: "sender-box"
  };

  const resolved = resolveShareTargetIntake({
    text: JSON.stringify(senderOnlyIdentity)
  });

  assert.equal(resolved.route, "contact-import");
  assert.equal(resolved.source, "text");
  assert.deepEqual(JSON.parse(resolved.contactPayloadText), senderOnlyIdentity);
}

function testSharedFileSenderOnlyContactRoutesToContactImport() {
  const senderOnlyIdentity = {
    name: "Sender Only File",
    signPK: "sender-sign-file",
    boxPK: "sender-box-file"
  };

  const resolved = resolveShareTargetFileIntake({
    files: [
      {
        name: "sender-only-contact.json",
        type: "application/json",
        text: JSON.stringify(senderOnlyIdentity)
      }
    ]
  });

  assert.equal(resolved.route, "contact-import");
  assert.equal(resolved.source, "file (sender-only-contact.json)");
  assert.deepEqual(JSON.parse(resolved.contactPayloadText), senderOnlyIdentity);
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
testSharedTextSenderOnlyContactRoutesToContactImport();
testSharedFileSenderOnlyContactRoutesToContactImport();
testParseSharedGroupPayload();
testSharedFileEncryptedRoutesToDecrypt();
testSharedFileGroupPayloadRoutesToGroupImport();
testNormalizeShareTargetText();

console.log("share-target intake routing tests passed");
