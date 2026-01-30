# Bluetooth BLE Relay

Peer-to-peer message exchange over Bluetooth Low Energy.

## Status

🚧 **Proof of Concept** - Basic implementation, needs testing on real devices.

## Browser Support

| Browser | Desktop | Android | iOS |
|---------|---------|---------|-----|
| Chrome | ✅ | ✅ | ❌ |
| Edge | ✅ | ✅ | ❌ |
| Firefox | ❌ | ❌ | ❌ |
| Safari | ⚠️ | N/A | ❌ |

⚠️ = Experimental/Limited

## Usage

```javascript
import { BLEManager } from './ble-manager.js';

// Check support
if (!BLEManager.isSupported()) {
  console.log('Web Bluetooth not supported');
  return;
}

// Create manager
const ble = new BLEManager();

// Set callbacks
ble.onMessageReceived = (message, type) => {
  console.log('Received:', message);
};

ble.onConnectionChange = (connected, device) => {
  console.log('Connection:', connected ? 'connected' : 'disconnected');
};

ble.onError = (code, error) => {
  console.error('BLE Error:', code, error);
};

// Scan and connect
try {
  await ble.scan();       // User selects device
  await ble.connect();    // Connect to selected device

  // Send message
  await ble.sendMessage({
    v: 1,
    kind: 'dmesh-msg',
    // ... encrypted message fields
  });

  // Send identity
  await ble.sendIdentity({
    v: 1,
    kind: 'dmesh-id',
    name: 'Alice',
    signPK: '...',
    boxPK: '...',
  });
} catch (error) {
  console.error('BLE operation failed:', error);
}

// Disconnect
ble.disconnect();
```

## Architecture

```
Device A                    Device B
┌─────────┐                ┌─────────┐
│ BLE     │   Bluetooth    │ BLE     │
│ Manager │ <============> │ Manager │
└────┬────┘                └────┬────┘
     │                          │
┌────┴────┐                ┌────┴────┐
│ Crypto  │                │ Crypto  │
│ Core    │                │ Core    │
└─────────┘                └─────────┘
```

## Protocol

### Packet Format

```
┌──────────┬─────────────┬──────────────┬──────────┬─────────────┐
│ Type     │ Chunk Index │ Total Chunks │ Reserved │ Payload     │
│ (1 byte) │ (1 byte)    │ (1 byte)     │ (1 byte) │ (variable)  │
└──────────┴─────────────┴──────────────┴──────────┴─────────────┘
```

### Message Types

| Type | Value | Description |
|------|-------|-------------|
| DIRECT | 0x01 | Encrypted message |
| BROADCAST | 0x02 | Broadcast message |
| ACK | 0x03 | Acknowledgment |
| DISCOVERY | 0x04 | Peer discovery |
| IDENTITY | 0x05 | Identity exchange |

## Testing

Currently requires manual testing with two devices:

1. Open app on Device A (Chrome)
2. Open app on Device B (Chrome/Android)
3. Device A: Click "Scan for Devices"
4. Device B: Should appear in list
5. Connect and exchange messages

## Known Limitations

- No automatic reconnection
- No mesh routing (direct connections only)
- Requires user interaction to scan (browser security)
- Range limited to ~10 meters

## Future Improvements

- [ ] Automatic reconnection
- [ ] Multiple simultaneous connections
- [ ] Mesh routing
- [ ] Background operation (Service Worker)
- [ ] Better error recovery
- [ ] Connection quality indicators

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Key areas needing help:
- Real device testing
- iOS support research
- Mesh routing implementation
- Performance optimization
