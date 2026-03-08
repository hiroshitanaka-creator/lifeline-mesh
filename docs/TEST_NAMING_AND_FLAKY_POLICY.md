# Test Naming & Flaky Policy

## Scope
- Unit: `crypto/test.js`, `tools/validate-test-vectors.js`
- Integration: `tests/integration/*.test.js`
- E2E: `tests/e2e/*.spec.js`

## Naming conventions

### Unit / Integration
- Use: `test("<layer>: <behavior>", ...)`
- Format:
  - `<layer>`: `unit` or `integration`
  - `<behavior>`: expected system behavior in plain English
- Example:
  - `test("integration: missing BLE chunk does not emit complete message", ...)`

### E2E (Playwright)
- Use: `test("e2e: <user flow>", ...)` for newly added scenarios.
- For legacy names, update when touching the test.
- Include start/end state in title:
  - `e2e: key generation -> encrypt -> decrypt roundtrip`

## Failure triage categories
- `infra`: test environment/tooling issue (browser install, port binding, permission).
- `timing`: race/timeout-dependent failure.
- `logic`: deterministic product bug.
- `data`: fixture/vector/input corruption.

## Flaky handling process
1. Re-run once locally and once in CI.
2. If reproduced inconsistently, tag as `timing` and collect artifacts.
3. Must attach evidence:
   - Playwright: screenshot + trace + video/report
   - Integration: captured stdout/stderr log
4. Open issue with:
   - failing test name
   - first bad commit (if known)
   - failure category (`infra`/`timing`/`logic`/`data`)
   - mitigation plan and owner
5. Temporary quarantine is allowed only when:
   - issue is filed,
   - owner is assigned,
   - removal date is set.

## CI artifact policy
- On CI failure, upload:
  - `playwright-report/`, `test-results/`
  - `artifacts/integration-test.log`
- Keep artifacts enabled for all pull requests.
