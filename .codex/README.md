# Codex assets — lifeline-mesh

Repo-specific guidance for OpenAI Codex, mirroring the Claude Code skills in
`.claude/skills/` so both agents follow the same rules.

## What Codex reads automatically
- **`AGENTS.md`** (repo root) is Codex's native project-instructions file and is read on its
  own — no setup. It is the primary ruleset (change-forbidden zones, verification gates,
  spec map, PR duties).

## Custom prompts (`.codex/prompts/`)
These are reusable prompt playbooks equivalent to the Claude skills:

| Prompt | Purpose |
|---|---|
| `lm-validate.md` | Run the correct `package.json` validation gate; report ran vs. skipped. |
| `lm-guard.md` | Preflight before editing crypto/protocol/BLE/gateway/security/CI. |
| `lm-pr.md` | Validate + fill the PR template (AI usage, skip reasons, security, spec-sync). |
| `lm-spec.md` | Map a task to the authoritative spec + normative invariants. |

### How to use them with Codex
Codex loads custom slash-prompts from its prompts directory (`$CODEX_HOME/prompts`,
default `~/.codex/prompts/`). To get `/lm-validate` etc. as slash commands:

```sh
mkdir -p ~/.codex/prompts
cp .codex/prompts/*.md ~/.codex/prompts/
```

Then run e.g. `/lm-validate` in Codex. Alternatively, paste a prompt file's contents
directly into the conversation. (Project-scoped auto-loading of `.codex/prompts/` is not
guaranteed across Codex versions, so the copy step above is the reliable path; `AGENTS.md`
is always read regardless.)

Keep command names in sync with `package.json` and paths in sync with `AGENTS.md`.
