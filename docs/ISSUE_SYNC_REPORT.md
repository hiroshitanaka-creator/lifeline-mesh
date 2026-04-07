# Issue / Docs Sync Report (PR-17)

- Date: 2026-04-06
- Repository: `hiroshitanaka-creator/lifeline-mesh`
- Scope: Re-sync README/docs/spec/issues with **current codebase truth** after PR-12 to PR-16 (sync-only; no feature implementation).

## Issue Editing Permission Check

Attempted command:

```bash
gh issue list -R hiroshitanaka-creator/lifeline-mesh --state open --limit 50
```

Result: `gh` command is unavailable in this environment, so direct GitHub issue edits were **not possible**.

## Drift Matrix (PR-17)

| Area | Codebase truth (source of truth) | Previous docs/issues claim | Drift | Action in this PR |
|---|---|---|---|---|
| Integration totals | Current test output is 217/217 (unit 49 + integration 168) | README test badge/table still 195/195 | High | Updated README badge/table/checklist/summary to 217 |
| Group integration count | `tests/integration/group-messaging.test.js` has 11 tests | README table still listed 9 | High | Updated README count to 11 |
| Node relay integration count | `tests/integration/node-server-relay.test.js` has 7 tests and includes cleanup/diagnostics observability cases | README table still listed 5 | High | Updated README count to 7 |
| Node relay ops coverage | `tests/integration/node-server-relay-ops.test.js` has 14 tests | README table omitted this suite | Medium | Added explicit Node relay ops row |
| Share-target intake coverage | `tests/integration/share-target-intake-routing.test.js` has 4 checks | README table omitted this suite | Medium | Added explicit share-target intake row |
| Multi-link runtime vs node relay model | `app/src/runtime-mesh.js` uses `Map<peerId, BLEManager>`; `node-server/relay-node.js` is single-client relay | README topology paragraph conflated app runtime topology and node relay mode | High | Reworded architecture section to separate app multi-link runtime and node single-client persistent relay |
| PWA/offline/share-target semantics | `manifest.json` has `/lifeline-mesh/` scope + GET share_target (`title`,`text`); `service-worker.js` caches app shell and has offline navigation fallback | README features did not explicitly describe these current PWA specifics | Medium | Added explicit PWA manifest/share-target/app-shell cache summary |
| validate local vs CI semantics | `package.json` + `.github/workflows/ci.yml` separate `validate:local` and `validate:ci` (runtime typecheck + Playwright critical path in CI) | Ops docs still used generic e2e wording | Medium | Updated README CI note and operations runbook release flow text |

## Proposed GitHub Issue Updates (to apply when permissions are available)

1. **Open issue: Automated docs drift check for test inventory**
   - Ensure README test totals and per-suite counts are generated or linted against integration outputs.

2. **Open issue: Docs consistency check for app runtime vs node relay topology**
   - Prevent future conflation of multi-link app runtime and single-client node relay behavior.

3. **Open issue: PWA behavior documentation guardrail**
   - Track manifest scope/share-target/service-worker cache changes and require doc sync in same PR.

4. **Refresh stale issue labels and pointers**
   - Reconfirm that already-shipped tasks (dark mode, keyboard shortcuts, emergency mode MVP, BLE support doc) remain marked as historical/completed and redirect to active gaps (browser/mobile peripheral adapter, real-device validation expansion).

---

## Addendum (PR158 cleanup) — 2026-04-07

- PR #158 introduced speculative runtime/spec changes (PQ v2, CRDT, LoRa, chaos, hybrid backhaul) that were not aligned with current dependency/tested truth.
- Cleanup restored mainline truth to the pre-#158 implementation baseline for protocol/runtime/scripts and removed speculative gates/features from shipped paths.
- Details and full KEEP/DELETE/DOWNGRADE triage are documented in `docs/PR158_TRIAGE_REPORT.md`.
