# Implementation Series Status

## Detected current phase state

- Phase 1 is **complete** (`spec/PROTOCOL_VNEXT.md`, `spec/STATE_MODEL.md`, scope decision, conformance vectors/tests).
- Phase 2 is **complete** (`transport/` boundary, BLE central adapter wrapping, Node peripheral reference path, retry/jitter policy, relay drill docs/tests).
- Phase 3 is **complete** (event-log runtime + anti-entropy sync engine + convergence tests).
- Phase 4 is **complete** (`gateway/` bridge service + duplicate/loop-safe island sync tests).
- Phase 5 was **partially complete** at preflight: simulator/model/property/fuzz artifacts existed, but unsafe sink reduction/audit still reported broad WARN-level findings without bounded allowlist policy.

## Active phase implemented in this task

- Implemented: **Phase 5** only (unsafe sink hardening + explicit audit narrowing).

## What was added

- Unsafe sink risk reduction in runtime code:
  - `app/src/main.js`: replaced `innerHTML` with `textContent` for KDF status rendering.
  - `app/src/i18n.js`: replaced direct HTML assignment with strict inline-markup gate (`<strong>`/`<br>` only, no attributes) and fallback to plain text.
- Unsafe sink audit hardening:
  - `tools/security-audit-check.js`: moved from broad sink WARN to explicit allowlist policy for reviewed `operator-panel` sinks, while preserving WARN for any non-allowlisted/new sink matches.

## Explicitly deferred

- No new speculative runtime transports.
- No browser BLE peripheral claims.
- No multi-client relay semantics.
- No CI gate expansion beyond reliable repository-local commands.
- No full operator-panel renderer rewrite in this task; existing `innerHTML` sinks remain narrowly allowlisted and escaped.

## Acceptance evidence

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:phase5`
- `node tools/security-audit-check.js`

## Next phase recommendation

- Phase 5 criteria are now satisfied with bounded unsafe sink audit posture; maintainers can proceed with incremental maintenance hardening only (no new core phase runtime changes required by this series in this task).

## Unresolved risks

- Energy metrics are currently simulation-derived, not hardware battery telemetry.
- Operator panel still uses two audited `innerHTML` sinks (escaped/template controlled); future refactor to DOM-node rendering would further reduce risk.
- Hardware smoke remains manual by design (truthful for environment); not elevated to CI gate.
