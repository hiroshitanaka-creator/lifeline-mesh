# Security Policy

## Reporting a Vulnerability
Please do not open public issues for security reports.
Use GitHub private vulnerability reporting, or contact the maintainers.

## Scope
- Crypto implementation bugs
- Signature verification / replay issues
- Key handling / storage issues

## Non-goals
- Social engineering or account recovery

## Periodic Security Review Checklist
Run this checklist at least once per release cycle (or monthly for long-lived branches).

### 1) Key protection and secret handling
- [ ] Confirm private keys remain confined to browser storage and are never emitted to logs, telemetry, or relay payloads.
- [ ] Verify backup/export paths are explicitly user-driven and documented with clear warnings.
- [ ] Re-check reset/recovery flows to ensure they do not silently discard keys without user confirmation.

### 2) XSS and content injection defenses
- [ ] Review UI rendering paths for untrusted input; avoid unsafe HTML sinks and ensure text is escaped.
- [ ] Re-test copy/paste and JSON import flows for script injection vectors.
- [ ] Validate CSP/service-worker behavior after front-end changes that touch asset loading or dynamic content.

### 3) Dependency and supply-chain hygiene
- [ ] Run `npm audit` (root, `crypto/`, `tools/`) and triage all high/critical findings.
- [ ] Update pinned dependencies for security patches and re-run `npm run validate`.
- [ ] Review CI actions versions and lockfiles for unexpected drift.
