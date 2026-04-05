# Issue / Docs Sync Report (PR-11)

- Date: 2026-04-05
- Repository: `hiroshitanaka-creator/lifeline-mesh`
- Scope: Sync README/docs/spec/issues with **current codebase truth** (no feature implementation).

## Issue Editing Permission Check

Attempted command:

```bash
gh issue list -R hiroshitanaka-creator/lifeline-mesh --state open --limit 50
```

Result: `gh unavailable or unauthenticated` in this environment, so direct GitHub issue edits were **not possible**.

## Drift Matrix

| Area | Codebase truth (source of truth) | Previous docs/issues claim | Drift | Action in this PR |
|---|---|---|---|---|
| App mesh runtime wiring | `app/src/main.js` wires `router` + `onForward` into `BLEManager` and forwards via `runtime-mesh.js` | `docs/PHASE_PROGRESS.md` + `spec/PROTOCOL.md` still said app wiring was not done | High | Updated docs to match implemented wiring |
| Routing phase status | `runtime-mesh.js` and `mesh-router-phase2` tests show route adv + next-hop routing active | `spec/PROTOCOL.md` said Phase 2 not implemented | High | Updated spec status text |
| BLE peripheral/relay | Node-side peripheral exists: `bluetooth/gatt-server.js` + `bluetooth/backends/node-bleno.js` + `node-server/server.js` | Multiple docs framed peripheral as entirely unimplemented | High | Reworded to distinguish Node implemented vs browser/mobile adapter gap |
| Test totals | Current passing counts are 195 total from unit+integration runs | README badges/tables still said 184 | High | Updated README badge, total, and related summary lines |
| Node relay integration count | `tests/integration/node-server-relay.test.js` now has 5 tests | README said 3 tests | Medium | Updated README count |
| Pages deployment branch | `.github/workflows/pages.yml` deploys on `main` | README said `master` | Medium | Updated README branch note |
| Browser matrix consistency | `docs/WEB_BLUETOOTH_SUPPORT.md` says Safari unsupported for production, while `docs/BLE_SUPPORT_MATRIX.md` said partial/experimental | Intra-doc inconsistency | Medium | Normalized BLE support matrix wording |
| Good first issues | Several listed “first issues” are already implemented in code | Stale tracked work candidates | Medium | Added maintenance note marking completed items and current gap focus |

## Proposed GitHub Issue Updates (to apply when permissions are available)

1. **Close/replace stale issue candidates tied to already-implemented work**
   - Dark mode support
   - Keyboard shortcuts
   - Web Bluetooth support documentation
   - Emergency mode basic UI

2. **Create/update issue: Browser/mobile peripheral adapter gap**
   - Clarify that Node backend exists (`node-bleno`) but browser/mobile peripheral adapter is still open.

3. **Create/update issue: Continuous docs drift audit**
   - Add periodic check for README/spec status lines versus integration test inventory and runtime wiring.

4. **Create/update issue: Real-device BLE validation expansion**
   - Extend hardware validation coverage (beyond simulated/back-end tests) and attach reproducible runbook evidence.

