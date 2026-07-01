# AI Operations Policy — lifeline-mesh

How to use AI (Claude, Copilot/Coding Agent, review AI, task-runner AI) safely on this
project. Companion to `AGENTS.md` (rules), `docs/ai/AUDIT_RULES.md` (checklist),
`docs/ai/TASK_PROMPTS.md` (templates). JA: AIの実務運用方針。

## AI MAY own (low risk, still verified + human-merged)
- Docs/comments/typos, translations, doc-example fixes.
- Adding tests that tighten existing behavior (no production-code change).
- Non-crypto, non-protocol bug fixes in `/app/src/**` UI, tooling in `/tools/**`.
- Lint/type/style cleanups that don't alter behavior.
- Drafting issues, PR descriptions, changelog entries, repro steps.

## AI MUST NOT own (do not let AI decide these alone)
- Designing or changing crypto, key handling, signing, or canonicalization.
- Changing protocol wire format, versioning, or the legacy-unsigned cutoff.
- Editing `SECURITY.md` / `spec/THREAT_MODEL.md` security claims, or the state machine.
- Relaxing replay/TTL/dedup/validation invariants.
- Changing CI gates, release criteria, security workflows, SRI, or dependency pins.
- Any change whose only justification is "to make the failing test pass" by weakening a check.

## Requires HUMAN APPROVAL before merge (AI may draft, human decides)
- Anything under `/crypto/**`, `spec/**`, `SECURITY.md` (already enforced by CODEOWNERS).
- BLE / transport / gateway / relay / simulator behavior changes.
- Storage schema / migration changes.
- Disaster-facing UX flows (key gen, send/receive, offline).
- Dependency additions/upgrades.

## Escalation
If a task drifts into a "MUST NOT own" area, STOP: open/annotate an issue describing the
needed change, tag it high-risk, and hand off to a human maintainer. Never proceed on
assumption in a security-sensitive area. State assumptions explicitly in the PR/issue.

## Verification expectation
Every AI change is verified with the relevant `package.json` gate (`npm run test:unit`,
`npm run test:integration`, `npm run validate:local`, `npm run lint`, `npm run typecheck`,
`npm run check:security-audit`) and the results — including any skipped command and the
reason — recorded in the PR. Unverified ≠ done.

## Honesty rule
AI output must not claim code is secure, safe, audited, or fixed without evidence.
Describe the change and the verification performed; leave security judgments to humans
and the threat model.
