# Operations Runbook (Phase 19 Final)

## Scope
- This runbook covers **release operations**, **delivery incidents**, and **field fallback flow** for the current prototype.
- Applies to browser app (`app/`), crypto modules (`crypto/`), BLE transport (`bluetooth/`), and test/CI gates.

## 1) Release flow
1. Local gate: `npm run validate` (`validate:local` = lint + typecheck + unit + integration + compat + smoke E2E).
2. CI gate: `npm run ci` (`validate:ci` = local gates + `typecheck:runtime` + Playwright critical path).
3. For full browser coverage, run `npm run test:e2e:real-browser` in a Playwright-capable environment.
4. Confirm [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) items are all complete.
5. Execute Go/No-Go meeting agenda.

### Release exit criteria (must-pass)
- Local and CI gate semantics both green (`validate:local`, `validate:ci`).
- No unresolved high/critical security findings.
- Migration test completed against existing IndexedDB data.
- BLE offline queue path validated (offline enqueue → reconnect → flush).

## 2) DB migration / rollback
- DB implementation: `crypto/store.js` (`DB_VERSION`, `onupgradeneeded`).
- Before release:
  - verify migration path in staging with existing IndexedDB data.
  - verify old data read/write for keys, contacts, groups, sender keys.
- Rollback:
  1. Stop rollout.
  2. Re-deploy previous static bundle.
  3. If schema conflict occurs, instruct users to export keys, reset DB, and import keys.

## 3) Incident response (message delivery degradation)
1. Check integration logs (`artifacts/integration-test.log`) from CI.
2. Verify BLE retry/fallback behavior with integration suite (`ble-crypto`, `mesh-router`, `app-runtime-mesh`).
3. Check node relay observability snapshot/cleanup behavior (`node-server-relay.test.js`, `node-server-relay-ops.test.js`).
4. If BLE unstable in environment, switch operation guidance to clipboard/file transport.

### Triage checklist
1. Confirm browser capability (Web Bluetooth available or not).
2. Confirm peer connection state and signal strength/range.
3. Check outbox counts and failed message status.
4. Trigger manual outbox flush and re-check delivery.
5. Capture incident timestamp, environment, and repro steps for postmortem.

## 4) Key compromise / device loss playbook
1. Assume keys on lost/untrusted device are compromised.
2. Instruct user/team to run `RESET ALL` on recovered device (if possible).
3. Regenerate keys and distribute new identity fingerprints out-of-band.
4. Mark prior fingerprints as revoked in team operations note.
5. Validate new-contact verification before resuming sensitive communication.

## 5) Owner handoff checklist
- Release owner
- Security reviewer
- Ops on-call
- Documentation reviewer

## 6) Ops cadence (recommended)
- Weekly: dependency/security review and regression smoke checks.
- Per release: full checklist + runbook drill for one failure scenario.
- Monthly: tabletop exercise (BLE unavailable / device loss / migration rollback).
