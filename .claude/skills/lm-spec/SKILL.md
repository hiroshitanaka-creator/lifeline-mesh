---
name: lm-spec
description: Map a lifeline-mesh task to the specification and docs you must read before implementing. Use at the start of any crypto, protocol, signing, BLE, transport, gateway, relay, storage, or state/sync change to find the authoritative spec, normative invariants, and version rules for that area.
---

# lm-spec — route a task to the right spec

Before implementing, load the authoritative spec for the area you are touching. Behavior and
spec must not drift (`AGENTS.md` §5).

## Topic → read this first
| Topic | Read |
|---|---|
| crypto / signatures / keys | `spec/PROTOCOL.md`, `spec/THREAT_MODEL.md`, `/crypto/` |
| canonical signing / envelope kinds / msgId | `spec/PROTOCOL_VNEXT.md`, `crypto/protocol-vnext.js` |
| verification state / event ordering / sync convergence | `spec/STATE_MODEL.md` |
| relay / gateway / simulator dedup & parser safety | `spec/PHASE5_MODEL_SPEC.md`, `docs/GATEWAY_BRIDGE_PHASE4.md`, `docs/NODE_RELAY_APPLIANCE_PATH.md` |
| BLE capability limits | `docs/BLE_SUPPORT_MATRIX.md`, `docs/BLE_PERIPHERAL_CAPABILITY_MATRIX.md`, `docs/ADR_BLE_PERIPHERAL_PATH.md` |
| contribution + crypto coding rules | `CONTRIBUTING.md` |
| AI operating rules / review checklist | `AGENTS.md`, `docs/ai/OPERATIONS.md`, `docs/ai/AUDIT_RULES.md` |

## Normative anchors to respect
- Primitives locked: Ed25519 + X25519-XSalsa20-Poly1305 (TweetNaCl); change ⇒ major version.
- Domain separator `DMESH_MSG_V1`; fixed field byte-lengths; deterministic SignBytes order.
- Canonical sign-target = sorted-key UTF-8 JSON; `msgId = base64(sha512(canonical).slice(0,32))`.
- Replay window 30 days; TTL/expiration semantics; unknown `kind` ignored safely.
- Verification state machine (revoked ⇏ verified without new key material).
- Legacy-unsigned acceptance ends at `2026-12-31T23:59:59Z`.

## Output
Name the spec files read, the normative invariants that constrain this task, and any version
bump / backward-compat requirement the change would trigger.
