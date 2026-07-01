---
applyTo: "src/po_echo/**/*.py"
---

# Project Echo core Python rules

- Do not weaken Commercial Bias Audit logic, thresholds, evidence requirements, or exclusion semantics without explicit human approval.
- Do not move Execution Gate behavior toward optimistic auto-approval; high-risk processing must require human confirmation.
- Never omit `responsibility_boundary` from outputs that generate candidates, evidence, audit results, or execution status.
- Do not bypass Echo Mark validation or treat failed validation as advisory-only.
- Do not remove replay, tamper, key-rotation, signature, or token freshness defenses.
- Do not weaken Voice Boundary or Rolling Transcript Hash privacy boundaries; raw audio and transcript integrity material must remain governed.
- Specification changes require matching tests, including negative or boundary tests.
- Safety changes must not neutralize the core stance that AI does not recommend and commercial bias is mechanically excluded.
