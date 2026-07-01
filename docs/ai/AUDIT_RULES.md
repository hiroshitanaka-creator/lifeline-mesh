# AI/Human Audit Checklist — lifeline-mesh

Shared checklist for AI code-review and human review. Reviewer confirms each relevant
item or records why it does not apply. Anything unchecked in crypto/protocol/BLE/CI
blocks merge and needs human sign-off (per `.github/CODEOWNERS`).

## Cross-cutting (every PR)
- [ ] Scope is small and single-purpose; no unrelated drive-by changes.
- [ ] No private keys / secrets / test keys added, logged, exported, or transmitted.
- [ ] PR states AI usage, commands run, commands skipped (+reason), security impact.
- [ ] Behavior change in `spec/`/`docs/` is mirrored by a spec/doc update in the same PR.
- [ ] No security property weakened to pass a test.

## crypto (`/crypto/**`)
- [ ] No new primitive; TweetNaCl only; `/crypto` stays dependency-pure.
- [ ] Key separation preserved (Ed25519 signing vs X25519 box); ephemeral key per message.
- [ ] `DMESH_MSG_V1` domain separator, field byte-lengths, and SignBytes order unchanged
      (or version-bumped with human approval).
- [ ] New/changed crypto has test vectors (`npm run test:vectors`); `npm run test:crypto` passes.

## protocol (`spec/PROTOCOL*.md`, `crypto/protocol-vnext.js`)
- [ ] Wire format unchanged, or a version bump + backward-compat path is documented.
- [ ] Canonical sign-target (sorted-key JSON) still deterministic; conformance vectors pass.
- [ ] Unknown `kind` still ignored safely; msgId derivation unchanged.
- [ ] Legacy-unsigned cutoff `2026-12-31T23:59:59Z` not silently altered.

## BLE / transport (`/bluetooth/**`, `/transport/**`)
- [ ] Capability claims match `docs/BLE_SUPPORT_MATRIX.md` / capability matrix.
- [ ] Chunking/reassembly: a missing chunk cannot yield a valid decrypted payload.
- [ ] TTL/priority/outbox routing semantics preserved.

## storage (`IndexedDB` schema, migrations)
- [ ] Schema version bumped for shape changes; migration is reversible/tested.
- [ ] Append-only event log stays source of truth; views remain rebuildable.
- [ ] Replay DB / dedup window (30 days) intact.

## gateway / relay / simulator (`/gateway/**`, `/node-server/**`, `/sim/**`)
- [ ] Dedup invariant holds: same `(node, msgId)` never re-delivered after duplicate-drop.
- [ ] Malformed input is rejected, never crashes the process (parser safety).
- [ ] Deterministic simulation: same seed → identical output.

## UI / disaster UX (`/app/src/**`)
- [ ] Untrusted input rendered safely (no unsafe HTML sinks; JSON import can't inject).
- [ ] Key gen / send / receive / offline paths still work; no silent key loss on reset.
- [ ] Offline-first: no hard dependency on network for core flows.

## docs / spec
- [ ] Matches actual behavior; no over-claiming ("secure", "audited") without evidence.
- [ ] Cross-links to relevant spec still valid.

## tests
- [ ] Required perspectives covered where relevant: TTL/expiration, replay/resend,
      chunk-missing robustness, encrypt→send→decrypt mainline, key-gen E2E.
- [ ] Tests are deterministic; flaky handling per `docs/TEST_NAMING_AND_FLAKY_POLICY.md`.
- [ ] Tests were run; results in PR (or skip reason recorded).

## CI / security config
- [ ] No CI gate, SRI hash, or dependency pin loosened without human approval.
- [ ] `npm audit` / CodeQL / secrets-scan expectations still met.
