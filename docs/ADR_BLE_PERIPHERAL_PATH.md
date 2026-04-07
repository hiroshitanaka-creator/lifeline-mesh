# ADR: BLE Peripheral First Supported Path (v0.1.x Freeze)

- Status: **Accepted**
- Date: **2026-04-07**
- Decision owner: BLE peripheral strategy architect
- Scope: repository truth freeze for BLE peripheral/mobile gap

## Context

Current repository truth:

- Browser/mobile BLE peripheral mode is still unresolved.
- `transport/native-peripheral-contract.js` is explicitly contract-only and reports `shipped: false`.
- Node peripheral backend (`bluetooth/backends/node-bleno.js`) is the only implemented peripheral runtime path.
- README has previously called browser-side peripheral work a high-priority open contribution.

The project needs one unambiguous first supported path for v0.1.x so implementation and validation can proceed without architecture drift.

## Candidate strategies evaluated

### A) Capacitor Android BLE peripheral host

Pros:
- Could eventually provide a mobile-native peripheral endpoint.

Cons:
- Requires adding a mobile app/runtime surface that does not exist in this repo.
- Adds Android build, plugin, and release pipeline burden.
- Hard to verify in current CI shape (device/emulator BLE peripheral validation is non-trivial).
- Expands permission/security surface (native bridge + app lifecycle).

### B) Android companion app / WebView bridge

Pros:
- Could separate native BLE from browser UI.

Cons:
- Introduces a second deployable artifact and protocol bridge to maintain.
- Larger trust boundary and IPC attack surface than current architecture.
- Testability burden is high (WebView + native bridge integration harness required).
- Operator deployment complexity rises (install/configure/keep in sync two apps).

### C) Node relay appliance is the only officially supported peripheral endpoint for v0.1.x; mobile remains experimental

Pros:
- Matches what is actually implemented and tested today.
- Minimal dependency delta (no new mobile stack required to ship honest support).
- Existing integration tests and runbooks already exercise this path.
- Smaller near-term maintenance/security scope versus native bridge options.
- Operationally usable now: a dedicated relay node can be staged as an appliance.

Cons:
- Does **not** close the browser/mobile peripheral gap.
- Requires operators to provision a Node-capable relay device.

## Decision

**Chosen strategy: C**

For **v0.1.x**, the first and only officially supported BLE peripheral endpoint is:

- **Node relay appliance path** via `bluetooth/backends/node-bleno.js` and `node-server/`.

Mobile/browser peripheral modes remain:

- **Contract-only** where explicitly stubbed (`transport/native-peripheral-contract.js`).
- **Experimental / not shipped** for Capacitor or WebView bridge concepts.

> This decision **operationally bypasses** the mobile peripheral gap; it does **not** close it.

## Capability status definitions

- **Shipped now**: implemented in repo, documented as supported, and validated by current gates/runbooks.
- **Contract-only**: interface exists but runtime behavior intentionally non-functional for production.
- **Experimental**: exploratory direction; not part of supported operator baseline.

## Threat model and trust boundaries

### Trust boundaries

1. **Endpoint app boundary** (browser app runtime)
2. **Peripheral host boundary** (Node relay appliance process + OS permissions)
3. **BLE radio boundary** (local wireless adversary model)
4. **Store boundary** (relay durable store / pending-delivered message state)

### Key security implications of chosen path

- Node appliance becomes a high-value local infrastructure component and must be treated as semi-trusted transport infrastructure (not a plaintext trusted party for crypto contents).
- BLE metadata and traffic timing remain observable; cryptographic payload confidentiality/integrity guarantees are unchanged.
- Compromise of appliance can impact availability and relay behavior, so operator hardening (least privilege, controlled host, update policy) is mandatory.

## Validation strategy

For this architecture freeze, required repository gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`

Operational validation reference remains the Node-peripheral runbook path (`docs/BLE_MANUAL_VALIDATION_RUNBOOK.md`, `docs/RELAY_DRILL_AB_C.md`, `docs/HARDWARE_SMOKE_PATH.md`).

## Success criteria

### “Gap narrowed” criteria

All must be true:

1. One explicit supported path is frozen and documented (this ADR).
2. README/docs cleanly separate shipped vs contract-only vs experimental.
3. Contributors can implement next-step tasks without ambiguity about v0.1.x support claims.

### “Gap closed” criteria

All must be true:

1. At least one mobile/browser peripheral runtime is implemented (not stub-only).
2. It is covered by repeatable automated and hardware validation.
3. Security/trust-boundary impacts are documented and accepted.
4. README support claims are updated from experimental to shipped with evidence.

Until those criteria are met, mobile/browser peripheral support is **not closed**.
