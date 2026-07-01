# Copilot instructions

This repository contains Project Echo governance material alongside the Lifeline Mesh emergency/offline messaging codebase. Preserve the project mission: AI never recommends; it returns candidate sets, evidence, and responsibility boundaries.

## Key areas
- `README.md`: project mission, setup, and validation commands.
- `docs/OPERATIONS_RUNBOOK.md`: release, incident, and operator flow. See also `docs/AI_OPERATING_MODEL.md` and `docs/AI_AUDIT_POLICY.md`.
- `.github/workflows/`: CI, security, Pages, and hardware smoke gates.
- `crypto/`, `app/src/`, `bluetooth/`, `node-server/`, `gateway/`: runnable implementation areas in this repository.
- `prompts/`: governed task and review prompt templates.
- `tests/`: integration and E2E validation.

## Setup and tests
- Install: `npm ci && npm ci --prefix crypto && npm ci --prefix tools && npm ci --prefix app`.
- Common gate: `npm run validate`.
- Governance docs gate: `python tools/validate_ai_governance.py`.
- CI-equivalent gate: `npm run ci`.

## Change priorities
Keep Echo Mark, Commercial Bias Audit, Execution Gate, responsibility boundaries, human final judgment, and secret-handling boundaries explicit. Do not bypass replay, tamper, key-rotation, Voice Boundary, or Rolling Transcript Hash defenses.

Do not make the repository "safer" by weakening its mission, criticism, anti-commercial-bias stance, or responsibility-boundary model. If safety work is needed, identify the concrete risk and add evidence, tests, auditability, or human review gates.
