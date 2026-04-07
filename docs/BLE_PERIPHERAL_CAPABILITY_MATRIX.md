# BLE Peripheral Capability Matrix (v0.1.x)

Last updated: **2026-04-07**

This matrix is the source of truth for BLE **peripheral-side** capability status.

## Status legend

- **Shipped**: supported and documented for operators now.
- **Contract-only**: interface/stub exists, runtime support not shipped.
- **Experimental**: idea/prototype direction only; no supported runtime claim.

## Matrix

| Path | Runtime location | Status | Shipped in v0.1.x | Notes |
|---|---|---|---|---|
| Node peripheral backend (`node-bleno`) | Node host / relay appliance | **Shipped** | **Yes (first supported path)** | Implemented reference path for BLE peripheral endpoint. |
| Native peripheral contract (`transport/native-peripheral-contract.js`) | App transport boundary contract | **Contract-only** | No | Explicit stub with `shipped: false`; non-functional by design in v0.1.x. |
| Capacitor Android BLE peripheral host | Android native app host | **Experimental** | No | Candidate direction; not implemented in this repository. |
| Android companion app + WebView bridge | Separate Android companion runtime | **Experimental** | No | Candidate direction; no shipped bridge/runtime contract validation. |
| iOS peripheral host claims | iOS native/WebView | **Not claimed** | No | No proven implementation evidence in this repo; no support claim. |

## What is shipped now

- BLE central/client flows in supported Web Bluetooth environments.
- Node peripheral endpoint path (`node-bleno`) as the only supported BLE peripheral host.

## What is contract-only

- `NativePeripheralContractLink` contract stub for native/mobile peripheral integration.

## What is experimental

- Mobile-native peripheral hosting strategies (Capacitor/WebView bridge variants).

## First supported path (frozen)

- **Node relay appliance as the only officially supported peripheral endpoint for v0.1.x.**

## Trust boundary summary

- Browser endpoint logic, Node relay appliance, and BLE radio channel are separate trust zones.
- End-to-end cryptography protects message contents; relay/peripheral hosts still influence availability and metadata exposure.

## Validation summary

Architecture/docs freeze validation gates:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:integration`

“Gap narrowed” vs “gap closed” definitions are specified in `docs/ADR_BLE_PERIPHERAL_PATH.md`.
