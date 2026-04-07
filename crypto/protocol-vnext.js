import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

export const CANONICAL_ENVELOPE_KINDS = [
  "dmesh-msg",
  "dmesh-group-msg",
  "dmesh-id",
  "dmesh-chunk",
  "dmesh-route-adv",
  "ack",
  "lifeline-group-onboarding-v1",
  "lifeline-sender-state-sync-v1"
];

const SIGNING_DOMAINS = {
  "dmesh-msg": "DMESH_SIGN_TARGET_VNEXT:dmesh-msg:v1",
  "dmesh-group-msg": "DMESH_SIGN_TARGET_VNEXT:dmesh-group-msg:v1",
  "dmesh-id": "DMESH_SIGN_TARGET_VNEXT:dmesh-id:v1",
  "dmesh-chunk": "DMESH_SIGN_TARGET_VNEXT:dmesh-chunk:v1",
  "dmesh-route-adv": "DMESH_SIGN_TARGET_VNEXT:dmesh-route-adv:v1",
  ack: "DMESH_SIGN_TARGET_VNEXT:ack:v1",
  "lifeline-group-onboarding-v1": "DMESH_SIGN_TARGET_VNEXT:group-onboarding:v1",
  "lifeline-sender-state-sync-v1": "DMESH_SIGN_TARGET_VNEXT:sender-state:v1"
};

function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeValue(entry));
  if (!value || typeof value !== "object") return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalizeValue(value[key]);
  }
  return sorted;
}

export function canonicalizeEnvelopeForSigning(kind, envelope) {
  if (!CANONICAL_ENVELOPE_KINDS.includes(kind)) {
    throw new Error(`Unsupported envelope kind for canonical signing: ${String(kind)}`);
  }
  if (!envelope || typeof envelope !== "object") {
    throw new Error("Envelope must be an object");
  }

  const canonical = canonicalizeValue(envelope);
  const domain = SIGNING_DOMAINS[kind];
  return { domain, schemaVersion: 1, kind, payload: canonical };
}

export function buildCanonicalSignBytes(kind, envelope, util = naclUtil) {
  const canonicalTarget = canonicalizeEnvelopeForSigning(kind, envelope);
  return util.decodeUTF8(JSON.stringify(canonicalTarget));
}

export function deriveMsgIdFromCanonical(kind, envelope, util = naclUtil, naclImpl = nacl) {
  const signBytes = buildCanonicalSignBytes(kind, envelope, util);
  const digest = naclImpl.hash(signBytes);
  return util.encodeBase64(digest.slice(0, 32));
}

export function deriveEventIdFromCanonical(eventEnvelope, util = naclUtil, naclImpl = nacl) {
  const withSchema = {
    schemaVersion: eventEnvelope?.schemaVersion ?? 1,
    ...eventEnvelope
  };
  const signBytes = buildCanonicalSignBytes("ack", withSchema, util);
  const digest = naclImpl.hash(signBytes);
  return util.encodeBase64(digest.slice(0, 32));
}

export function legacyUnsignedPolicy(nowMs = Date.now()) {
  const cutoffIso = "2026-12-31T23:59:59.000Z";
  const cutoffMs = Date.parse(cutoffIso);
  return {
    cutoffIso,
    cutoffMs,
    acceptsLegacyUnsignedIdentity: nowMs <= cutoffMs,
    acceptsLegacyUnsignedOnboarding: nowMs <= cutoffMs,
    removalPlan: "remove in protocol schemaVersion 2 rollout"
  };
}
