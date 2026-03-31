# Web Bluetooth Support Matrix

_Last updated: 2026-03-08_

This document summarizes practical support for the **Web Bluetooth API** used by Lifeline Mesh.

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

## Manual 3-Device Single-Link Runtime Drill (A → B → C)

Use this drill to validate router wiring and runtime state visibility in real hardware conditions.

1. **Prepare three devices**:
   - Device A, B, C open Lifeline Mesh over HTTPS (or localhost).
   - On each device, run **Generate / Load Keys**.
2. **Build a linear topology**:
   - Connect B to A via Bluetooth and verify B shows `connectedPeerId` for A in **Mesh Relay / Route Runtime**.
   - Disconnect, then connect B to C and verify the same state updates for C.
   - (Because Web Bluetooth is client-only in this phase, you validate links sequentially.)
3. **Send A → B**:
   - On A, encrypt a message and send via Bluetooth to B.
   - On B, verify message appears in **Received Messages via Bluetooth** and `seenMessages` increments in the mesh runtime panel.
4. **Forward-decision observability on B**:
   - While B is connected to C, receive a forwardable payload on B.
   - Confirm on B that `relayAttempts` increments and `skipped` increments with `reason: ingress-only-link`.
   - This confirms router decision plumbing is active even though this runtime does not perform multi-link relay.
5. **Validate direct paths still work**:
   - Send a normal direct BLE message B → C from the existing send button.
   - Confirm outbox/inbox snapshots still update and decrypt path remains unchanged.

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
