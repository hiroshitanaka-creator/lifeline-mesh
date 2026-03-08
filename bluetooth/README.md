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

## Configurable transport parameters

`BLEManager` now accepts `protocolConfig` so you can tune packetization / ACK / retry behavior per terminal MTU profile.

```javascript
const ble = new BLEManager({
  protocolConfig: {
    mtu: 185,           // target MTU (Android often 185+, Windows can be smaller)
    chunkSize: 140,     // payload split size (clamped to MTU - header)
    ackTimeoutMs: 3000, // wait ACK per send attempt
    retryCount: 4,
    retryDelayMs: 800,
    chunkDelayMs: 30
  }
});
```

## Manual verification matrix (recommended)

| Browser | OS | Role A | Role B | Focus |
|---|---|---|---|---|
| Chrome  | Android 14 | Pixel (sender) | Windows 11 laptop (receiver) | MTU差が大きい組み合わせ |
| Edge    | Windows 11 | Laptop A | Laptop B | Desktop同士の再接続 |
| Chrome  | Windows 11 | Laptop | Android phone | 切断→再接続→outbox再同期 |
| Edge    | Android 14 | Phone A | Phone B | モバイル同士のACK/再送 |

### Manual verification procedure

1. On both devices, open the app and confirm BLE support section is visible.
2. Configure `BLEManager` with test profile (`chunkSize`, `ackTimeoutMs`, `retryCount`) for the device pair under test.
3. Connect A->B, send a small encrypted message, verify ACK success and inbox insertion on receiver.
4. Send a large message (> 2 chunks) and verify chunked reassembly succeeds.
5. During send, force disconnect on receiver (turn Bluetooth off or disconnect button), then reconnect and call `flushOutbox` path by reconnecting sender.
6. Verify pending outbox entries are retried and eventually `delivered` or `failed` based on retry settings.
7. Inject BLE write failure (DevTools mock / test build) and verify automatic fallback sends via clipboard first, then file.
8. Repeat each matrix row and record: success/failure, time to recover, and fallback path taken.

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
