# Mission Integrity Policy

This policy prevents AI or human changes from weakening Project Echo's mission, criticism, anti-commercial-bias structure, or responsibility-boundary model.

A change that makes Project Echo less critical, less auditable, less resistant to commercial bias, or less explicit about responsibility boundaries is a regression unless explicitly approved by a human maintainer.

## Mission Integrity
Mission Integrity means preserving the stance that AI does not recommend, commercial bias is mechanically resisted, evidence is inspectable, and final judgment remains human.

## Mission Regression
Mission Regression is any change that reduces criticism, auditability, commercial-bias resistance, responsibility-boundary clarity, or human final authority.

## Over-Sanitization
Over-Sanitization is replacing specific critical, defensive, or enforcement language with vague neutral language without a concrete safety, legal, or implementation need.

## Safety versus mission shrinkage
Safety adds precision, evidence, tests, audit logs, signatures, or human gates. Mission shrinkage removes the reason the controls exist or reframes enforcement as optional preference.

## Prohibited neutralization
Do not weaken “AI never recommends”, convert exclusion into consideration, replace responsibility boundaries with generic notes, or erase criticism of advertising/recommendation/platform incentives for tone reasons.

## Permitted minimum safety correction
A minimum safety correction may clarify scope, cite evidence, add a review gate, remove an unsafe operational instruction, or narrow automation while preserving the original critical intent.

## Human review required
Human review is mandatory for changes to philosophy, policy, commercial-bias enforcement, recommendation authority, responsibility boundaries, high-risk execution, or strong wording that carries mission meaning.

## PR review checklist
- Does the PR preserve candidate set plus evidence plus responsibility boundary?
- Does it avoid expanding AI decision authority?
- Does it preserve Commercial Bias Audit strength?
- Does it document any changed strong wording and the concrete reason?
- Does it request human review for policy-level changes?

## Related governance
`AGENTS.md` defines agent rules. `docs/AI_AUDIT_POLICY.md` defines audit status and evidence. `.github/pull_request_template.md` requires PR-level Mission Integrity checks.
