Preflight before editing a sensitive area of lifeline-mesh (E2E-encrypted, offline-first,
no-server disaster mesh). Classify the change and stop if it is human-only.

Classify the target path:
- HUMAN-ONLY (per `.github/CODEOWNERS`; you may only draft/propose, not change alone):
  `/crypto/**`; `DMESH_MSG_V1` domain separator, field byte-lengths, SignBytes order,
  canonical sign-target (`crypto/protocol-vnext.js`); `spec/PROTOCOL.md`,
  `spec/PROTOCOL_VNEXT.md`, `spec/THREAT_MODEL.md`, `spec/STATE_MODEL.md`, `SECURITY.md`;
  replay/TTL/dedup invariants; legacy-unsigned cutoff `2026-12-31T23:59:59Z`; verification
  state machine; `.github/workflows/**`, `package.json` scripts, SRI hashes, dependency pins.
  → Do not change on your own initiative. Open/annotate a high-risk issue and hand to a human.
  Never weaken a security check to make a test pass.
- EXTRA CARE (allowed, read spec first, expect human review): `/bluetooth/**`,
  `/transport/**`, `/gateway/**`, `/node-server/**`, `/sim/**`, IndexedDB schema,
  disaster UX in `/app/src/**`.
- LOW RISK (may own, still verify): docs, comments, translations, tests that tighten
  behavior, non-crypto tooling.

Before proceeding, read the relevant spec (see `/lm-spec` or `AGENTS.md` §3) and re-check:
key separation (sign vs box), fresh ephemeral key per message, recipient binding, unchanged
wire format / field lengths / SignBytes order, chunk-missing safety, dedup + parser safety,
BLE claims matching `docs/BLE_SUPPORT_MATRIX.md`, no keys logged/exported, no committed test keys.

Output: classification, spec read, invariants relevant to this change. If human-only: stop.
