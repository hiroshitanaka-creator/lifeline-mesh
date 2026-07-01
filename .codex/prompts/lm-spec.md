Map a lifeline-mesh task to the spec/docs you must read before implementing. Behavior and
spec must not drift.

Topic → read first:
- crypto / signatures / keys → `spec/PROTOCOL.md`, `spec/THREAT_MODEL.md`, `/crypto/`
- canonical signing / envelope kinds / msgId → `spec/PROTOCOL_VNEXT.md`, `crypto/protocol-vnext.js`
- verification state / event ordering / sync convergence → `spec/STATE_MODEL.md`
- relay / gateway / simulator dedup & parser safety → `spec/PHASE5_MODEL_SPEC.md`,
  `docs/GATEWAY_BRIDGE_PHASE4.md`, `docs/NODE_RELAY_APPLIANCE_PATH.md`
- BLE capability limits → `docs/BLE_SUPPORT_MATRIX.md`,
  `docs/BLE_PERIPHERAL_CAPABILITY_MATRIX.md`, `docs/ADR_BLE_PERIPHERAL_PATH.md`
- contribution + crypto coding rules → `CONTRIBUTING.md`
- AI operating rules / review checklist → `AGENTS.md`, `docs/ai/OPERATIONS.md`, `docs/ai/AUDIT_RULES.md`

Normative anchors to respect:
- Primitives locked: Ed25519 + X25519-XSalsa20-Poly1305 (TweetNaCl); change ⇒ major version.
- Domain separator `DMESH_MSG_V1`; fixed field byte-lengths; deterministic SignBytes order.
- Canonical sign-target = sorted-key UTF-8 JSON; `msgId = base64(sha512(canonical).slice(0,32))`.
- Replay window 30 days; TTL/expiration; unknown `kind` ignored safely.
- Verification state machine (revoked ⇏ verified without new key material).
- Legacy-unsigned acceptance ends `2026-12-31T23:59:59Z`.

Output: spec files read, invariants constraining the task, any version-bump / backward-compat
requirement the change would trigger.
