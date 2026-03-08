# UI Migration Guide (old inline UI -> unified main.js path)

This runbook documents the non-breaking migration from inline DOM handlers to centralized UI orchestration.

## Why

To reduce blast radius and make behavior testable, all business logic should execute through:

`UI entry -> app/src/main.js -> services (crypto/store/BLE)`

## Migration steps

1. **Replace inline handlers in HTML**
   - Replace `onclick="..."` / `onchange="..."` with `data-action="..."`.
   - Keep element IDs and labels unchanged for test compatibility.

2. **Register action in `main.js`**
   - Add the action mapping to `bindUIActions()`.
   - Mapping should invoke existing `window.*` functions to preserve external test hooks.

3. **Radio/selector changes**
   - For mode switches (e.g., direct/group), bind listeners in `bindUIActions()`.
   - Keep logic in `setMessageMode()`.

4. **Regression checks**
   - Run integration and E2E suites.
   - Confirm key user flow still works: keys -> contact -> encrypt -> decrypt -> BLE mock boundary.

## Rollback procedure

If a UI action stops working after migration:

1. Check `data-action` in `index.html` matches key in `bindUIActions()`.
2. Confirm corresponding `window.<action>` function exists.
3. Re-run `npm run test:e2e:playwright` for quick reproduction.
4. If urgent rollback is needed, restore previous `index.html` and `main.js` from last green commit.

## Compatibility note

Current implementation keeps public `window.*` methods to avoid breaking test harnesses and debug tooling while still removing logic from HTML.
