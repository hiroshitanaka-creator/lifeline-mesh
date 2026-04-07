# Security Audit Report

- Generated: 2026-04-07T15:04:14.785Z
- Scope: Phase 5 unsafe sink risk reduction + audit

| Check | Status | Details | Command |
|---|---|---|---|
| Dependency audit (root) | ⚠️ WARN | non-zero exit (1) | `npm audit --audit-level=high --json` |
| Dependency audit (crypto) | ⚠️ WARN | non-zero exit (1) | `npm audit --prefix crypto --audit-level=high --json` |
| Dependency audit (tools) | ⚠️ WARN | non-zero exit (1) | `npm audit --prefix tools --audit-level=high --json` |
| Lint baseline | ✅ PASS | completed successfully | `npm run lint` |
| Compatibility policy gate | ✅ PASS | completed successfully | `npm run check:compat` |
| Unsafe sink scan (innerHTML/eval) | ✅ PASS | no direct unsafe sink pattern detected | `rg -n innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\(|eval\( app/src crypto bluetooth` |
