# A↔B↔C Relay Drill (Phase 2)

_Last updated: 2026-04-07_

This drill is the **single truthful interop drill** for the current Phase 2 scope.

## Scope and shipped truth

- **A/C role**: browser BLE central links (via `BleBrowserCentralLink` adapter boundary).
- **B role**: Node peripheral reference path (`NodeGattPeripheralLink` + `GATTServer` + `node-bleno` backend).
- **Single-client relay truth remains**: Node peripheral active session is intentionally one client at a time.
- Native/mobile peripheral mode is currently **contract-only** (`NativePeripheralContractLink` stub).

## Acceptance target

- Delivery ratio: **>= 95%** in the supported drill.
- Duplicate-free relay for message IDs in the drill window.

## Drill steps

1. Bring up B peripheral (`node-server/` runtime).
2. Connect A -> B and verify outbound from A reaches B receive queue.
3. Rotate central session to C -> B and verify B forwards pending payloads.
4. Run 40-message burst with deterministic relay suppression for duplicates.
5. Compute delivery ratio on C and verify duplicate-free `msgId` set.

## Automation mapping

- Test: `tests/integration/transport-phase2.test.js`
- Command: `npm run test:integration`
- Relay-focused command: `npm run test:relay-appliance`
- Deterministic simulator support (Phase 5): `sim/deterministic-simulator.js`
- Simulator/property/fuzz gate: `tests/integration/phase5-simulator-fuzz.test.js`

## Route advertisement policy used in Phase 2

- Route advertisements use jitter and suppression (`RouteAdvScheduler`).
- Suppression window avoids repeated identical advertisements in burst windows.
- Jitter randomizes interval to reduce broadcast synchronization spikes.

## Out of scope (explicitly deferred)

- Browser-native LoRa runtime.
- Browser BLE peripheral mode.
- Multi-client Node relay semantics.

## Phase 5 support evidence

- Hardware smoke formalization: `docs/HARDWARE_SMOKE_PATH.md`
- Energy profile command: `node tools/phase5-energy-metrics.js`
