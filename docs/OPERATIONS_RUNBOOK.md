# Operations Runbook (Phase 5)

## 1) Release flow
1. Run: `npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run test:e2e`
2. Run Playwright on CI environment with browser install.
3. Confirm `docs/RELEASE_CHECKLIST.md` items are all complete.
4. Execute Go/No-Go meeting agenda.

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
2. Verify BLE retry/fallback behavior with integration test suite.
3. If BLE unstable in environment, switch operation guidance to clipboard/file transport.

## 4) Owner handoff checklist
- Release owner
- Security reviewer
- Ops on-call
- Documentation reviewer
