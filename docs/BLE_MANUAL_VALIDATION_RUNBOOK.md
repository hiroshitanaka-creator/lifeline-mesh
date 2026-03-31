# BLE Manual Validation Runbook

_Last updated: 2026-03-31_

This runbook gives contributors a repeatable checklist to validate **real hardware BLE behavior** for Lifeline Mesh.

> Scope: Manual verification only. This document does **not** claim automated or hardware CI validation.

## 1) Preconditions

- Browser: Chrome or Edge stable (latest).
- Origin: `https://...` deployment or `http://localhost` dev server.
- Bluetooth enabled at OS level, browser Bluetooth permissions granted.
- At least 2 devices (3 devices recommended for relay/runtime observability checks).
- On each device: open app, click **Generate / Load Keys** once.

## 2) Validation Matrix

Record each scenario with date, OS/browser version, and device model.

| ID | Scenario | Devices | Expected Result | Status |
|---|---|---|---|---|
| BLE-01 | Scan + connect | 2 | `Connected via Bluetooth` status appears on initiating device. | ☐ |
| BLE-02 | Direct send while connected | 2 | Receiver inbox updates and decrypt succeeds. | ☐ |
| BLE-03 | Offline enqueue | 2 | Sender shows `queued in Outbox` while disconnected. | ☐ |
| BLE-04 | Reconnect + manual flush | 2 | `Outbox flush completed` and queued messages clear. | ☐ |
| BLE-05 | App reload resume | 2 | Queued outbox entries remain visible after reload. | ☐ |
| BLE-06 | Runtime relay observability | 3 | Runtime counters show relay attempt/skipped reasons as documented. | ☐ |
| BLE-07 | Fallback path | 2 | Clipboard/File/QR flow works when BLE is unavailable. | ☐ |

## 3) Step-by-step Procedure

### BLE-01: Scan + connect
1. On sender device, click **Scan for Devices**.
2. Select the target device.
3. Confirm app status indicates BLE connection success.

### BLE-02: Direct send while connected
1. Add recipient contact on sender.
2. Encrypt a short test message.
3. Click **Send Last Encrypted via Bluetooth**.
4. On receiver, confirm message is received and decryptable.

### BLE-03: Offline enqueue
1. Disconnect BLE (or move devices out of range).
2. Encrypt a message.
3. Click send via Bluetooth.
4. Confirm status indicates message queued in Outbox.

### BLE-04: Reconnect + manual flush
1. Reconnect BLE.
2. Click **Flush queued messages now**.
3. Confirm flush success status and outbox reduction.

### BLE-05: App reload resume
1. Ensure at least one queued outbox entry exists.
2. Reload the app tab.
3. Confirm queued entries still appear in Outbox Snapshot.

### BLE-06: Runtime relay observability (3-device sequential link drill)
1. Use devices A, B, C.
2. Connect B↔A and verify runtime state fields (connected peer, counters).
3. Connect B↔C and repeat checks.
4. Trigger forwardable traffic and confirm skipped reason/counters update as expected for current single-link runtime.

### BLE-07: Fallback path
1. Disable BLE or switch to unsupported browser.
2. Exchange encrypted payload via Clipboard or File.
3. Confirm decrypt still succeeds.

## 4) Result Template

Use this template in PR comments or issue reports:

```text
BLE validation run: YYYY-MM-DD
Environment:
- Device(s):
- OS:
- Browser/version:
- Origin: https://... or http://localhost

Results:
- BLE-01: PASS/FAIL (notes)
- BLE-02: PASS/FAIL (notes)
- BLE-03: PASS/FAIL (notes)
- BLE-04: PASS/FAIL (notes)
- BLE-05: PASS/FAIL (notes)
- BLE-06: PASS/FAIL (notes)
- BLE-07: PASS/FAIL (notes)

Observed issues:
- ...
```

## 5) Failure triage checklist

- Verify secure context and browser support first.
- Re-check OS Bluetooth permissions and adapter state.
- Capture outbox/inbox snapshots and status text.
- Retry with reduced distance/interference.
- If still failing, attach environment details + run template above to issue/PR.
