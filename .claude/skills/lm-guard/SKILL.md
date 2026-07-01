---
name: lm-guard
description: High-risk-area preflight for lifeline-mesh. Use BEFORE editing anything under crypto, protocol/spec, BLE, transport, gateway, relay, storage schema, security, or CI. Decides whether the change is AI-allowed or requires human sign-off, and lists the locked invariants that must not be broken.
---

# lm-guard — preflight before touching sensitive areas

lifeline-mesh is E2E-encrypted, offline-first, no-server disaster mesh messaging. A wrong
edit can silently break safety. Run this check before editing high-risk code.

## 1. Classify the target path
- **STOP — human-only (per `.github/CODEOWNERS`; AI may only draft/propose):**
  `/crypto/**`; the `DMESH_MSG_V1` domain separator, field byte-lengths, SignBytes order,
  canonical sign-target (`crypto/protocol-vnext.js`); `spec/PROTOCOL.md`,
  `spec/PROTOCOL_VNEXT.md`, `spec/THREAT_MODEL.md`, `spec/STATE_MODEL.md`, `SECURITY.md`;
  replay/TTL/dedup invariants; legacy-unsigned cutoff `2026-12-31T23:59:59Z`; the
  verification state machine; `.github/workflows/**`, `package.json` scripts, SRI hashes,
  dependency pins.
  → Do NOT change on your own initiative. Open/annotate an issue, tag it high-risk, hand to
  a human. If a test only passes by weakening a security check, STOP and report it.

- **Extra care — allowed but read the spec first + expect human review:**
  `/bluetooth/**`, `/transport/**`, `/gateway/**`, `/node-server/**`, `/sim/**`, IndexedDB
  storage schema, disaster UX in `/app/src/**` (key gen, send/receive, offline).

- **Low risk — AI may own (still verify + human-merge):**
  docs, comments, translations, tests that tighten behavior, non-crypto tooling.

## 2. Read the relevant spec first
Use the `lm-spec` skill (or the map in `AGENTS.md` §3) to load the right spec before coding.

## 3. Invariants to double-check if you proceed
- Primitives: Ed25519 signing + X25519-XSalsa20-Poly1305; TweetNaCl only; `/crypto` stays
  dependency-pure; keys never logged/exported/transmitted; no committed test keys.
- Key separation (sign vs box); fresh ephemeral key per message; recipient binding in signature.
- Wire format / field lengths / SignBytes order unchanged unless version-bumped w/ human OK.
- Chunk reassembly: a missing chunk must not yield a valid decrypted payload.
- Dedup: same `(node, msgId)` never re-delivered after duplicate-drop; parser never crashes.
- BLE capability claims match `docs/BLE_SUPPORT_MATRIX.md`.

## 4. Output
State the classification (human-only / extra-care / low-risk), the spec you read, and the
invariants relevant to this change. If human-only: stop and hand off.
