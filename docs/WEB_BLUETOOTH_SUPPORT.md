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

## Manual 3-Device Drill (A → B → C)

Use this drill to validate current relay wiring behavior in the app runtime.

> Current runtime note: the app uses a single active BLE link at a time. When B only has the ingress link, relay state should show `no-egress-peer`.

1. On **A**, **B**, and **C**, open the app and run **Generate / Load Keys**.
2. Exchange contacts so A can encrypt to C.
3. Connect **B** to **A** via BLE and send A → B (recipient C).
4. On **B**, check **Mesh Relay Runtime State**:
   - `seenTransfers` increments.
   - `lastRelayEvent` becomes `no-egress-peer` if no second link exists.
5. Disconnect B from A, connect **B** to **C**, then repeat the message flow with manual transfer as needed.
6. Confirm C can decrypt and B state updates per connection changes.

## Maintenance Guidance

Browser BLE behavior changes over time. Revalidate periodically:

- Major Chrome / Edge release cycles.
- New platform versions (Windows/macOS/Android).
- Hardware-specific BLE regressions reported by users.
