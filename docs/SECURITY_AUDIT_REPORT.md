# Security Audit Report

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

## Unsafe sink scan matches
```text
app/src/main.js:787:  document.getElementById("recipient-select").innerHTML = `<option value="">Select Recipient</option>`;
app/src/main.js:788:  document.getElementById("group-select").innerHTML = `<option value="">Select Group</option>`;
app/src/main.js:880:  sel.innerHTML = `<option value="">Select Recipient</option>`;
app/src/main.js:896:    groupMemberSel.innerHTML = `<option value="">Select Contact</option>`;
app/src/main.js:936:  sel.innerHTML = `<option value="">Select Group</option>`;
app/src/main.js:1256:  qrContainer.innerHTML = "";
app/src/ui-utils.js:6:  statusEl.innerHTML = (ok ? `<span class="ok">✓ OK</span> ` : `<span class="ng">✗ ERROR</span> `) + msg;
```
