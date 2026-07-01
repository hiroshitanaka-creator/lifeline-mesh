Run the correct lifeline-mesh validation gate for the current change, then report honestly.

Steps:
1. Run `git status --porcelain` and `git diff --name-only` to see what changed.
2. Pick the smallest gate that fully covers it:
   - `/crypto/**` or `spec/**` or signing/canonicalization → `npm run test:unit` AND `npm run test:integration`
   - `/bluetooth/**`, `/transport/**`, `/gateway/**`, `/node-server/**`, `/sim/**`, storage, `/app/src/**`, or unsure → `npm run validate:local`
   - lint/type/style only → `npm run lint` AND `npm run typecheck`
   - docs/comments only → `npm run lint` (optional)
   - security-relevant (keys, XSS, deps, SRI) → also `npm run check:security-audit`
   - crypto-only quick loop → `npm run test:crypto` + `npm run test:vectors`
3. Run the chosen command(s); capture pass/fail and key output.
4. Report which commands ran + result, and which required commands were SKIPPED and why
   (e.g. "test:e2e skipped — no browser/hardware"). Never claim verified for a command you
   did not run. If a check would only pass by weakening a security/validation rule, STOP and
   report it instead of weakening it.

Authority: script names live in `package.json`; do not invent commands or edit CI/scripts to
make validation pass. Full rules: `AGENTS.md` §4.
