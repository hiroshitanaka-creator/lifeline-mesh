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
- No claim of browser-native peripheral support.

## Evidence mapping

- Manual drill runbook: `docs/RELAY_DRILL_AB_C.md`.
- Automated integration gate: `tests/integration/transport-phase2.test.js`.
- Deterministic simulator support: `sim/deterministic-simulator.js` + `tests/integration/phase5-simulator-fuzz.test.js`.
