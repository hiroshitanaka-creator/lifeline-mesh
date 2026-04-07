# STATE_MODEL (Phase 1 Freeze + Phase 3 Runtime)

## Verification state machine

States:
- `unverified` (default / TOFU)
- `verified` (safety-number or equivalent OOB confirmation)
- `compromised` (active suspicion; block trust-sensitive actions)
- `revoked` (cryptographic identity retired; must rotate)

Transitions:
- `unverified -> verified`: explicit operator/user verification.
- `verified -> compromised`: compromise signal, key mismatch, or incident declaration.
- `compromised -> revoked`: contact or admin revokes identity and rotates keys.
- `verified -> revoked`: planned key rotation / retirement.
- `revoked -> unverified`: only through new identity introduction (new fingerprint).

## Signed event/state primitives

- membership = signed admin op + epoch rotation
- shelter_status = LWW register
- supplies = OR-Set (observed-remove set)
- checkin / post / ack = append-only event

## Event identity and ordering

- `eventId = base64(sha512(canonicalSignBytes(event)).slice(0,32))`
- `msgId = base64(sha512(canonicalSignBytes(message)).slice(0,32))`
- causal edges are expressed by `parents[]`
- causal clock uses Lamport metadata (`lamport`) on each event

## Event-log and sync runtime truth (Phase 3)

- Source of truth is append-only `eventLog`; inbox/outbox remain materialized operational views.
- Anti-entropy exchange contract:
  1. peer inventory summary (`count`, deterministic digest, sorted `eventIds[]`)
  2. have/want diff
  3. missing-event pull + idempotent ingest
  4. TTL-aware pruning
- Convergence requirement: partitioned 3-node replica set must converge to the same state hash after heal.

## Legacy unsigned acceptance policy (bounded)

Unsigned legacy identity + onboarding compatibility is allowed only through **2026-12-31T23:59:59Z**. After this cutoff:
- unsigned identity payloads are rejected
- unsigned onboarding/sender-state imports are rejected
- operators must use signed envelopes

Removal target: schemaVersion 2 rollout.
