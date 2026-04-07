# Repository Truth Audit (2026-04-07)

## Scope
Maintenance-only audit to reconcile repository-facing truth after implementation series completion (Phases 1-5).

## Stale claims found
1. **Hard-coded test totals were contradictory/stale** across docs (`217/217` and `227/227`).
2. **Storage/schema references were stale** in README (`schema v4`) while runtime store is schema v5 with append-only `eventLog`.
3. **Legacy phase-gate model drift**: `tools/phase-gate-check.js` used obsolete A/B/C/D/E mapping and was cited as completion evidence.
4. **Runbook phase label drift** (`Phase 19 Final`) no longer matched implementation-series completion framing.
5. **Docs index phrasing drift**: legacy A-E Japanese checklist was listed without legacy/non-authoritative context.

## Files corrected
- `README.md`
  - Removed hard-coded aggregate test totals from authoritative status sections.
  - Updated storage/schema language to schema v5 + append-only `eventLog`.
  - Reframed validation section around command-based evidence.
- `docs/IMPLEMENTATION_SERIES_STATUS.md`
  - Normalized completion-sequence wording.
  - Updated acceptance evidence to `npm run check:phase` (series-aware gate).
- `docs/README.md`
  - Marked `PHASE_A_TO_E_EXECUTION_JA.md` as legacy/non-authoritative.
- `docs/OPERATIONS_RUNBOOK.md`
  - Updated title to implementation-series framing.
  - Updated DB reference to `DB_VERSION=5` + `eventLog`.
- `spec/README.md`
  - Removed stale hard-coded aggregate test total claim.
- `tools/phase-gate-check.js`
  - Replaced legacy A/B/C/D/E gate with implementation-series maintenance gate.

## Remaining intentional non-SSOT docs
- `docs/PHASE_A_TO_E_EXECUTION_JA.md` remains as **historical planning reference** and is not completion evidence.
- `docs/PROGRESS_ASSESSMENT_JA.md` remains as **historical assessment context** and is not current status authority.
- `docs/ISSUE_SYNC_REPORT.md` remains as **point-in-time report artifact** with historical counts.

## Current authoritative evidence commands
Run these commands for current repository truth gate:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run check:phase
```

`npm run check:phase` now validates implementation-series completion context and executes the same maintenance verification commands.
