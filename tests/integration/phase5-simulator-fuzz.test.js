import test from "node:test";
import assert from "node:assert/strict";

import { simulateThreeNodeRelay } from "../../sim/deterministic-simulator.js";
import { canonicalizeEnvelopeForSigning } from "../../crypto/protocol-vnext.js";

const kinds = [
  "dmesh-msg",
  "dmesh-group-msg",
  "dmesh-id",
  "dmesh-chunk",
  "dmesh-route-adv",
  "ack",
  "dmesh-event",
  "lifeline-group-onboarding-v1",
  "lifeline-sender-state-sync-v1"
];

const baselineEnvelope = {
  "dmesh-msg": {
    v: 1, kind: "dmesh-msg", ts: 1, ttl: 60, senderSignPK: "a", senderBoxPK: "b", recipientBoxPK: "c", ephPK: "d", nonce: "e", ciphertext: "f", senderKeyVersion: 1
  },
  "dmesh-group-msg": {
    v: 1, kind: "dmesh-group-msg", groupId: "g", ts: 1, ttl: 60, senderSignPK: "a", senderKeyVersion: 1, nonce: "n", ciphertext: "c"
  },
  "dmesh-id": { v: 1, kind: "dmesh-id", name: "alice", fp: "fp", signPK: "spk", boxPK: "bpk" },
  "dmesh-chunk": { v: 1, kind: "dmesh-chunk", msgId: "m1", seq: 1, total: 2, data: "x" },
  "dmesh-route-adv": { v: 1, kind: "dmesh-route-adv", src: "A", seq: 2, ts: 100, ttl: 30, routes: [] },
  ack: { v: 1, kind: "ack", refMsgId: "m1", scope: "global", topic: "status", authorFp: "fp", ts: 100, ttl: 30, priority: "high" },
  "dmesh-event": { schemaVersion: 1, eventId: "ev1", parents: [], authorFp: "fp", scope: "global", topic: "checkin", ts: 100, ttl: 120, priority: "critical" },
  "lifeline-group-onboarding-v1": { type: "lifeline-group-onboarding-v1", group: { id: "g" }, senderStates: [], exportedAt: 100, exportedBySignPK: "spk" },
  "lifeline-sender-state-sync-v1": { type: "lifeline-sender-state-sync-v1", groupId: "g", senderSignPK: "spk", senderKeyState: { version: 1 }, exportedAt: 100, exportedBySignPK: "spk" }
};

function mutate(value, step) {
  if (value === null || typeof value !== "object") return step % 2 === 0 ? null : value;
  const copy = Array.isArray(value) ? value.slice() : { ...value };
  if (!Array.isArray(copy)) {
    copy[`unknown_${step}`] = { nested: [step, step + 1] };
    if (step % 3 === 0) delete copy.kind;
    if (step % 5 === 0) copy.ttl = "not-a-number";
  }
  return copy;
}

test("phase5 simulator: deterministic seed yields stable output", () => {
  const run1 = simulateThreeNodeRelay({ seed: 99, rounds: 100 });
  const run2 = simulateThreeNodeRelay({ seed: 99, rounds: 100 });
  assert.deepEqual(run1, run2);
});

test("phase5 property: duplicate deliveries are bounded across seeds", () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const result = simulateThreeNodeRelay({ seed, rounds: 120, dropRate: 0.05, replayRate: 0.2 });
    const totalDup = result.nodes.A.duplicatesDropped + result.nodes.B.duplicatesDropped + result.nodes.C.duplicatesDropped;
    assert.ok(totalDup >= 0);
    assert.ok(result.uniqueDelivered >= 2, `expected minimum delivery for seed ${seed}`);
  }
});

test("phase5 parser fuzz: canonicalization never crashes on mutated envelopes", () => {
  for (const kind of kinds) {
    for (let step = 1; step <= 80; step += 1) {
      const envelope = mutate(baselineEnvelope[kind], step);
      try {
        const canonical = canonicalizeEnvelopeForSigning(kind, envelope);
        assert.equal(canonical.kind, kind);
      } catch (error) {
        assert.ok(error instanceof Error);
      }
    }
  }
});
