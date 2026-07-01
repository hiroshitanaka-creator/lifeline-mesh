# AI Task Protocol

## Standard task prompt structure
Every AI task should include Objective, Context, Files to inspect, Allowed changes, Forbidden changes, Mission Integrity constraints, Required evidence, Required tests, Audit trail, Human decision point, and Done definition.

## Required inputs
- Objective.
- Target files and context files.
- Allowed and forbidden changes.
- Out-of-scope items.
- Required evidence and tests.
- Risk level and Mission Integrity risk.
- Human decision point.

## Required outputs
- Summary of changes.
- Files added or updated.
- Existing design alignment.
- Echo principles preserved.
- Mission Integrity Check.
- Responsibility boundary.
- Tests and validation.
- Audit evidence, risks, human review, and follow-up recommendations.

## Forbidden prompts
Do not ask AI to make wording safer, more neutral, more enterprise-ready, less critical, or less extreme without naming a concrete risk and preserving mission meaning. Do not ask AI to choose the best option or make final high-risk decisions.

## Ambiguous requests
If scope or risk is ambiguous, AI should state assumptions, limit changes to reversible low-risk work, and mark human decision points. It should not broaden autonomous authority.

## Pre-change investigation
Inspect required context files and record missing files. Do not replace existing policy with generic governance language.

## Post-change reporting
Report exact files changed, commands run, evidence found, risks, and review needs.

## Mission Integrity Check
Confirm that the change does not weaken AI-never-recommends, candidate set plus evidence plus responsibility boundary, Commercial Bias Audit, human final judgment, or structural criticism.

## Human Review Point
Identify the exact policy, mission, security, or operational question a human must decide.

## Done definition
A task is done only when scoped changes are complete, evidence is recorded, relevant checks pass or limitations are documented, secrets are absent, and human-review needs are explicit.
