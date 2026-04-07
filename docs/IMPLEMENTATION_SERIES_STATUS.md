# Implementation Series Status

## Detected current phase state

- Phase 1 is **complete** (`spec/PROTOCOL_VNEXT.md`, `spec/STATE_MODEL.md`, scope decision, conformance vectors/tests).
- Phase 2 is **complete** (`transport/` boundary, BLE central adapter wrapping, Node peripheral reference path, retry/jitter policy, relay drill docs/tests).
- Phase 3 is **complete** (event-log runtime + anti-entropy sync engine + convergence tests).
- Phase 4 is **complete** (`gateway/` bridge service + duplicate/loop-safe island sync tests).
- Phase 5 was **incomplete** at preflight: no `sim/` deterministic simulator, no parser-fuzz/property suite tied to active invariants, no formalized hardware smoke/energy metrics artifacts.

## Active phase implemented in this task

- Implemented: **Phase 5** only (verification support subset tied to shipped behavior).

## What was added

- Deterministic simulator under `sim/`:
  - `sim/deterministic-simulator.js` seeded 3-node relay model with drop/replay behavior and duplicate suppression counters.
- Phase 5 verification tests:
  - `tests/integration/phase5-simulator-fuzz.test.js`
    - deterministic repeatability check
    - property-style multi-seed duplicate/delivery invariant checks
    - parser-fuzz coverage for canonical sign-target envelope handling
- Phase 5 model spec:
  - `spec/PHASE5_MODEL_SPEC.md` with explicit entities, transitions, and invariants.
- Hardware smoke formalization and energy metrics:
  - `docs/HARDWARE_SMOKE_PATH.md`
  - `tools/phase5-energy-metrics.js`
  - `docs/ENERGY_METRICS.md`
- Field drill/runbook updates:
  - `docs/RELAY_DRILL_AB_C.md` now links simulator/property/fuzz and hardware-smoke evidence.
- Unsafe sink risk reduction:
  - Reduced `innerHTML` usage in select/QR reset flows by switching to safe DOM APIs (`replaceChildren`, option node creation) in `app/src/main.js`.

## Explicitly deferred

- No new speculative runtime transports.
- No browser BLE peripheral claims.
- No multi-client relay semantics.
- No CI gate expansion beyond reliable repository-local commands.

## Acceptance evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:phase5`

## Next phase recommendation

- Continue Phase 5 hardening incrementally (additional targeted parser mutation corpora and expanded simulator scenarios) while keeping shipped runtime truth unchanged.

## Unresolved risks

- Energy metrics are currently simulation-derived, not hardware battery telemetry.
- Unsafe sink scanning still reports additional known `innerHTML` call sites; residual risk requires continued incremental refactor.
- Hardware smoke remains manual by design (truthful for environment); not elevated to CI gate.
