# Security Audit Report

> **Dated snapshot — not current truth.**
> This report was generated at Phase 15 (2026-03-09). Multiple security fixes have been applied
> since then (XSS in BLE error handling, stored XSS in status rendering, QR script CSP hardening,
> group membership enforcement on decrypt, replay cache ordering fix). See git log for details.
> The findings below reflect the state at time of generation; line numbers and risk levels may differ.

- Generated: 2026-03-09T04:35:36.970Z
- Scope: Phase 15 security audit preparation

| Check | Status | Details | Command |
|---|---|---|---|
| Dependency audit (root) | ⚠️ WARN | non-zero exit (1) | `npm audit --audit-level=high --json` |
| Dependency audit (crypto) | ⚠️ WARN | non-zero exit (1) | `npm audit --prefix crypto --audit-level=high --json` |
| Dependency audit (tools) | ⚠️ WARN | non-zero exit (1) | `npm audit --prefix tools --audit-level=high --json` |
| Lint baseline | ✅ PASS | completed successfully | `npm run lint` |
| Compatibility policy gate | ✅ PASS | completed successfully | `npm run check:compat` |
| Unsafe sink scan (innerHTML/eval) | ⚠️ WARN | potential unsafe sink usage found; review matches | `rg -n innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\(|eval\( app/src crypto bluetooth` |

## Unsafe sink scan matches (as of Phase 15 snapshot)

```text
app/src/main.js:787:  document.getElementById("recipient-select").innerHTML = `<option ...>`;
app/src/main.js:788:  document.getElementById("group-select").innerHTML = `<option ...>`;
app/src/main.js:880:  sel.innerHTML = `<option ...>`;
app/src/main.js:896:    groupMemberSel.innerHTML = `<option ...>`;
app/src/main.js:936:  sel.innerHTML = `<option ...>`;
app/src/main.js:1256:  qrContainer.innerHTML = "";
app/src/ui-utils.js:6:  statusEl.innerHTML = ... + msg;  ← FIXED post-Phase-15
```

**Post-Phase-15 status:**
- `app/src/ui-utils.js` line 6 (`statusEl.innerHTML`): **Fixed** — replaced with safe DOM text
  methods; `app/src/ui-utils.js` no longer contains `innerHTML`.
- `app/src/main.js` option-reset usages: **Remain** — these assign only static literal strings
  (`<option value="">Select …</option>`), not user-controlled data. Risk is low; no XSS vector.
- `app/src/main.js:1256` (`qrContainer.innerHTML = ""`): **Remains** — clears the element; safe.

Current sink count: 6 in `app/src/main.js` (all static literals or clears), 0 in `ui-utils.js`.
