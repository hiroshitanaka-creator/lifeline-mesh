# PROTOCOL_VNEXT (Phase 1)

This document freezes canonical signing targets for currently shipped envelope families.

## Canonical sign target format

For each signed envelope, the sign target is UTF-8 JSON of:

```json
{
  "domain": "DMESH_SIGN_TARGET_VNEXT:<kind>:v1",
  "schemaVersion": 1,
  "kind": "<envelope-kind>",
  "payload": { "...": "canonicalized object with sorted keys" }
}
```

## Envelope kinds covered

- `dmesh-msg`
- `dmesh-group-msg`
- `dmesh-id`
- `dmesh-chunk`
- `dmesh-route-adv`
- `ack`
- `lifeline-group-onboarding-v1`
- `lifeline-sender-state-sync-v1`

Canonicalization implementation reference: `crypto/protocol-vnext.js`.

## Canonical ID derivation

- `msgId = base64(sha512(canonicalSignBytes).slice(0,32))`
- `eventId = base64(sha512(canonicalSignBytes).slice(0,32))`

## Legacy compatibility bound

Legacy unsigned acceptance is time-bounded by cutoff `2026-12-31T23:59:59Z` and is not indefinite.

## Deterministic conformance vectors

Vectors are in `spec/conformance/vnext-phase1-vectors.json` and validated by `tests/integration/protocol-vnext-phase1.test.js`.
