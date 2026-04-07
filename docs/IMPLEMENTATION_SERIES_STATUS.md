# Implementation Series Status

## Detected current phase state

- Phase 1 is **complete** (`spec/PROTOCOL_VNEXT.md`, `spec/STATE_MODEL.md`, scope decision, conformance vectors/tests).
- Phase 2 is **complete** (`transport/` boundary, BLE central adapter wrapping, Node peripheral reference path, retry/jitter policy, relay drill docs/tests).
- Phase 3 is **complete** (append-only event log runtime, outbox/inbox transition events with deterministic replay projectors, shared ingest path, anti-entropy sync engine, convergence tests).
- Phase 4 is **complete** (`gateway/` bridge service, durable gateway event store, loop-safe dedupe semantics, island sync tests, local-only continuity).
- Phase 5 is **complete** (deterministic simulator, property tests, parser fuzzing, model spec, hardware smoke path, energy metrics, field drill docs, bounded unsafe sink audit).

## Active phase implemented in this task

- **No new phase implementation**.
- Implementation-series verification confirms **no incomplete phase** in the canonical sequence (Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5).
- Per execution rules, work stopped after verification to avoid speculative or out-of-order changes.
- ADR freeze alignment applied for BLE peripheral truth: v0.1.x supported path is Node relay appliance only (mobile/browser peripheral remains unresolved).

## What was added

- Updated status + verification documentation to require structured manual hardware smoke evidence artifacts and schema-backed normalization.
- Added explicit simulation-vs-measured energy evidence separation with a dedicated evidence schema.
- Hardened operator-panel rendering to remove direct `innerHTML` sink usage from audited paths.

## Explicitly deferred

- All future runtime/architecture expansion beyond the defined five-phase series.
- Any speculative transport, relay, or gateway feature not tied to an incomplete phase.

## Acceptance evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run check:phase` (implementation-series maintenance gate; no legacy A/B/C/D/E model)

## Next phase recommendation

- No core phase is pending.
- Recommended track is **maintenance-only**: defect fixes, operational hardening, and truthful regression coverage without introducing new unapproved phase scope.

## Unresolved risks

- Energy metrics remain simulator-derived and should not be represented as hardware battery telemetry.
- Manual hardware smoke path is intentionally non-CI and should remain documented as such.
- Hardware smoke evidence remains manual-only; CI still cannot attest physical RF/device behavior.
- Dependency audit still reports WARN findings and must remain tracked until remediation lands.
