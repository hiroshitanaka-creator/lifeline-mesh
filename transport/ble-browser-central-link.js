import { BLEManager } from "../bluetooth/ble-manager.js";
import { TransportLink, TRANSPORT_ENERGY_CLASS } from "./transport-link.js";
import { encodeTransportEnvelope } from "./envelope-strategy.js";

export class BleBrowserCentralLink extends TransportLink {
  constructor(options = {}) {
    super({
      linkId: options.linkId ?? "ble-browser-central",
      transportClass: options.transportClass ?? "ble-interactive"
    });

    this.manager = options.manager ?? new BLEManager(options.managerOptions ?? {});
    this._rxQueue = [];
    this._metrics = {
      sent: 0,
      received: 0,
      dropped: 0
    };

    this.manager.onMessageReceived = (message) => {
      this._rxQueue.push(message);
      this._metrics.received += 1;
    };
  }

  async send(canonicalEnvelope) {
    const transportEnvelope = encodeTransportEnvelope(canonicalEnvelope, {
      compact: this.mtuProfile().maxPayload < 256
    });

    const payload = transportEnvelope.mode === "canonical"
      ? transportEnvelope.payload
      : canonicalEnvelope;

    await this.manager.sendMessage(payload);
    this._metrics.sent += 1;
  }

  receive() {
    return Promise.resolve(this._rxQueue.shift() ?? null);
  }

  mtuProfile() {
    const cfg = this.manager.getProtocolConfig();
    return {
      profile: "ble-gatt",
      mtu: cfg.mtu,
      maxPayload: cfg.chunkSize
    };
  }

  energyClass() {
    return TRANSPORT_ENERGY_CLASS.MEDIUM;
  }

  linkMetrics() {
    return {
      ...this._metrics,
      connected: this.manager.isConnected
    };
  }

  capabilities() {
    return {
      transport: "ble-browser-central",
      central: true,
      peripheral: false,
      maxHops: 1,
      directLoRa: false
    };
  }
}
