# Scope Decision (Phase 1)

- Date: 2026-04-07
- Decision: **B. emergency coordination SNS** with signed event/state semantics.

## Why B

We can define a coherent signed event/state model now without speculative transport claims. The repository already carries signed message identities, group onboarding/sender-state envelopes, and relay metadata that can be represented as signed append-only events.

## Minimum signed event DAG fields

Every event in the coordination overlay must include:
- `eventId`
- `parents[]`
- `authorFp`
- `scope`
- `topic`
- `ts`
- `ttl`
- `priority`
- `sig`
- `schemaVersion`

## What this does NOT claim yet

- No claim that full replicated-state sync engine is implemented (Phase 3).
- No claim that gateway backhaul is implemented (Phase 4).
- No browser-native LoRa/peripheral claims.
