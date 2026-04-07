function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function inventoryDigest(events = []) {
  const ids = events.map((event) => String(event.eventId)).sort();
  return fnv1a32(ids.join("|"));
}

export function computeStateHash(state) {
  return fnv1a32(stableStringify(state));
}

export function compareLamport(a, b) {
  if ((a.lamport || 0) !== (b.lamport || 0)) {
    return (a.lamport || 0) - (b.lamport || 0);
  }
  return String(a.eventId).localeCompare(String(b.eventId));
}

export class SyncEngine {
  constructor({ nodeId, loadEvents, appendEvent, now = () => Date.now() }) {
    this.nodeId = nodeId;
    this.loadEvents = loadEvents;
    this.appendEvent = appendEvent;
    this.now = now;
    this.lamport = 0;
  }

  nextLamport(observedLamport = null) {
    const observed = Number.isFinite(observedLamport) ? observedLamport : 0;
    this.lamport = Math.max(this.lamport, observed) + 1;
    return this.lamport;
  }

  async summarizeInventory() {
    const events = await this.loadEvents();
    return {
      nodeId: this.nodeId,
      count: events.length,
      digest: inventoryDigest(events),
      eventIds: events.map((entry) => entry.eventId).sort()
    };
  }

  computeWant(remoteEventIds = []) {
    const remoteSet = new Set(remoteEventIds);
    return this.loadEvents().then((events) => events
      .map((entry) => entry.eventId)
      .filter((eventId) => !remoteSet.has(eventId))
      .sort());
  }

  async ingestRemoteEvents(events = []) {
    const sorted = [...events].sort(compareLamport);
    let appended = 0;
    for (const event of sorted) {
      const lamport = this.nextLamport(event.lamport);
      const result = await this.appendEvent({
        ...event,
        lamport
      });
      if (result.appended) {
        appended += 1;
      }
    }
    return { appended, duplicates: events.length - appended };
  }

  async antiEntropyExchange(remoteSummary, fetchRemoteEventsByIds) {
    const localSummary = await this.summarizeInventory();
    if (remoteSummary.digest === localSummary.digest && remoteSummary.count === localSummary.count) {
      return { changed: false, pulled: 0 };
    }

    const localSet = new Set(localSummary.eventIds);
    const missingIds = remoteSummary.eventIds.filter((eventId) => !localSet.has(eventId));
    const missingEvents = await fetchRemoteEventsByIds(missingIds);
    const ingestResult = await this.ingestRemoteEvents(missingEvents);

    return {
      changed: ingestResult.appended > 0,
      pulled: ingestResult.appended,
      duplicateRate: missingEvents.length === 0 ? 0 : ingestResult.duplicates / missingEvents.length
    };
  }
}
