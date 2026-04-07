import assert from "node:assert/strict";

import { SyncEngine, computeStateHash } from "../../app/src/sync-engine.js";
import { mergeLwwRegister, orSetAdd, orSetRemove, orSetValues, pnCounterValue } from "../../app/src/state-model.js";
import { resolveIngestRoute, INGEST_CHANNEL } from "../../app/src/event-ingest.js";

function createMemoryLog(seed = []) {
  const events = [...seed];
  return {
    async loadEvents() {
      await Promise.resolve();
      return [...events];
    },
    async appendEvent(event) {
      await Promise.resolve();
      if (events.some((existing) => existing.eventId === event.eventId)) {
        return { appended: false, event };
      }
      events.push({ ...event });
      return { appended: true, event };
    },
    snapshot() {
      return [...events].sort((a, b) => String(a.eventId).localeCompare(String(b.eventId)));
    }
  };
}

function eventSetHash(snapshot) {
  const ids = snapshot.map((event) => event.eventId).sort();
  return computeStateHash(ids);
}

(async () => {
  const baseEvents = [
    { eventId: "ev-1", lamport: 1, ts: 10, scope: "global", topic: "checkin" },
    { eventId: "ev-2", lamport: 2, ts: 20, scope: "global", topic: "checkin" }
  ];

  const aLog = createMemoryLog(baseEvents);
  const bLog = createMemoryLog([baseEvents[0], { eventId: "ev-3", lamport: 3, ts: 30, scope: "global", topic: "supplies" }]);
  const cLog = createMemoryLog([baseEvents[1], { eventId: "ev-4", lamport: 4, ts: 40, scope: "global", topic: "shelter_status" }]);

  const aSync = new SyncEngine({ nodeId: "A", loadEvents: aLog.loadEvents, appendEvent: aLog.appendEvent });
  const bSync = new SyncEngine({ nodeId: "B", loadEvents: bLog.loadEvents, appendEvent: bLog.appendEvent });
  const cSync = new SyncEngine({ nodeId: "C", loadEvents: cLog.loadEvents, appendEvent: cLog.appendEvent });

  async function syncPair(leftSync, leftLog, rightSync, rightLog) {
    const rightSummary = await rightSync.summarizeInventory();
    const leftResult = await leftSync.antiEntropyExchange(rightSummary, async (ids) => {
      await Promise.resolve();
      return rightLog.snapshot().filter((event) => ids.includes(event.eventId));
    });

    const leftSummary = await leftSync.summarizeInventory();
    const rightResult = await rightSync.antiEntropyExchange(leftSummary, async (ids) => {
      await Promise.resolve();
      return leftLog.snapshot().filter((event) => ids.includes(event.eventId));
    });

    return [leftResult, rightResult];
  }

  const pairResults = [];
  pairResults.push(...await syncPair(aSync, aLog, bSync, bLog));
  pairResults.push(...await syncPair(bSync, bLog, cSync, cLog));
  pairResults.push(...await syncPair(cSync, cLog, aSync, aLog));
  pairResults.push(...await syncPair(aSync, aLog, bSync, bLog));

  const hashA = eventSetHash(aLog.snapshot());
  const hashB = eventSetHash(bLog.snapshot());
  const hashC = eventSetHash(cLog.snapshot());

  assert.equal(hashA, hashB, "A/B should converge to same state hash");
  assert.equal(hashB, hashC, "B/C should converge to same state hash");
  for (const result of pairResults) {
    assert.ok((result.duplicateRate || 0) < 0.01, "duplicate rate should remain < 1%");
  }

  const lww = mergeLwwRegister(
    { value: "yellow", ts: 100, authorFp: "a" },
    { value: "green", ts: 101, authorFp: "b" }
  );
  assert.equal(lww.value, "green");

  let supplies = orSetAdd(null, "water", "op-1");
  supplies = orSetAdd(supplies, "water", "op-2");
  supplies = orSetRemove(supplies, "water", ["op-1"]);
  assert.deepEqual(orSetValues(supplies), ["water"]);

  assert.equal(pnCounterValue({ p: { a: 3, b: 1 }, n: { c: 2 } }), 2);

  const bleRoute = resolveIngestRoute({ text: JSON.stringify({ kind: "dmesh-msg", msgId: "m-1" }), channel: INGEST_CHANNEL.BLE });
  const qrRoute = resolveIngestRoute({ text: JSON.stringify({ kind: "dmesh-id", signPK: "aa", boxPK: "bb" }), channel: INGEST_CHANNEL.QR });
  const fileRoute = resolveIngestRoute({ text: JSON.stringify({ type: "lifeline-group-onboarding-v1" }), channel: INGEST_CHANNEL.FILE });
  assert.equal(bleRoute.route, "decrypt");
  assert.equal(qrRoute.route, "contact-import");
  assert.equal(fileRoute.route, "group-import");

  console.log("✓ integration: phase3 sync anti-entropy convergence + ingest/state primitives");
})().catch((error) => {
  console.error("✗ integration: phase3 sync anti-entropy convergence + ingest/state primitives");
  console.error(error);
  process.exit(1);
});
