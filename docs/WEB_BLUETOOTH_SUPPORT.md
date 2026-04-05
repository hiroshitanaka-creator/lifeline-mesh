# Web Bluetooth Support Matrix

_Last updated: 2026-04-05_

This document summarizes practical support for the **Web Bluetooth API** used by Lifeline Mesh.

For contributor hardware verification steps, use the dedicated runbook:
- [`docs/BLE_MANUAL_VALIDATION_RUNBOOK.md`](./BLE_MANUAL_VALIDATION_RUNBOOK.md)

## Quick Summary

- ✅ **Best supported**: Chromium-based desktop browsers (Chrome / Edge) on Windows, macOS, ChromeOS, and some Linux environments.
- ⚠️ **Limited / partial**: Android Chrome support varies by device and BLE stack behavior.
- ❌ **Not supported**: Safari (iOS/iPadOS/macOS) and Firefox.
- ℹ️ **Important**: BLE is optional in Lifeline Mesh. Clipboard/File/QR relay remains the baseline fallback path.

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

Without these requirements, BLE UI actions will not work even if encryption/decryption works normally.

## App Behavior in Lifeline Mesh

- The app checks support using `('bluetooth' in navigator)`.
- Unsupported browsers show a warning in the Bluetooth section.
- Messaging still works with non-BLE fallback transports.

## Manual 3-Device Multi-Link Runtime Drill (A ↔ B ↔ C)

Use this drill to validate active multi-link forwarding, route advertisements, and runtime observability.

1. **Prepare three devices**:
   - Device A, B, C open Lifeline Mesh over HTTPS (or localhost).
   - On each device, run **Generate / Load Keys**.
2. **Establish links from B to both peers**:
   - On B, connect to A and C (maintain two active links if platform allows).
   - Confirm operator panel/runtime view on B shows `linkCount >= 2`, `routingEnabled: true`, and both peers listed in `links`.
3. **Validate A → B receive path**:
   - Send A → B via Bluetooth and confirm inbox update on B.
4. **Validate B relay to C**:
   - While both links are active, send a forwardable payload from A.
   - Confirm on B: `relayAttempts` increments and `relayedCount` increases (not only `skipped`).
   - Confirm on C the relayed payload arrives and decrypts.
5. **Validate route advertisement activity**:
   - Wait one broadcast interval (~30s) or trigger route activity, then confirm `routeAdvBroadcasts` increments on B.

If your device/browser cannot sustain dual active links, use the Node relay server (`node-server/server.js`) to validate relay behavior with controlled single-client sessions and persistent replay.

## Troubleshooting Checklist

If BLE scanning or sending fails:

1. Confirm you are using Chrome/Edge in a secure context.
2. Verify OS Bluetooth permissions for the browser.
3. Ensure device distance/power conditions are suitable.
4. Disconnect and rescan from the app UI.
5. Use Clipboard / File / QR fallback if BLE remains unavailable.

## Maintenance Guidance

Browser BLE behavior changes over time. Revalidate periodically:

- Major Chrome / Edge release cycles.
- New platform versions (Windows/macOS/Android).
- Hardware-specific BLE regressions reported by users.
