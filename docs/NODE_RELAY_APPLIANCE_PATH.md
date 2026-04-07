# Node Relay Appliance Path (v0.1.x first supported BLE peripheral endpoint)

Last updated: **2026-04-07**

This document defines the **only officially supported BLE peripheral endpoint** for v0.1.x:

- Node host running `node-server/server.js`
- Peripheral backend `bluetooth/backends/node-bleno.js`
- Single-client relay runtime `node-server/relay-node.js`

This path **operationally bypasses** the browser/mobile peripheral gap. It does **not** close it.

## 1) Support boundary (truthful)

### Supported now
- Browser app as BLE central/client.
- Node relay appliance as BLE peripheral endpoint.

### Not supported (do not claim as shipped)
- Browser-native BLE peripheral mode.
- iOS/Android peripheral host mode.
- Capacitor/WebView peripheral bridge runtime.

Contract-only evidence: `transport/native-peripheral-contract.js` (`shipped: false`).

## 2) Operator install + run

Prerequisites (Linux host with BLE adapter):

```bash
sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
```

From repository root:

```bash
npm ci
cd node-server
npm ci
node server.js
```

Optional:

- `LIFELINE_NAME=LifelineMesh-B node server.js` to set advertised device name.
- `LIFELINE_RELAY_STORE=/absolute/path/relay-store.json node server.js` to set store path.
- `LIFELINE_RELAY_DIAG=1 node server.js` to enable relay diagnostics logs.

## 3) Operator workflow (A↔B↔C)

1. Start relay appliance on Node host B (`node node-server/server.js`).
2. Connect browser node A to B and send encrypted payload(s).
3. Disconnect A and connect browser node C to B.
4. Verify C receives pending payload replay from B.
5. Verify duplicate `msgId` entries do not resurface during drill window.

Reference drill: `docs/RELAY_DRILL_AB_C.md`.

## 4) Validation path

Required repository gates:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
```

Path-focused relay validation:

```bash
npm run test:relay-appliance
```

Coverage includes:
- lifecycle/connectivity and replay on reconnect
- message send/receive persistence path
- duplicate suppression (`msgId` dedupe)
- failure-mode retry behavior (flush failure remains pending, retried on reconnect)

## 5) Manual hardware validation

- `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md`
- `docs/HARDWARE_SMOKE_PATH.md`

For real hardware smoke harness on Linux/BlueZ:

```bash
node node-server/manual-smoke.js --non-interactive --status-file artifacts/real-bleno-smoke.json --json
```

