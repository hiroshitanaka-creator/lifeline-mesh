# PR #158 Triage Report

- Date: 2026-04-07
- Repository: `hiroshitanaka-creator/lifeline-mesh`
- Reviewed PR: #158 (`feat: implement phases 1-5 — post-quantum hybrid, CRDT sync, LoRa transport, chaos engineering`)
- Base: `ef5642b4d6502fa8e52ec587579083c3af30eca6`
- Merge commit audited: `8ae35a4c935c5960d73a47c6860d634577b985e7`

## 1) File-by-file classification (KEEP / DELETE / DOWNGRADE_TO_DOC)

| File | Classification | Action | Reason |
|---|---|---|---|
| `.github/workflows/hardware-smoke.yml` | DELETE | Removed | Hardware/chaos workflow was speculative and not part of current validated CI truth. |
| `app/src/emergency-ui/index.js` | DELETE | Removed | Unwired runtime path; not part of current integrated app flow or tested gates. |
| `app/src/emergency-ui/panic-mode.js` | DELETE | Removed | Same as above; feature branch code without dependency/test/doc completeness. |
| `app/src/operator-panel.js` | DELETE (partial) | Reverted to base truth | Rolled back worker/Leaflet extensions; preserved established operator panel behavior only. |
| `bluetooth/ble-manager.js` | DELETE (partial) | Reverted to base truth | Removed LoRa backend/runtime expansion and TODO-path abstractions from shipped path. |
| `bluetooth/mesh-router.js` | DELETE (partial) | Reverted to base truth | Removed Phase3/Bloom/ETX runtime additions; retained current Phase1/2 tested routing path. |
| `crypto/audit.js` | DELETE | Removed | PQ/v2-oriented checks created non-current gate semantics and false-positive risk. |
| `crypto/store.js` | DELETE (partial) | Reverted to base truth | Removed CRDT/Yjs/Bloom extensions not validated as current runtime truth. |
| `docs/RELEASE_READINESS_REPORT_v2.md` | DELETE | Removed | v2 readiness claim conflicted with current implementation/dependencies/tests. |
| `node-server/relay-node.js` | DELETE (partial) | Reverted to base truth | Removed LevelDB/multi-client relay changes; restored single-client relay truth. |
| `package.json` | DELETE (partial) | Reverted to base truth | Removed non-current scripts (`audit:pq`, `migrate:crdt`, `chaos:*`, backup gate coupling, release check). |
| `spec/PROTOCOL.md` | DELETE (partial) | Reverted to base truth | Removed protocol v2/PQ mandatory truth; restored current v1/v1.1 protocol spec. |
| `spec/THREAT_MODEL.md` | DELETE (partial) | Reverted to base truth | Removed v2/PQ-mandatory framing from current threat model truth. |
| `spec/group-crdt.md` | DELETE | Removed | Spec-first CRDT proposal without matching current runtime/deps/tests. |
| `tools/bridge/meshtastic-converter.js` | DELETE | Removed | Speculative runtime bridge not wired/tested as current path. |
| `tools/chaos/*` | DELETE | Removed | Not part of current CI or validate truth; removed from mainline runtime/tool gate surface. |
| `tools/firmware/lifeline-esp32.ino` | DELETE | Removed | Hardware-side speculative addition outside current validated implementation scope. |
| `tools/migrate-v1-backup.js` | DELETE | Removed | Migration/check gate path not validated against current import/export truth. |
| `transport-layer/hybrid-backhaul.js` | DELETE | Removed | Speculative Starlink/LTE/TAK runtime not part of dependency-complete tested implementation. |

## 2) Cleanup後に main に残した current truth

- Protocol/spec truth is restored to v1/v1.1 implementation-aligned behavior.
- Runtime BLE mesh/relay/operator paths are restored to the previously tested base implementation.
- Validation scripts are restored to honest local/CI gates (`lint`, `typecheck`, `test:unit`, `test:integration`, compat, E2E smoke/CI split).
- No undeclared speculative dependencies are required by shipped runtime paths.

## 3) Future workへ降格した項目（runtimeから分離）

The following remain as **future work ideas only** and are not current implementation truth:

- Post-quantum hybrid/HNDL enhancements
- ETX/Bloom advanced routing
- Transport adapter expansion (LoRa/Meshtastic)
- Multi-client relay architecture
- Panic-mode UX and hardware smoke plans
- Chaos engineering scenario suites

## 4) 安全な実装順序（提案）

1. Add one future feature at a time behind explicit experimental docs and isolated tests.
2. Introduce dependencies first (lockfile + security review), then wire minimal runtime.
3. Add integration tests that prove end-to-end behavior before spec promotion.
4. Promote docs/spec only after runtime + deps + tests are green in the same branch.
5. Keep validation gates honest: no TODO-path runtime and no speculative scripts in `validate`.
