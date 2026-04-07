# Implementation Series Status

## Detected current phase state

- Phase 1 was **partially implemented** at preflight: docs existed, but deterministic vectors were too shallow and canonical sign-bytes were not explicit enough at per-envelope field level.

## Active phase implemented in this task

- Implemented: **Phase 1** only.

## What was added

- Explicit per-envelope canonical signable-field map in code and protocol docs.
- Canonical event envelope domain (`dmesh-event`) for eventId derivation.
- Upgraded deterministic conformance vectors to concrete fixtures with expected sign-bytes and derived IDs.
- Stronger integration validation asserting exact sign-bytes/ID determinism and deterministic reject predicates for required failure classes.

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

- Runtime still uses mixed historical signing constructions for active traffic; vnext canonical signing freeze is now explicit and test-backed, but full runtime migration is still phased.
- `revoked` verification state is specified but not yet fully enforced in all UI/runtime pathways.
