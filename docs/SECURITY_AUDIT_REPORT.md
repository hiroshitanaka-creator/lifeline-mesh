# Security Audit Report

- Generated: 2026-03-16T10:27:29.399Z
- Scope: Phase 15 security audit preparation

| Check | Status | Details | Command |
|---|---|---|---|
| Dependency audit (root) | ✅ PASS | completed successfully | `npm audit --audit-level=high --json` |
| Dependency audit (crypto) | ✅ PASS | completed successfully | `npm audit --prefix crypto --audit-level=high --json` |
| Dependency audit (tools) | ✅ PASS | completed successfully | `npm audit --prefix tools --audit-level=high --json` |
| Lint baseline | ✅ PASS | completed successfully | `npm run lint` |
| Compatibility policy gate | ✅ PASS | completed successfully | `npm run check:compat` |
| Unsafe sink scan (innerHTML/eval) | ⚠️ WARN | potential unsafe sink usage found; review matches | `rg -n innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML\(|eval\( app/src crypto bluetooth` |

## Unsafe sink scan matches
```text
app/src/main.js:909:  document.getElementById("recipient-select").innerHTML = `<option value="">Select Recipient</option>`;
app/src/main.js:910:  document.getElementById("group-select").innerHTML = `<option value="">Select Group</option>`;
app/src/main.js:1002:  sel.innerHTML = `<option value="">Select Recipient</option>`;
app/src/main.js:1018:    groupMemberSel.innerHTML = `<option value="">Select Contact</option>`;
app/src/main.js:1058:  sel.innerHTML = `<option value="">Select Group</option>`;
app/src/main.js:1384:  qrContainer.innerHTML = "";
```
