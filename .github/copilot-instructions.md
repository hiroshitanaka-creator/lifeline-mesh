# GitHub Copilot / Coding Agent Instructions — lifeline-mesh

Read `AGENTS.md` and `docs/ai/OPERATIONS.md` for the full rules. This is the short,
always-on version. lifeline-mesh is E2E-encrypted, offline-first, no-server disaster
mesh messaging; unsafe changes can break disaster-time safety.

## Assumptions when generating code
- ES modules, async/await. `/crypto/**` has NO external deps except TweetNaCl — keep it pure.
- Never implement your own crypto. Use existing helpers in `/crypto/`. Never log, export,
  or transmit private keys. Never hardcode or commit test keys.
- Match existing style; prefer the smallest change; no drive-by refactors.

## Red lines — do NOT change without a human (per .github/CODEOWNERS)
- `/crypto/**`, the `DMESH_MSG_V1` domain separator, field byte-lengths, SignBytes order,
  canonical sign-target (`crypto/protocol-vnext.js`).
- `spec/PROTOCOL.md`, `spec/PROTOCOL_VNEXT.md`, `spec/THREAT_MODEL.md`, `spec/STATE_MODEL.md`,
  `SECURITY.md`.
- Replay/TTL/dedup invariants, verification state transitions, legacy-unsigned cutoff
  `2026-12-31T23:59:59Z`.
- `.github/workflows/**`, `package.json` scripts, SRI hashes, dependency pins.

Never weaken validation or a security check to make a test pass.

## Extra care (read the spec first)
BLE `/bluetooth/**` `/transport/**`, gateway `/gateway/**`, relay `/node-server/**`,
simulator `/sim/**`, IndexedDB storage schema, disaster UX in `/app/src/**`.
BLE capability claims must match `docs/BLE_SUPPORT_MATRIX.md`.

## Before proposing a PR
Run what you touched: `npm run test:unit`, `npm run test:integration`, or
`npm run validate:local`; lint/type via `npm run lint` / `npm run typecheck`. State in
the PR which commands ran and which were skipped and why. If behavior in `spec/` or
`docs/` changed, update that file in the same PR. Do not assert "secure"/"safe" without
evidence.
