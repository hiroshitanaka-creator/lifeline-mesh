# Issue: Add Bluetooth UI to App

**Labels:** `help wanted`, `enhancement`, `ui`

---

## Description

We have a Bluetooth BLE manager (`bluetooth/ble-manager.js`) but no UI in the app to use it. We need to add buttons and status displays for Bluetooth functionality.

## Proposed UI

Add a new section "5) Bluetooth Relay" with:

```
┌─────────────────────────────────────────────┐
│ 5) Bluetooth Relay                          │
├─────────────────────────────────────────────┤
│ Status: 🔴 Not connected                    │
│                                             │
│ [📡 Scan for Devices] [❌ Disconnect]       │
│                                             │
│ Connected to: (none)                        │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Nearby Messages:                        │ │
│ │ (Messages received via Bluetooth        │ │
│ │  will appear here)                      │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [📤 Send via Bluetooth]                     │
└─────────────────────────────────────────────┘
```

## Tasks

1. [ ] Add HTML section for Bluetooth UI
2. [ ] Import BLEManager in the script
3. [ ] Add scan button with device selection
4. [ ] Show connection status (connected/disconnected)
5. [ ] Display received messages
6. [ ] Add "Send via Bluetooth" option to encryption
7. [ ] Handle errors gracefully (browser not supported, etc.)
8. [ ] Test in Chrome Desktop and Android

## Code Hints

```javascript
// Import BLE manager
import { BLEManager } from '../bluetooth/ble-manager.js';

// Check support
if (!BLEManager.isSupported()) {
  document.getElementById('ble-section').innerHTML =
    '<p>Bluetooth not supported in this browser</p>';
}

// Initialize
const ble = new BLEManager();
ble.onConnectionChange = updateBLEStatus;
ble.onMessageReceived = handleBLEMessage;
```

## Skills Needed

- HTML/CSS
- JavaScript (ES6 modules)
- Basic understanding of async/await

## Difficulty

Medium

---

**Files:** `app/index.html`, imports from `bluetooth/`
