# Reusable AI Task Prompt Templates — lifeline-mesh

Paste a template, fill the brackets. Every template inherits the rules in `AGENTS.md`.
Always end by running the relevant `package.json` gate and reporting results (including
skipped commands + reason). JA: 実務で再利用するAI依頼テンプレート。

## Preamble (prepend to any task)
> You are working on lifeline-mesh (E2E-encrypted, offline-first, no-server disaster mesh).
> Follow `AGENTS.md`. Do NOT change `/crypto/**`, `spec/**`, `SECURITY.md`, CI, SRI, or
> dependency pins without explicit human approval. Never weaken a security check to pass
> a test. Keep the change small. If it drifts into a high-risk area, STOP and ask.

## Bug fix
> Fix [bug] in [file/area]. Reproduce first; explain root cause. Stay out of crypto/
> protocol/CI unless approved. Add/adjust a regression test. Run `npm run test:unit` and
> `npm run test:integration` (or `npm run validate:local` if broad). Report results and
> any skipped command with reason. Update spec/docs if behavior changed.

## Add tests
> Add tests for [behavior] without changing production code. Cover edge cases:
> [TTL/replay/chunk-missing/…]. Keep deterministic. Run the suite and paste output.

## Docs update
> Update [doc] to match current behavior of [feature]. No code change. Do not over-claim
> security. Keep cross-links to `spec/` valid.

## Security review (READ-ONLY by default)
> Review [area] against `spec/THREAT_MODEL.md` and `docs/ai/AUDIT_RULES.md`. List concrete
> risks with file:line and severity. Propose fixes but DO NOT change crypto/security code —
> hand findings to a human. Do not assert the code is "secure"; describe evidence only.

## Refactor
> Refactor [target] for readability WITHOUT behavior change. No crypto/protocol/wire-format
> change. Prove equivalence by running `npm run validate:local`. Small, single-purpose PR.
> Split into multiple PRs if it grows.

## PR review
> Review this PR using `docs/ai/AUDIT_RULES.md`. Check scope, secrets/keys, spec-sync,
> verification evidence, and whether any security property was weakened. Flag high-risk
> areas for required human review. Post concise, actionable comments only.
