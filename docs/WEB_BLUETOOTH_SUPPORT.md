# Web Bluetooth Support Matrix

_Last updated: 2026-03-08_

This document summarizes practical support for the **Web Bluetooth API** used by Lifeline Mesh.

## Quick Summary

- ✅ **Best supported**: Chromium-based desktop browsers (Chrome / Edge) on Windows, macOS, ChromeOS, and some Linux environments.
- ⚠️ **Limited / partial**: Android Chrome support varies by device and BLE stack behavior.
- ❌ **Not supported**: Safari (iOS/iPadOS/macOS) and Firefox.

> If Bluetooth is unavailable, Lifeline Mesh can still relay encrypted payloads via Clipboard, File, and QR workflows.

## Browser / Platform Matrix

| Browser | Windows | macOS | Linux | Android | iOS/iPadOS | Notes |
|---|---|---|---|---|---|---|
| Google Chrome (Chromium) | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | Primary target for Web Bluetooth use. |
| Microsoft Edge (Chromium) | ✅ | ✅ | ⚠️ | N/A | ❌ | Similar behavior to Chrome desktop. |
| Brave / other Chromium forks | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | Often works, but permission/UI policies vary by release. |
| Firefox | ❌ | ❌ | ❌ | ❌ | ❌ | Web Bluetooth API is not enabled for production use. |
| Safari | ❌ | ❌ | N/A | N/A | ❌ | No production Web Bluetooth support. |

Legend:
- ✅ = generally available in stable builds
- ⚠️ = possible with caveats (flags, hardware, OS BLE stack, or vendor-specific behavior)
- ❌ = unavailable for practical production use

## Runtime Requirements

Web Bluetooth in Lifeline Mesh additionally requires:

1. **Secure context** (`https://` or `http://localhost` during development).
2. **User gesture** for `navigator.bluetooth.requestDevice(...)`.
3. Bluetooth adapter enabled and OS-level permissions granted.
4. Nearby BLE devices advertising expected service UUIDs.

## App Behavior in Lifeline Mesh

- The app checks support using `('bluetooth' in navigator)`.
- Unsupported browsers show a warning in the Bluetooth section.
- Messaging still works with non-BLE fallback transports.

## Troubleshooting Checklist

If BLE scanning or sending fails:

1. Confirm you are using Chrome/Edge in a secure context.
2. Verify OS Bluetooth permissions for the browser.
3. Ensure device distance/power conditions are suitable.
4. Disconnect and rescan from the app UI.
5. Use Clipboard / File / QR fallback if BLE remains unavailable.

## Manual 3-Device Relay Drill (A → B → C)

Use this drill after building the app to validate runtime relay wiring and UI state.

1. **Prepare identities**
   - On devices **A**, **B**, and **C**, open Lifeline Mesh, run **Generate / Load Keys**, and exchange contacts.
2. **Establish first BLE hop (A ↔ B)**
   - On **B**, open Bluetooth Relay section and connect to **A**.
   - Confirm **B** shows a connected peer and Mesh Relay state panel is populated.
3. **Send A → B**
   - On **A**, encrypt a direct message for **C** and send over BLE to **B**.
   - On **B**, confirm inbound message appears in BLE received list and relay state updates (`seenTransfers`, `lastRelayEvent`).
4. **Establish second BLE hop (B ↔ C)**
   - Connect **B** to **C** (or attach a second relay-capable link for C as your platform allows).
   - Confirm **B** relay state shows both peer paths available for forwarding.
5. **Validate relay B → C**
   - Re-send from **A** (or replay from outbox on **B**) and verify **C** receives/decrypts.
   - On **B**, verify `forwardedCount` increments and `lastRelayEvent` becomes `forwarded`.
6. **Negative-path check**
   - Disconnect **C** and send A → B again.
   - Confirm **B** relay state records `no-egress-peer` and increments `droppedNoEgressCount`.

## Maintenance Guidance

Browser BLE behavior changes over time. Revalidate periodically:

- Major Chrome / Edge release cycles.
- New platform versions (Windows/macOS/Android).
- Hardware-specific BLE regressions reported by users.
