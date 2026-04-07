import { TransportLink, TRANSPORT_ENERGY_CLASS } from "./transport-link.js";

/**
 * Contract-only adapter for native/mobile peripheral mode.
 *
 * This is intentionally a stub in current shipped truth. Implementations are
 * expected via Capacitor/Android bridge/WebView host glue.
 */
export class NativePeripheralContractLink extends TransportLink {
  constructor(options = {}) {
    super({
      linkId: options.linkId ?? "native-peripheral-contract",
      transportClass: options.transportClass ?? "ble-relay"
    });
    this._bridge = options.bridge ?? null;
  }

  send(_envelope) {
    return Promise.reject(new Error("NativePeripheralContractLink is contract-only in v0.1.x"));
  }

  receive() {
    return Promise.resolve(null);
  }

  mtuProfile() {
    return {
      profile: "native-bridge-contract",
      mtu: null,
      maxPayload: null
    };
  }

  energyClass() {
    return TRANSPORT_ENERGY_CLASS.MEDIUM;
  }

  linkMetrics() {
    return {
      bridgeAttached: this._bridge !== null
    };
  }

  capabilities() {
    return {
      transport: "native-peripheral-contract",
      central: false,
      peripheral: true,
      shipped: false,
      contractOnly: true
    };
  }
}
