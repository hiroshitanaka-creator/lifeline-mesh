# BLE Support Matrix (Phase 4)

| Browser / OS | Web Bluetooth | Lifeline Mesh BLE | Notes |
|---|---|---|---|
| Chrome (Desktop) | ✅ | ✅ Supported | Primary target |
| Edge (Desktop) | ✅ | ✅ Supported | Primary target |
| Chrome (Android) | ✅ | ✅ Supported | Field usage target |
| Safari (macOS/iOS) | ⚠️ Partial/Experimental | ⚠️ Limited | Behavior can vary by version |
| Firefox | ❌ | ❌ Unsupported | Use fallback transports |

## Verification method
- Runtime detection: `BLEManager.isSupported()` + `BLEManager.getSupportInfo()`.
- If unsupported, UI should show fallback guidance and avoid BLE-only flow.

## Fallback policy
- If BLE is unavailable or retries are exhausted, use clipboard/file transport path.
