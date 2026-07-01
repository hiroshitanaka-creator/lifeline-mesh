---
applyTo: "tests/**/*.py"
---

# Project Echo test rules

- Add normal-path and boundary-condition tests for new behavior.
- Prefer property-based tests for defense logic such as bias exclusion, replay protection, tamper detection, key rotation, transcript hashing, and gate invariants.
- Make immutable principles test-detectable: AI never recommends, outputs include candidate set plus evidence plus responsibility boundary, and high-risk actions require human confirmation.
- Do not loosen thresholds, fixtures, or expected failures simply to make tests pass.
- Keep fast CI gates separate from weekly or scheduled benchmark/heavy validation.
- Add Mission Integrity test perspectives when wording, prompts, policy, or governance files change.
- Tests must not miss changes that weaken criticism, defense posture, or responsibility boundaries.
