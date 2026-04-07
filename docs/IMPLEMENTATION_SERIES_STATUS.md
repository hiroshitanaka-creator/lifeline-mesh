# Implementation Series Status

## Detected current phase state

- Phase 1 was **incomplete** at preflight (missing `spec/PROTOCOL_VNEXT.md`, `spec/STATE_MODEL.md`, explicit scope decision doc, and phase-specific deterministic vectors/tests).

## Active phase implemented in this task

- Implemented: **Phase 1** only.

## What was added

- Canonical signing target helper for all required envelope kinds.
- Bounded legacy unsigned compatibility policy with explicit cutoff.
- Protocol/State/Scope docs for vnext freeze.
- Deterministic conformance vector set (32 cases).
- Integration validation test for phase1 vectors and canonical sign-byte determinism.

## Explicitly deferred

- Transport abstraction boundary (`transport/`) and interop restructuring (Phase 2).
- Event log / anti-entropy replication runtime (Phase 3).
- Gateway service/backhaul bridge (Phase 4).
- Large simulation/fuzzing framework except minimal phase support.

## Acceptance evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`

## Next phase recommendation

- Proceed to **Phase 2**: introduce `transport/TransportLink` abstraction and wrap current BLE browser-central + Node peripheral paths without claiming unsupported browser peripheral/LoRa runtime.

## Unresolved risks

- Runtime still uses mixed historical signing constructions for active traffic; vnext canonical signing freeze is documented and test-backed, but rollout wiring for all live envelopes is still phased.
- `revoked` verification state is specified but not yet fully enforced in all UI/runtime pathways.
