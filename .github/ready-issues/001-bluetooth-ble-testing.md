# Issue: Bluetooth BLE Testing Needed

**Labels:** `help wanted`, `testing`, `bluetooth`

---

## Description

We have a new Bluetooth BLE relay implementation (`bluetooth/`) that needs real-world testing on actual devices.

## What Needs Testing

1. **Device Discovery**
   - Can devices find each other?
   - How long does scanning take?

2. **Connection**
   - Connection success rate
   - Connection stability
   - Reconnection after disconnect

3. **Message Transfer**
   - Small messages (< 500 bytes)
   - Large messages (> 10KB)
   - Multiple messages in sequence

4. **Browser Compatibility**
   - Chrome Desktop
   - Chrome Android
   - Edge Desktop
   - Edge Android

## How to Test

```javascript
import { BLEManager } from './bluetooth/ble-manager.js';

// Check support
console.log(BLEManager.getSupportInfo());

// Basic test
const ble = new BLEManager();
ble.onMessageReceived = (msg) => console.log('Received:', msg);
ble.onConnectionChange = (connected) => console.log('Connected:', connected);

await ble.scan();
await ble.connect();
await ble.sendMessage({ test: 'hello' });
```

## Environment Details to Report

Please include:
- Browser name and version
- OS and version
- Device model
- Distance between devices
- Any error messages

## Mentorship

Yes - maintainers can help with debugging and questions.

---

**Files:** `bluetooth/ble-manager.js`, `bluetooth/constants.js`
