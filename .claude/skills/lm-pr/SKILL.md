---
name: lm-pr
description: Prepare a lifeline-mesh pull request. Use when asked to open a PR, write a PR description, or finalize a change in this repo. Runs the right validation gate, then fills every section of .github/PULL_REQUEST_TEMPLATE.md — including honest disclosure of AI usage, commands run, commands skipped (with reason), impact, security impact, and spec/docs sync.
---

# lm-pr — prepare a compliant pull request

Produce a PR that satisfies `AGENTS.md` §6 and the repo PR template. Keep the PR small and
single-purpose; split if it grows.

## 1. Validate first
Run the `lm-validate` skill to execute the correct gate for what changed. Capture results.

## 2. Confirm spec-sync
If behavior described in `spec/` or a `docs/` runbook changed, update that file in the SAME
PR. If not needed, be ready to state why.

## 3. Fill the PR template
Populate every section of `.github/PULL_REQUEST_TEMPLATE.md`:
- **What / Why / How to test** — check the command boxes you actually ran.
- **Required test perspectives** — TTL/expiration, replay/resend, chunk-missing robustness,
  encrypt→send→decrypt mainline (check the ones relevant to this change).
- **Security notes** — signature/recipient-binding unchanged or spec-updated; replay considered.
- **AI usage** — state AI was used and which tool.
- **Verification run** — commands actually executed + summary; **Skipped commands + reason**
  is REQUIRED if any required command did not run (e.g. no browser/hardware).
- **Impact & risk** — list areas touched; flag if it hits a high-risk area (→ human review
  per CODEOWNERS).
- **Security impact** — "no impact, because…" or "possible impact — flagged"; confirm you did
  NOT weaken any check to pass a test.
- **Spec / docs sync** — updated in this PR, or why not needed.

## 4. Honesty
Do not write "secure", "safe", "audited", or "fixed" without evidence. Describe the change
and the verification performed; leave security judgments to humans and the threat model.

## 5. Branch / push
Commit with a conventional message (`feat:`/`fix:`/`docs:`/`test:`/`refactor:`/`security:`),
push the working branch, and open the PR only when explicitly asked.
