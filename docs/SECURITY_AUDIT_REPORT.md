# Security Audit Report

- Generated: 2026-04-07T13:27:06.919Z
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
app/src/i18n.js:358:        el.innerHTML = t(key);
app/src/operator-panel.js:428:      inner.innerHTML = renderPanel(snapshot, outboxStats, maintenanceStats, policy);
app/src/operator-panel.js:430:      inner.innerHTML = `<div class="lm-op-empty">Error rendering panel: ${esc(err instanceof Error ? err.message : String(err))}</div>`;
app/src/main.js:2494:  el.innerHTML = tr(key);
```
