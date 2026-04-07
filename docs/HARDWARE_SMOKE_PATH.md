# Hardware Smoke Path (Phase 5 Formalization)

## Objective

Define a realistic, repeatable hardware smoke route that supports shipped Phase 2/4 behavior without adding flaky CI requirements.

## Required setup

- Device A: Browser with Web Bluetooth support.
- Device B: Node host running `node-bleno` peripheral reference path.
- Device C: Browser with Web Bluetooth support.

## Procedure

1. Start Node peripheral runtime on B.
2. Connect A -> B and send 10 signed encrypted messages.
3. Disconnect A and connect C -> B.
4. Confirm C receives queued payloads and no duplicate `msgId` is surfaced.
5. Repeat once with one forced replay payload and verify duplicate suppression.

## Pass criteria

- Message delivery ratio >= 95% for 20-message burst.
- Duplicate surfacing to UI = 0.
- Replay suppression check = PASS.
- No claim of browser-native peripheral support.

## Evidence capture contract (manual-only)

Hardware smoke remains intentionally **manual / non-CI**. Every run must produce a normalized JSON artifact under:

- `docs/evidence/hardware-smoke/<YYYY-MM-DD>-<run-label>.json`

Normalization command:

```bash
node tools/hardware-smoke-record.js \
  --input docs/evidence/hardware-smoke/sample-raw.json \
  --output docs/evidence/hardware-smoke/sample-normalized.json
```

Required fields are defined by schema:

- `docs/schemas/hardware-smoke-result.schema.json`

Minimum evidence payload expectations:

- operator identity (`operator.id`) + site label (`operator.site`)
- scenario truth (`messageBurstCount`, `forcedReplayAttempted`, `topology`)
- measurable outcomes (`messagesSent`, `messagesDelivered`, `deliveryRatio`, `duplicateSurfacedCount`)
- explicit truth flags (`manualRun: true`, `ciBacked: false`, `batteryTelemetry: not_measured`)
- raw artifact pointers (`evidence.logs` / `evidence.artifacts`)

## Comparable-run notes

- `runId` is deterministically derived from normalized content to prevent ad-hoc naming drift.
- `logs` and `artifacts` paths are lexicographically sorted by the recorder for stable diffs.
- Delivery ratio is normalized to 4 decimals.

## Evidence mapping

- Manual drill runbook: `docs/RELAY_DRILL_AB_C.md`.
- Automated integration gate: `tests/integration/transport-phase2.test.js`.
- Deterministic simulator support: `sim/deterministic-simulator.js` + `tests/integration/phase5-simulator-fuzz.test.js`.
- Sample artifacts:
  - `docs/evidence/hardware-smoke/sample-raw.json`
  - `docs/evidence/hardware-smoke/sample-normalized.json`
