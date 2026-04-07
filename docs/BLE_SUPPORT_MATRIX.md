# BLE Support Matrix (Central/Web Bluetooth)

> For BLE **peripheral-side** support status and first supported path freeze, see [BLE_PERIPHERAL_CAPABILITY_MATRIX.md](./BLE_PERIPHERAL_CAPABILITY_MATRIX.md) and [ADR_BLE_PERIPHERAL_PATH.md](./ADR_BLE_PERIPHERAL_PATH.md).

| Browser / OS | Web Bluetooth | Lifeline Mesh BLE | Notes |
|---|---|---|---|
| Chrome (Desktop) | ✅ | ✅ Supported | Primary target |
| Edge (Desktop) | ✅ | ✅ Supported | Primary target |
| Chrome (Android) | ✅ | ✅ Supported | Field usage target |
| Safari (macOS/iOS) | ❌ | ❌ Unsupported | No practical production Web Bluetooth support in this project |
| Firefox | ❌ | ❌ Unsupported | Use fallback transports |

## Verification method
- Runtime detection: `BLEManager.isSupported()` + `BLEManager.getSupportInfo()`.
- If unsupported, UI should show fallback guidance and avoid BLE-only flow.

## Fallback policy
- If BLE is unavailable or retries are exhausted, use clipboard/file transport path.
