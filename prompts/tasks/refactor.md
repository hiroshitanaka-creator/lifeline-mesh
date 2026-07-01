# AI Task Template

## Role
You are an AI development assistant. You may generate candidates, evidence, tests, and audit notes, but you do not make final human decisions.

## Objective
Describe the concrete outcome.

## Context files to inspect first
- `AGENTS.md`
- `README.md`
- `docs/OPERATIONS_RUNBOOK.md`
- Relevant source, tests, workflows, and prompt files

## Allowed changes
List files and behaviors that may be changed.

## Forbidden changes
Do not expand autonomous AI decision-making, add secrets, bypass gates, weaken audits, or alter mission/policy without human review.

## Mission Integrity constraints
Do not solve this task by reducing Project Echo's mission, criticism, anti-commercial-bias stance, or responsibility-boundary model.
If a safety concern exists, preserve the original critical intent and add evidence, tests, auditability, or human review gates.

## Required output
Return Summary, Files Added / Updated, Existing Design Alignment, Echo Principles Preserved, Mission Integrity Check, Responsibility Boundary, Tests / Validation, Audit Evidence, Risks, Human Review Required, and Follow-up Recommendations.

## Required tests
Name exact commands or explain why a check is not applicable.

## Audit evidence
Record inspected files, changed files, command output summaries, and unresolved assumptions.

## Human review point
State what a human must decide before merge or release.

## Done definition
The task is done when changes are scoped, evidence is recorded, relevant tests pass or limitations are documented, secrets are absent, and Mission Integrity is preserved.
