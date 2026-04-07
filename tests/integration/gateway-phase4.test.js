import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { GatewayBridge } from "../../gateway/bridge.js";
import { GatewayEventStore } from "../../gateway/event-store.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeEvent({ eventId, topic = "ops", scope = "zone-a", priority = "high" } = {}) {
  return {
    eventId,
    parents: [],
    authorFp: "fp-author",
    scope,
    topic,
    ts: Date.now(),
    ttl: 60_000,
    priority,
    schemaVersion: 1,
    sig: "deadbeef"
  };
}

function bridgePair() {
  const islandA = new GatewayBridge({ islandId: "island-a" });
  const islandB = new GatewayBridge({ islandId: "island-b" });
  return { islandA, islandB };
}

function durableStore(filePath) {
  return new GatewayEventStore({ filePath, logger: { warn: () => null } });
}

function tmpStorePath(suffix) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gateway-phase4-")), `${suffix}.jsonl`);
}

test("gateway phase4: two islands sync over backhaul without duplicate storm", () => {
  const { islandA, islandB } = bridgePair();

  const event = makeEvent({ eventId: "evt-phase4-1", priority: "critical" });
  const ingestResult = islandA.ingestLocalMesh(event, { ingressTransport: "ble" });
  assert(ingestResult.inserted, "local mesh ingest should insert event on island A");

  const batch = islandA.exportBackhaulBatch({ cursor: 0 });
  assert(batch.events.length === 1, "critical event should be exported to backhaul");

  const firstRemote = islandB.ingestBackhaul(batch.events[0], { ingressTransport: "http" });
  assert(firstRemote.inserted, "island B should ingest remote backhaul event");

  const duplicateRemote = islandB.ingestBackhaul(batch.events[0], { ingressTransport: "http" });
  assert(!duplicateRemote.inserted, "duplicate event should be deduped on island B");

  const roundTrip = islandB.exportBackhaulBatch({ cursor: 0 });
  assert(roundTrip.events.length === 1, "island B can re-export for downstream peers");

  const loopAttempt = islandA.ingestBackhaul(roundTrip.events[0], { ingressTransport: "http" });
  assert(!loopAttempt.inserted, "event with existing gatewayPath entry should be loop-suppressed");
});

test("gateway phase4: local mesh remains operational when backhaul uplink is disabled", () => {
  const localOnly = new GatewayBridge({
    islandId: "island-local",
    uplinkEnabled: false
  });

  const event = makeEvent({ eventId: "evt-phase4-local-1", priority: "critical" });
  const result = localOnly.ingestLocalMesh(event, { ingressTransport: "ble" });
  assert(result.inserted, "local ingest works while uplink is disabled");

  const exportResult = localOnly.exportBackhaulBatch({ cursor: 0 });
  assert(exportResult.events.length === 0, "local-only mode should export no backhaul events");
  assert(localOnly.snapshot().store.totalEvents === 1, "local event store retains events for local mesh");
});

test("gateway phase4: policy minimizes metadata and uplinks high/critical only", () => {
  const bridge = new GatewayBridge({
    islandId: "island-policy",
    policy: {
      allowedTopics: ["shelter"],
      geofences: ["zone-1"]
    }
  });

  bridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-policy-1", topic: "shelter", scope: "zone-1", priority: "high" }), {
    ingressTransport: "mesh"
  });
  bridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-policy-2", topic: "shelter", scope: "zone-1", priority: "normal" }), {
    ingressTransport: "mesh"
  });
  bridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-policy-3", topic: "medical", scope: "zone-1", priority: "critical" }), {
    ingressTransport: "mesh"
  });

  const exported = bridge.exportBackhaulBatch({ cursor: 0 }).events;
  assert(exported.length === 1, "only high/critical events matching policy should uplink");
  assert(exported[0].eventId === "evt-phase4-policy-1", "topic/scope policy applied");
  assert(exported[0].metadataMinimized === true, "gateway marks metadata-minimized policy on exported events");
  assert(!("content" in exported[0]), "gateway exports no additional plaintext fields");
});

test("gateway phase4: event store survives restart and dedupe still works", () => {
  const filePath = tmpStorePath("durable-events");
  const islandId = "island-restart-a";
  const event = makeEvent({ eventId: "evt-phase4-restart-1", priority: "critical" });

  const firstBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  const firstInsert = firstBridge.ingestLocalMesh(event);
  assert(firstInsert.inserted, "first ingest should insert");

  const secondBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  assert(secondBridge.snapshot().store.totalEvents === 1, "stored events should recover after restart");

  const duplicate = secondBridge.ingestLocalMesh(event);
  assert(!duplicate.inserted, "duplicate suppression should still work after restart");
});

test("gateway phase4: export cursor is restart-safe", () => {
  const filePath = tmpStorePath("export-cursor");
  const islandId = "island-restart-cursor";

  const firstBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  firstBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-1", priority: "critical" }));
  firstBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-2", priority: "high" }));

  const firstBatch = firstBridge.exportBackhaulBatch({ cursor: 0 });
  assert(firstBatch.events.length === 2, "initial export should include first two events");
  assert(firstBatch.cursor === 2, "cursor should advance to ingested event count");

  const secondBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  secondBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-3", priority: "critical" }));

  const resumed = secondBridge.exportBackhaulBatch({ cursor: firstBatch.cursor });
  assert(resumed.events.length === 1, "restart should preserve cursor progression");
  assert(resumed.events[0].eventId === "evt-phase4-cursor-3", "resumed export should return only unseen event");
});

test("gateway phase4: loop suppression still works after restart/import", () => {
  const storeAPath = tmpStorePath("loop-a");
  const storeBPath = tmpStorePath("loop-b");

  const islandA1 = new GatewayBridge({ islandId: "island-loop-a", store: durableStore(storeAPath) });
  const islandB1 = new GatewayBridge({ islandId: "island-loop-b", store: durableStore(storeBPath) });

  islandA1.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-loop-1", priority: "critical" }));
  const initialBatch = islandA1.exportBackhaulBatch({ cursor: 0 });
  const imported = islandB1.ingestBackhaul(initialBatch.events[0]);
  assert(imported.inserted, "remote import should insert before restart");

  const islandA2 = new GatewayBridge({ islandId: "island-loop-a", store: durableStore(storeAPath) });
  const islandB2 = new GatewayBridge({ islandId: "island-loop-b", store: durableStore(storeBPath) });
  const replay = islandB2.exportBackhaulBatch({ cursor: 0 });
  const loopAttempt = islandA2.ingestBackhaul(replay.events[0]);
  assert(!loopAttempt.inserted, "loop suppression should continue after restart");
});

async function run() {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`1..${tests.length}`);
  console.log(`# gateway-phase4: ${passed}/${tests.length} passed`);
}

run();
