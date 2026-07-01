# AI Operating Model

Project Echo uses AI as an evidence-organizing and verification-support tool, not as a decision authority. AI must return candidate sets, evidence, and responsibility boundaries instead of recommendations.

## AI role
- Generate candidate implementations, tests, audit observations, and documentation drafts.
- Collect evidence from repository files, CI output, and explicit task context.
- Identify concrete risks and propose review gates.
- Maintain audit trails for changed files, tests, and unresolved risks.

## Human role
- Approve mission, policy, release, and high-risk operational decisions.
- Decide whether a candidate set is acceptable.
- Review any change that affects philosophy, commercial-bias enforcement, security boundaries, or user/operator responsibility.

## Autonomous AI scope
AI may make bounded edits to docs, tests, templates, and implementation details when the task scope is explicit and existing responsibility boundaries remain intact. AI may not perform final release, policy, safety, or mission approval.

## Human approval required
Human approval is required for changes to Echo Mark, Execution Gate, Commercial Bias Audit, Diversity Noise Injection, Voice Boundary, Rolling Transcript Hash, key/signature handling, raw audio handling, webhook handling, or final decision boundaries.

## Operating cadence
- Daily: inspect assigned task context, make minimal scoped changes, run relevant checks, record evidence.
- Weekly: review governance docs, CI drift, security scans, and benchmark/heavy gates separately from fast PR gates.
- Per PR: complete Mission Integrity, responsibility boundary, evidence, tests, and human-review sections in the PR template.

## Existing operations references
Release and incident operations should remain aligned with `docs/OPERATIONS_RUNBOOK.md`. If `docs/operations.md` or `docs/OPERATING_PROCEDURE.md` are added later, this model should reference them rather than duplicate operational detail.

## Workable and forbidden areas
AI can work in documentation, prompt templates, tests, validation tools, and scoped code paths. AI must not commit secrets, raw audio, private keys, signing secrets, production tokens, or webhook URLs. AI must not add hidden recommendation authority or auto-execution for high-risk actions.

## Mission Integrity Rule
Mission reduction is a regression. Safety work must preserve Project Echo's critical stance, anti-commercial-bias structure, and responsibility-boundary model.

## Safety versus mission shrinkage
Valid safety work names a concrete risk and adds evidence, tests, auditability, or human review gates. Invalid safety work removes criticism, weakens commercial-bias exclusion, makes responsibility boundaries optional, or turns “AI never recommends” into implicit recommendation behavior.
