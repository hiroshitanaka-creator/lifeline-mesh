# Module Dependency Map (Phase 1)

This document defines the primary call graph for the app runtime and clarifies boundaries introduced in Phase 1.

## Runtime flow (single path)

```text
app/index.html (UI markup only)
  -> app/src/main.js (UI event wiring + service orchestration)
    -> app/src/worker-client.js (heavy crypto offload)
      -> app/src/workers/crypto-worker.js
        -> crypto/core.js

app/src/main.js
  -> app/src/db.js (app-facing storage facade)
    -> crypto/store.js (IndexedDB implementation)

app/src/main.js
  -> crypto/group.js (group sender-key operations)
  -> bluetooth/ble-manager.js (BLE transport)
```

## Boundary rules

- `app/index.html`
  - Owns **markup and static style only**.
  - Must not contain business logic (`onclick`, `onchange`, encryption, storage calls).
- `app/src/main.js`
  - Owns UI orchestration and user flow state transitions.
  - Calls through to services (`crypto/*`, `bluetooth/*`, `db.js`).
- `app/src/db.js`
  - Owns app-local stable import surface for storage.
  - Delegates all IndexedDB details to `crypto/store.js`.
- `crypto/store.js`
  - Owns database schema, migration, and persistence primitives.

## Notes

- The UI entry has been consolidated to `index.html -> main.js`, removing inline event handlers and reducing duplicate behavior paths.
- New UI actions should be added via `data-action` in HTML and mapped in `bindUIActions()` in `main.js`.
