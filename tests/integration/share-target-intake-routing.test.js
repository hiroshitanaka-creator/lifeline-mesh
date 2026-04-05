import assert from "node:assert/strict";
import {
  normalizeShareTargetText,
  parseSharedEncryptedPayload,
  resolveShareTargetIntake
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
testNormalizeShareTargetText();

console.log("share-target intake routing tests passed");
