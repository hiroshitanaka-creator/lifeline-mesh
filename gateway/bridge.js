import { GatewayEventStore } from "./event-store.js";

const PRIORITY_DELIVERY_CLASS = {
  critical: "backhaul-priority",
  high: "backhaul-priority",
  normal: "local-default",
  low: "local-default"
};

function shouldUplinkByPriority(priority) {
  return priority === "critical" || priority === "high";
}

function computeDeliveryClass(priority) {
  return PRIORITY_DELIVERY_CLASS[priority] ?? "local-default";
}

export class GatewayBridge {
  constructor({ islandId, store, logger = console, policy = {}, uplinkEnabled = true } = {}) {
    if (!islandId) {
      throw new Error("GatewayBridge requires islandId");
    }
    this.islandId = islandId;
    this.store = store ?? new GatewayEventStore();
    this.logger = logger;
    this.policy = {
      allowedTopics: Array.isArray(policy.allowedTopics) ? policy.allowedTopics : null,
      geofences: Array.isArray(policy.geofences) ? policy.geofences : null,
      uplinkMinPriority: policy.uplinkMinPriority ?? "high"
    };
    this.uplinkEnabled = uplinkEnabled;
  }

  ingestLocalMesh(event, { ingressTransport = "mesh" } = {}) {
    this.#assertEvent(event);
    const normalized = {
      ...event,
      originIsland: event.originIsland ?? this.islandId,
      gatewayPath: Array.isArray(event.gatewayPath) && event.gatewayPath.length > 0 ? [...event.gatewayPath] : [this.islandId],
      ingressTransport,
      deliveryClass: event.deliveryClass ?? computeDeliveryClass(event.priority),
      metadataMinimized: true
    };
    return this.store.append(normalized);
  }

  ingestBackhaul(event, { ingressTransport = "backhaul" } = {}) {
    this.#assertEvent(event);
    const gatewayPath = Array.isArray(event.gatewayPath) ? [...event.gatewayPath] : [];
    if (gatewayPath.includes(this.islandId)) {
      return { inserted: false, reason: "loop-suppressed" };
    }
    const normalized = {
      ...event,
      gatewayPath: [...gatewayPath, this.islandId],
      ingressTransport,
      metadataMinimized: true
    };
    return this.store.append(normalized);
  }

  exportBackhaulBatch({ cursor = 0 } = {}) {
    const records = this.store.listSince(cursor);
    const exported = records.filter((event) => this.#allowedForUplink(event));
    return {
      cursor: cursor + records.length,
      events: exported
    };
  }

  #allowedForUplink(event) {
    if (!this.uplinkEnabled) return false;
    if (!shouldUplinkByPriority(event.priority)) return false;
    if (this.policy.allowedTopics && !this.policy.allowedTopics.includes(event.topic)) {
      return false;
    }
    if (this.policy.geofences && !this.policy.geofences.includes(event.scope)) {
      return false;
    }
    return true;
  }

  #assertEvent(event) {
    if (!event?.eventId) {
      throw new Error("gateway event requires eventId");
    }
    if (!event?.sig) {
      throw new Error("gateway event requires sig (no plaintext trust path)");
    }
  }

  snapshot() {
    return {
      islandId: this.islandId,
      uplinkEnabled: this.uplinkEnabled,
      store: this.store.snapshot(),
      policy: { ...this.policy }
    };
  }
}

export default GatewayBridge;
