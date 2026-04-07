export class GatewayEventStore {
  constructor() {
    this.events = [];
    this.eventIndex = new Map();
  }

  append(event) {
    if (!event?.eventId) {
      throw new Error("GatewayEventStore.append requires eventId");
    }
    if (this.eventIndex.has(event.eventId)) {
      return { inserted: false, event: this.eventIndex.get(event.eventId) };
    }
    const record = {
      ...event,
      storedAt: event.storedAt ?? Date.now()
    };
    this.events.push(record);
    this.eventIndex.set(record.eventId, record);
    return { inserted: true, event: record };
  }

  listSince(cursor = 0) {
    const normalizedCursor = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    return this.events.slice(normalizedCursor);
  }

  snapshot() {
    return {
      totalEvents: this.events.length,
      newestStoredAt: this.events.length > 0 ? this.events[this.events.length - 1].storedAt : null
    };
  }
}

export default GatewayEventStore;
