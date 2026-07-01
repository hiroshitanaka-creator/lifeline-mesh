# AGENTS.md — AI Agent Operating Rules for lifeline-mesh

This file is the FIRST thing any AI agent (Claude, Copilot/Coding Agent, code-review
AI, task-runner AI) must read before touching this repository. It is normative for AI
work. It does not replace `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, or `spec/`;
it sits on top of them. Where anything here appears to conflict with `CODEOWNERS`,
`SECURITY.md`, or `spec/`, THOSE files win and you must stop and ask a human.

JA: 本ファイルはAIエージェントが最初に読む運用規約です。CODEOWNERS/SECURITY/spec と矛盾した場合はそれらが優先。

## 0. What this project is (why caution matters)
End-to-end encrypted, offline-first, no-server mesh messaging for disasters. A wrong
change to crypto, protocol, BLE, gateway, or disaster UX can silently break safety or
disaster-time usability. Prefer the smallest correct change. When unsure, STOP and ask.

## 1. Change-FORBIDDEN without explicit human sign-off
Do NOT modify the following on your own initiative. Propose in an issue/PR and wait for
a human (per `.github/CODEOWNERS`):
- Cryptographic primitives or their usage: `/crypto/**` (Ed25519 / X25519-XSalsa20-Poly1305,
  TweetNaCl). Never invent primitives; never swap libraries; never change key handling.
- Signing/canonicalization: the `DMESH_MSG_V1` domain separator, field byte-lengths,
  SignBytes ordering, and the canonical sign-target (`crypto/protocol-vnext.js`).
- Protocol wire formats and versioning: `spec/PROTOCOL.md`, `spec/PROTOCOL_VNEXT.md`.
- Security policy / threat model: `SECURITY.md`, `spec/THREAT_MODEL.md`, `spec/STATE_MODEL.md`.
- Replay/dedup/TTL invariants, the legacy-unsigned cutoff `2026-12-31T23:59:59Z`, and the
  verification state machine.
- CI, release gates, security workflows, SRI hashes, dependency pins: `.github/workflows/**`,
  `package.json` scripts, `dependabot.yml`.

You must NEVER weaken a security property to make a test pass. If a test blocks you and
the only "fix" is loosening crypto/validation, STOP and report it in the PR instead.

JA: 暗号・署名・プロトコル・脅威モデル・CIは独断変更禁止。テストを通すために検証を緩めるのは禁止。

## 2. High-RISK (allowed, but extra care + spec check + human review expected)
`/bluetooth/**`, `/transport/**`, `/gateway/**`, `/node-server/**`, `/sim/**`, storage
schema (`IndexedDB`), and disaster-facing UX in `/app/src/**` (key generation, message
send/receive, offline paths). Read the relevant spec first (Section 3) and call out the
risk explicitly in the PR.

## 3. Read BEFORE you implement (map task → spec)
- crypto / signatures / keys → `spec/PROTOCOL.md`, `spec/THREAT_MODEL.md`, `/crypto/`.
- canonical signing / envelope kinds / msgId → `spec/PROTOCOL_VNEXT.md`, `crypto/protocol-vnext.js`.
- verification state / event ordering / sync convergence → `spec/STATE_MODEL.md`.
- relay / gateway / simulator dedup & parser safety → `spec/PHASE5_MODEL_SPEC.md`,
  `docs/GATEWAY_BRIDGE_PHASE4.md`, `docs/NODE_RELAY_APPLIANCE_PATH.md`.
- BLE capability limits → `docs/BLE_SUPPORT_MATRIX.md`,
  `docs/BLE_PERIPHERAL_CAPABILITY_MATRIX.md`, `docs/ADR_BLE_PERIPHERAL_PATH.md`.
- contribution + crypto coding rules → `CONTRIBUTING.md`.

Also read `docs/ai/OPERATIONS.md` (what you may/may not own) and `docs/ai/AUDIT_RULES.md`
(the checklist you will be reviewed against).

## 4. Run BEFORE you open a PR (verification)
Run the fullest gate the change touches; copy results into the PR body.
- Crypto or spec touched → `npm run test:unit` (crypto + vectors) AND `npm run test:integration`.
- Broad change → `npm run validate:local`
  (lint+typecheck → unit → integration → compat → e2e smoke).
- Lint/type only → `npm run lint` and `npm run typecheck`.
- Security-relevant → also `npm run check:security-audit`.

If you cannot run a required command (no browser, no hardware, sandbox limit), you MUST
state which command was skipped and why, in the PR body. Do not claim verified when it
was not run.

JA: PR前に該当ゲートを実行し結果をPR本文へ。未実行なら「どのコマンドをなぜ実行しなかったか」を必ず明記。

## 5. Spec-sync rule
If your code change alters behavior described in `spec/` or a `docs/` runbook, you MUST
update the corresponding spec/doc in the SAME PR (or explain why no update is needed).
Behavior and spec must not drift.

## 6. PR disclosure duties (see PR template)
Every AI-assisted PR must state: AI was used and which tool; verification commands
actually run (and any skipped, with reason); files/areas impacted; security impact
(or "none, and why"); whether spec/docs were updated. Keep PRs small and single-purpose
so humans can review the risk. Never claim something is "secure", "safe", or "fixed"
without evidence — describe what you changed and what you verified.

## 7. When to STOP and ask a human
Any change to Section 1 areas; any security-property trade-off; any large refactor;
any ambiguity in a spec; any test you would have to weaken. Ask in the issue/PR; do not
proceed on assumption.
