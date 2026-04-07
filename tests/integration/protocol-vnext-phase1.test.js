import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CANONICAL_ENVELOPE_KINDS,
  buildCanonicalSignBytes,
  deriveMsgIdFromCanonical,
  legacyUnsignedPolicy
} from "../../crypto/protocol-vnext.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorsPath = path.join(__dirname, "../../spec/conformance/vnext-phase1-vectors.json");
const vectors = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const requiredClasses = new Set([
  "valid normal case",
  "tampered name",
  "recipient substitution",
  "stale TTL",
  "senderKeyVersion mismatch",
  "malformed chunk",
  "replay duplicate"
]);

test("phase1 vectors: minimum count and required classes", () => {
  if (!Array.isArray(vectors.cases) || vectors.cases.length < 30) {
    throw new Error(`Expected >=30 cases, got ${vectors.cases?.length ?? 0}`);
  }
  const classes = new Set(vectors.cases.map((entry) => entry.class));
  for (const className of requiredClasses) {
    if (!classes.has(className)) throw new Error(`Missing required class: ${className}`);
  }
});

test("canonical signing kinds include all phase1 envelope targets", () => {
  const requiredKinds = [
    "dmesh-msg",
    "dmesh-group-msg",
    "dmesh-id",
    "dmesh-chunk",
    "dmesh-route-adv",
    "ack",
    "lifeline-group-onboarding-v1",
    "lifeline-sender-state-sync-v1"
  ];
  for (const kind of requiredKinds) {
    if (!CANONICAL_ENVELOPE_KINDS.includes(kind)) {
      throw new Error(`Missing canonical envelope kind: ${kind}`);
    }
  }
});

test("canonical sign bytes are deterministic with sorted key order", () => {
  const a = buildCanonicalSignBytes("ack", { ttl: 1000, ts: 10, refMsgId: "m1", priority: "high" });
  const b = buildCanonicalSignBytes("ack", { priority: "high", refMsgId: "m1", ts: 10, ttl: 1000 });
  if (Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) {
    throw new Error("Canonical sign bytes differ for key-order equivalent payload");
  }
});

test("msgId derivation is deterministic and mutation-sensitive", () => {
  const base = {
    v: 1,
    kind: "dmesh-msg",
    senderSignPK: "S",
    senderBoxPK: "B",
    recipientBoxPK: "R",
    ts: 1700000000000,
    ttl: 60000,
    ciphertext: "C"
  };
  const original = deriveMsgIdFromCanonical("dmesh-msg", base);
  const same = deriveMsgIdFromCanonical("dmesh-msg", { ...base });
  const mutated = deriveMsgIdFromCanonical("dmesh-msg", { ...base, recipientBoxPK: "R2" });
  if (original !== same) throw new Error("Deterministic derivation failed");
  if (original === mutated) throw new Error("Mutation should change msgId");
});

test("legacy unsigned compatibility is bounded by explicit cutoff", () => {
  const before = legacyUnsignedPolicy(Date.parse("2026-06-01T00:00:00.000Z"));
  const after = legacyUnsignedPolicy(Date.parse("2027-01-01T00:00:00.000Z"));
  if (!before.acceptsLegacyUnsignedIdentity || !before.acceptsLegacyUnsignedOnboarding) {
    throw new Error("Expected legacy unsigned acceptance before cutoff");
  }
  if (after.acceptsLegacyUnsignedIdentity || after.acceptsLegacyUnsignedOnboarding) {
    throw new Error("Expected legacy unsigned acceptance to expire after cutoff");
  }
});

