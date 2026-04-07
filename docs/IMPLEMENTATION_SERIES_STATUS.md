# Implementation Series Status

## Detected current phase state

- Phase 1 is **complete**: protocol/state freeze artifacts, canonical sign-bytes definitions, bounded legacy acceptance policy, and deterministic conformance vectors with integration tests are present.
- Phase 2 was **partially implemented** at preflight: routing/runtime pieces existed, but there was no explicit `transport/` adapter boundary with contract/reference adapters and no unified A↔B↔C relay drill artifact.

## Active phase implemented in this task

- Implemented: **Phase 2** only.

## What was added

- Added `transport/` boundary with a `TransportLink` abstraction including:
  - `send()`
  - `receive()`
  - `mtuProfile()`
  - `energyClass()`
  - `linkMetrics()`
  - `capabilities()`
- Added explicit adapters:
  - `BleBrowserCentralLink` (browser-central wrapper)
  - `NodeGattPeripheralLink` (Node peripheral reference path)
  - `NativePeripheralContractLink` (contract-only mobile/native peripheral stub; explicitly not shipped runtime feature)
- Added constrained transport envelope strategy (`canonical object signed once`, compact transport representation handled independently).
- Added route advertisement jitter/suppression controller (`RouteAdvScheduler`).
- Added transport-class-specific retry/backoff policy module and wired BLE manager retry timing to class policy.
- Added interoperability/invariant integration tests for transport boundary, relay drill quality targets, retry policy, route-adv scheduler, envelope strategy, and contract-only native path.
- Added unified A↔B↔C relay drill document.

## Explicitly deferred

- Phase 3 replicated state/event log runtime (append-only event log + anti-entropy sync engine).
- Phase 4 gateway/backhaul bridge service.
- Any browser-native LoRa runtime.
- Any browser BLE peripheral runtime (still contract-only gap).

## Acceptance evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
  - Includes `tests/integration/transport-phase2.test.js` (new Phase 2 interop/transport checks).

## Next phase recommendation

- Proceed to **Phase 3**: introduce append-only event-log truth, materialized inbox/outbox views, shared ingest pipeline, and anti-entropy sync with convergence observability.

## Unresolved risks

- Browser/mobile peripheral support remains contract-only and still requires native bridge implementation.
- Node relay remains intentionally single-client in current truth; scaling semantics are deferred.
- Route advertisement scheduler exists as boundary logic; production tuning values still need field feedback.
