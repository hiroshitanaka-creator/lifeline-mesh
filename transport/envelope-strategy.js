/**
 * Canonical-object / transport-representation split for constrained links.
 *
 * Signed canonical objects are never modified here. Adapters may encode a
 * compact transport representation for MTU-constrained transports.
 */

const SHORT_KEYS = {
  kind: "k",
  msgId: "i",
  ts: "t",
  ttl: "l",
  sender: "s",
  recipient: "r",
  ciphertext: "c",
  relay: "y",
  payload: "p"
};

const REVERSE_KEYS = Object.fromEntries(
  Object.entries(SHORT_KEYS).map(([key, shortKey]) => [shortKey, key])
);

export function encodeTransportEnvelope(canonicalEnvelope, options = {}) {
  const { compact = false } = options;
  if (!compact) {
    return { mode: "canonical", payload: canonicalEnvelope };
  }

  const payload = {};
  for (const [key, value] of Object.entries(canonicalEnvelope ?? {})) {
    payload[SHORT_KEYS[key] ?? key] = value;
  }

  return {
    mode: "compact-v1",
    payload
  };
}

export function decodeTransportEnvelope(transportEnvelope) {
  if (!transportEnvelope || typeof transportEnvelope !== "object") {
    return null;
  }

  if (transportEnvelope.mode === "canonical") {
    return transportEnvelope.payload ?? null;
  }

  if (transportEnvelope.mode !== "compact-v1") {
    return null;
  }

  const canonical = {};
  for (const [key, value] of Object.entries(transportEnvelope.payload ?? {})) {
    canonical[REVERSE_KEYS[key] ?? key] = value;
  }

  return canonical;
}
