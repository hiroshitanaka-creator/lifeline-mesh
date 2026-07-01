# Prompt governance

`prompts/` stores reusable AI task and review prompt templates. Prompts guide work; they do not replace implementation logic, tests, audit policy, or human approval.

## Prompt types
- Task prompts define scoped work such as feature, bugfix, audit, docs, or refactor tasks.
- Review prompts evaluate evidence, Mission Integrity, risk, and responsibility boundaries.

## Review requirements
Prompt changes require review when they affect mission language, Commercial Bias Audit, Execution Gate, responsibility boundaries, human decision points, or AI authority.

## Old prompts
Do not silently delete old prompts that may be needed for audit. Deprecate with a note, replacement link, and reason.

## Audited prompts
A prompt is auditable when it can affect code, policy, security behavior, tests, release decisions, or public claims.

## Mission Integrity Rule
Do not weaken prompt language for vague safety, neutrality, or enterprise-readiness reasons. Do not solve prompt risk by reducing Project Echo's mission, criticism, anti-commercial-bias stance, or responsibility-boundary model. If safety concerns exist, preserve the critical intent and add evidence, tests, auditability, or human review gates.
