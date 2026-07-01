# AI Audit Policy

## Audit scope
Audit every AI-assisted change to governance, prompts, tests, CI, core behavior, security controls, commercial-bias controls, and responsibility boundaries.

## Audit evidence to retain
- Task objective and scope.
- Files inspected before editing.
- Changed files and summary.
- Test commands and outputs.
- Risks, unresolved questions, and human decision points.
- Mission Integrity Check.

## PR evidence
Each PR must include the template sections for Echo principles, Mission Integrity, responsibility boundary, evidence/audit trail, tests, risk, and human review.

## Audit log template
Use `docs/templates/ai_audit_log.md` for substantial AI-assisted changes.

## Publication blockers
Mark work as BLOCKED if it introduces secrets, raw audio, private keys, signing secrets, webhook URLs, production tokens, hidden recommendations, autonomous high-risk execution, or undocumented mission/policy changes.

## Status criteria
- `BLOCKED`: violates an immutable principle, lacks required evidence, exposes secrets, or requires unresolved human approval.
- `CHECK`: plausible but missing evidence, tests, reviewer confirmation, or clear responsibility boundary.
- `VERIFIED`: evidence, tests, responsibility boundary, and mission-integrity checks are complete for the stated scope.

## Echo Mark relationship
Echo Mark is treated as evidence of provenance and integrity, not as permission for AI to decide. Audit records must not bypass Echo Mark failures or downgrade validation failure to a cosmetic warning.

## Responsibility boundary
AI records evidence and candidate interpretations. Human maintainers retain final approval for release, policy, mission, and high-risk operational choices.

## Required records for AI changes
Record changed files, inspected context, commands run, generated artifacts, known limitations, Mission Integrity risk, and whether human review is required.

## Mission regression audit lens
Review whether the change makes Project Echo less critical, less auditable, less resistant to commercial bias, less explicit about responsibility boundaries, or more permissive of AI recommendation authority.
