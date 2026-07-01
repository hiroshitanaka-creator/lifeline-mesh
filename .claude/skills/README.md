# Claude Code skills — lifeline-mesh

Repo-specific skills for Claude Code. They are auto-discovered from `.claude/skills/`
(no install step) and encode this project's real gates, high-risk zones, and specs so AI
work stays safe and consistent. They complement `AGENTS.md` and `docs/ai/`.

| Skill | When it triggers / what it does |
|---|---|
| `lm-validate` | Before a PR or when asked to test/verify — runs the smallest `package.json` gate that covers the change and reports what ran vs. was skipped. |
| `lm-guard` | Before editing crypto/protocol/BLE/gateway/storage/security/CI — classifies the change as human-only / extra-care / low-risk and lists the invariants to protect. |
| `lm-pr` | When opening/finalizing a PR — validates, then fills every section of the PR template incl. AI-usage, skipped-command reasons, security impact, spec-sync. |
| `lm-spec` | At the start of any crypto/protocol/BLE/state change — maps the task to the authoritative spec and normative invariants. |

## Usage
- Invoke explicitly: `/lm-validate`, `/lm-guard`, `/lm-pr`, `/lm-spec`.
- Or just describe the task; the `description:` in each `SKILL.md` lets Claude auto-select.

## Editing
Each skill is `.claude/skills/<name>/SKILL.md` with `name` + `description` frontmatter.
Keep command names in sync with `package.json` and paths in sync with `AGENTS.md`.
