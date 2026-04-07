import { GATTServer } from "../bluetooth/gatt-server.js";
import { TransportLink, TRANSPORT_ENERGY_CLASS } from "./transport-link.js";

/**
 * Reference peripheral implementation for Phase 2.
 * Uses Node bleno backend through GATTServer.setBackend().
 */
export class NodeGattPeripheralLink extends TransportLink {
  constructor(options = {}) {
    super({
      linkId: options.linkId ?? "node-gatt-peripheral",
      transportClass: options.transportClass ?? "ble-relay"
    });

    this.server = options.server ?? new GATTServer({
      backend: options.backend ?? null,
      localName: options.localName ?? "LifelineMesh"
    });

    this._rxQueue = [];
    this._metrics = {
      sent: 0,
      received: 0,
      activeClients: 0
    };

    this.server.onMessageReceived = (message, clientId) => {
      this._rxQueue.push({ message, clientId });
      this._metrics.received += 1;
    };

    this.server.onClientConnected = () => {
      this._metrics.activeClients = this.server.clientCount;
    };

    this.server.onClientDisconnected = () => {
      this._metrics.activeClients = this.server.clientCount;
    };
  }

  async send(envelope, clientId = this.server.connectedClients[0]) {
    if (!clientId) {
      throw new Error("No active peripheral client");
    }
    await this.server.sendMessage(envelope, clientId);
    this._metrics.sent += 1;
  }

  receive() {
    return Promise.resolve(this._rxQueue.shift() ?? null);
  }

  mtuProfile() {
    return {
      profile: "gatt-notify",
      mtu: 185,
      maxPayload: 160
    };
  }

  energyClass() {
    return TRANSPORT_ENERGY_CLASS.HIGH;
  }

  linkMetrics() {
    return {
      ...this._metrics,
      advertising: this.server.isAdvertising
    };
  }

  capabilities() {
    return {
      transport: "node-gatt-peripheral",
      central: false,
      peripheral: true,
      referenceImplementation: true,
      singleClient: true
    };
  }
}
