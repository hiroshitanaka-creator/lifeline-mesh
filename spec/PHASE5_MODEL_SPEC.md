# PHASE5_MODEL_SPEC

## Purpose

This model spec defines the minimal deterministic model used for Phase 5 verification work.
It is intentionally scoped to currently shipped behavior (single-client relay truth, Phase 2 transport abstraction, Phase 4 gateway dedupe semantics).

## Model entities

- Nodes: `A`, `B`, `C`
- Message key: `msgId`
- Transport effects:
  - `drop`
  - `deliver`
  - `replay`

## Invariants under test

1. **Determinism**: same seed and parameters produce identical simulation output.
2. **Duplicate suppression**: once a node has observed `msgId`, replay attempts are counted and dropped.
3. **Bounded progress**: with bounded loss/replay rates, at least two unique messages are delivered per drill run.
4. **Parser safety**: canonical envelope building may reject malformed input but must not crash the runtime process.

## State-machine outline

- `queued -> delivered`
- `queued -> dropped`
- `delivered -> replayed -> duplicate_dropped`

There is no transition that permits `duplicate_dropped -> delivered` for the same `(node, msgId)` pair.

## Scope limits

- This is a verification model for test assurance, not production routing logic.
- It does not assert browser-native LoRa, browser BLE peripheral mode, or multi-client relay behavior.
