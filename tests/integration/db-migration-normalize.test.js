import { normalizeLegacyOutboxEntry, normalizeLegacyInboxEntry } from "../../app/src/db.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

(function run() {
  const outbox = normalizeLegacyOutboxEntry({
    msgId: "m1",
    recipient: "fp-legacy",
    message: { kind: "dmesh-msg" },
    status: "UNSENT",
    attempts: "bad"
  });

  assert(outbox !== null, "outbox should be normalized");
  assert(outbox.recipientFp === "fp-legacy", "recipient fallback should be applied");
  assert(outbox.status === "pending", "unknown status should map to pending");
  assert(outbox.attempts === 0, "non-finite attempts should default to 0");
  assert(outbox.transport === "ble", "transport should default to ble");

  const inbox = normalizeLegacyInboxEntry({
    msgId: "i1",
    message: { kind: "dmesh-msg" },
    read: 1
  });

  assert(inbox !== null, "inbox should be normalized");
  assert(inbox.senderFp === "unknown", "sender fallback should be unknown");
  assert(inbox.type === "direct", "type fallback should be direct");
  assert(inbox.read === true, "read should be boolean cast");

  assert(normalizeLegacyOutboxEntry({ msgId: "x" }) === null, "invalid outbox should return null");
  assert(normalizeLegacyInboxEntry({ msgId: "x" }) === null, "invalid inbox should return null");

  console.log("✓ integration: db migration normalization helpers");
})();
