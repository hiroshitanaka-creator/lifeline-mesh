Prepare a compliant lifeline-mesh pull request. Keep it small and single-purpose.

1. Validate: run `/lm-validate` (correct gate for what changed); capture results.
2. Spec-sync: if behavior in `spec/` or a `docs/` runbook changed, update it in THIS PR.
3. Fill every section of `.github/PULL_REQUEST_TEMPLATE.md`:
   - What / Why / How to test (check the command boxes you actually ran).
   - Required test perspectives: TTL/expiration, replay/resend, chunk-missing robustness,
     encrypt→send→decrypt (check those relevant).
   - Security notes: signature/recipient-binding unchanged or spec-updated; replay considered.
   - AI usage: state AI was used and which tool.
   - Verification run: commands run + summary; Skipped commands + reason is REQUIRED if any
     required command did not run.
   - Impact & risk: areas touched; flag high-risk areas (→ human review per CODEOWNERS).
   - Security impact: "no impact, because…" or "possible — flagged"; confirm no check was
     weakened to pass a test.
   - Spec / docs sync: updated here, or why not needed.
4. Honesty: never write "secure/safe/audited/fixed" without evidence; describe change +
   verification only.
5. Commit with a conventional message; push the working branch; open the PR only when asked.

Full rules: `AGENTS.md` §5–6, `docs/ai/OPERATIONS.md`.
