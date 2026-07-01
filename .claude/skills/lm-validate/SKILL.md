---
name: lm-validate
description: Run the correct lifeline-mesh validation gate for the current change. Use before opening a PR, or whenever asked to test/verify/validate work in this repo. Picks the right package.json script based on which files changed (crypto/spec/BLE/gateway/UI/docs) and reports exactly what ran and what was skipped.
---

# lm-validate — run the right verification gate

Pick the smallest gate that fully covers what changed, run it, and report results
honestly. Never claim "verified" for a command you did not run.

## 1. Detect scope
Run `git status --porcelain` and `git diff --name-only` to see changed paths.

## 2. Choose the gate (smallest that covers the change)
| Changed area | Command to run |
|---|---|
| `/crypto/**`, `spec/**`, signing/canonicalization | `npm run test:unit` **and** `npm run test:integration` |
| `/bluetooth/**`, `/transport/**`, `/gateway/**`, `/node-server/**`, `/sim/**`, storage, `/app/src/**` | `npm run validate:local` (lint+typecheck → unit → integration → compat → e2e smoke) |
| Broad / cross-cutting / unsure | `npm run validate:local` |
| Lint/type/style only | `npm run lint` **and** `npm run typecheck` |
| Docs/comments only | `npm run lint` (optional); no test gate required |
| Security-relevant (keys, XSS, deps, SRI) | add `npm run check:security-audit` |

Crypto-only quick loop: `npm run test:crypto` + `npm run test:vectors`.

## 3. Run and capture
Execute the chosen command(s). Capture pass/fail and key output.

## 4. Report (honest)
State: which commands ran + result; which required commands were **skipped and why**
(e.g. "test:e2e skipped — no browser/hardware in sandbox"). If a security/validation
check would have to be weakened to pass, STOP and report it — do not weaken it.

## Guardrails
- These script names are authoritative in `package.json`; if a script is missing, report
  it rather than inventing a command.
- Do not modify CI gates or `package.json` scripts to make validation pass.
