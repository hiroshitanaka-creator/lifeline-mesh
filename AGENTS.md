# AI Agent Operating Rules

AI agents must not make this repository safer by making it smaller.
Safety work must preserve Project Echo's core stance:
AI must not recommend; it must return candidate sets, evidence, and responsibility boundaries.
When a safety concern is found, the agent must:
1. identify the concrete risk,
2. preserve the original critical intent,
3. add evidence, tests, auditability, or human review gates,
4. avoid vague neutralization or ideological softening.
Mission reduction is a regression.

## Immutable Project Echo principles
- AI must not make recommendations or choose the best option for humans.
- AI output must be structured as a candidate set plus evidence plus a responsibility boundary.
- Commercial bias is not treated as a moral preference; it is mechanically excluded by audit rules, gates, and review evidence.
- Convenience must not become monetary steering, hidden recommendation, or advertising optimization.
- Echo Mark, Execution Gate, Commercial Bias Audit, Diversity Noise Injection, Voice Boundary, and Rolling Transcript Hash responsibilities must stay explicit.
- Raw audio, private keys, signing secrets, webhook URLs, and production tokens must never be committed.
- Final judgment remains with a human maintainer or operator.
- AI supports candidate generation, verification, audit support, and evidence organization; it is not the decision-maker.

## Mission Integrity and anti-sanitization rule
Do not weaken criticism, anti-commercial-bias structure, or responsibility-boundary language for vague reasons such as making text safer, neutral, enterprise-ready, less extreme, or easier to market. A safety concern must be tied to a concrete risk and resolved with the minimum change that preserves the original critical intent.

Forbidden changes include:
- Replacing "AI never recommends" with language that permits careful or implicit recommendations.
- Replacing commercial-bias exclusion with vague concern about commercial influence.
- Downgrading responsibility boundaries into optional notes or general references.
- Hiding criticism of advertising, recommendation models, or platform incentives behind neutral generalities.
- Removing terms such as audit, defense, exclusion, enforcement, or critique without a specific documented reason and human review.

Acceptable safety work strengthens evidence, tests, auditability, signatures, logs, or human review gates without reducing the mission.

## Files to inspect before changes
Before changing governance, policy, prompts, or core behavior, inspect the relevant current files. If a listed Project Echo file is absent in this repository, record that fact in the audit trail instead of inventing hidden context.

Required pre-read set:
- `AGENT.md` if present, and this `AGENTS.md`.
- `README.md`.
- `docs/operations.md`, `docs/OPERATING_PROCEDURE.md`, or the nearest existing runbook such as `docs/OPERATIONS_RUNBOOK.md`.
- `.github/workflows/`.
- `prompts/` if present.
- `tests/`.
- `src/po_echo/` if present; otherwise the implementation directories relevant to the change.

## Allowed AI changes
AI agents may propose and edit documentation, tests, CI checks, templates, and implementation changes that preserve the above principles. AI may generate candidate approaches and evidence, but must not claim final approval authority.

## Prohibited AI changes without explicit human review
- Any change that alters mission, philosophy, policy, responsibility boundaries, or commercial-bias posture.
- Any change that expands autonomous AI execution or decision-making.
- Any bypass of Echo Mark validation, Execution Gate, replay/tamper/key-rotation defense, Voice Boundary, or Rolling Transcript Hash protections.
- Any addition of real secrets, raw audio, signing material, webhook URLs, or production tokens.

## Required validation after changes
Run the smallest relevant gate and record exact commands. For governance-only changes, run `python tools/validate_ai_governance.py`. For implementation changes, also run repository gates such as `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, or narrower tests justified in the PR.

## PR audit requirements
Every PR must document:
- Scope and changed files.
- Echo principles preserved.
- Mission Integrity Check.
- Responsibility boundary.
- Evidence and audit trail, including files inspected.
- Tests run and known limitations.
- Whether human review is required for policy, philosophy, security, or operational risk.

## Human confirmation triggers
Request human review when a change touches mission wording, policy-level behavior, commercial-bias enforcement, high-risk execution, signatures, keys, webhook handling, secret management, raw audio handling, or final user/operator decision boundaries.
