/**
 * Phase 2 transport boundary for runtime links.
 *
 * The existing crypto/transport.js API remains for user-facing exchange
 * transports (qr/clipboard/file). This boundary is specifically for runtime
 * link adapters (BLE central/peripheral, native bridges, serial gateways).
 */

export const TRANSPORT_ENERGY_CLASS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
};

export class TransportLink {
  constructor(options = {}) {
    this.linkId = options.linkId ?? "unknown-link";
    this.transportClass = options.transportClass ?? "unknown";
  }

  send(_envelope) {
    return Promise.reject(new Error("TransportLink.send() must be implemented"));
  }

  receive() {
    return Promise.reject(new Error("TransportLink.receive() must be implemented"));
  }

  mtuProfile() {
    throw new Error("TransportLink.mtuProfile() must be implemented");
  }

  energyClass() {
    throw new Error("TransportLink.energyClass() must be implemented");
  }

  linkMetrics() {
    throw new Error("TransportLink.linkMetrics() must be implemented");
  }

  capabilities() {
    throw new Error("TransportLink.capabilities() must be implemented");
  }
}
