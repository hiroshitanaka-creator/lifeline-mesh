# Security Audit Report

- Generated: 2026-04-05T02:57:19.885Z
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
app/src/main.js:1244:  document.getElementById("recipient-select").innerHTML = `<option value="">${tr('contacts.recipient.placeholder')}</option>`;
app/src/main.js:1245:  document.getElementById("group-select").innerHTML = `<option value="">${tr('encrypt.group.select')}</option>`;
app/src/main.js:1346:  sel.innerHTML = `<option value="">Select Recipient</option>`;
app/src/main.js:1362:    groupMemberSel.innerHTML = `<option value="">Select Contact</option>`;
app/src/main.js:1427:  sel.innerHTML = `<option value="">Select Group</option>`;
app/src/main.js:1780:  qrContainer.innerHTML = "";
app/src/main.js:1938:  el.innerHTML = tr(key);
app/src/operator-panel.js:428:      inner.innerHTML = renderPanel(snapshot, outboxStats, maintenanceStats, policy);
app/src/operator-panel.js:430:      inner.innerHTML = `<div class="lm-op-empty">Error rendering panel: ${esc(err instanceof Error ? err.message : String(err))}</div>`;
app/src/i18n.js:358:        el.innerHTML = t(key);
```
