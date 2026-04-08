import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { GatewayBridge } from "../../gateway/bridge.js";
import { GatewayEventStore } from "../../gateway/event-store.js";
import { createGatewayService } from "../../gateway/service.js";

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

function requestJson({ port, method, route, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        method,
        headers: payload
          ? {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload)
          }
          : undefined
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: res.statusCode,
            body: raw ? JSON.parse(raw) : null
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
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
  bridge.ingestLocalMesh({
    ...makeEvent({ eventId: "evt-phase4-policy-4", topic: "shelter", scope: "zone-1", priority: "high" }),
    content: "cleartext should not persist"
  });

  const exported = bridge.exportBackhaulBatch({ cursor: 0 }).events;
  assert(exported.length === 2, "only high/critical events matching policy should uplink");
  assert(exported[0].eventId === "evt-phase4-policy-1", "topic/scope policy applied");
  assert(exported[0].metadataMinimized === true, "gateway marks metadata-minimized policy on exported events");
  assert(!("content" in exported[0]), "gateway exports no additional plaintext fields");
  const stored = bridge.snapshot().store.totalEvents;
  assert(stored === 4, "all ingested records should be persisted");
  const persistedEvent = bridge.store.listSince(0).find((event) => event.eventId === "evt-phase4-policy-4");
  assert(!("content" in persistedEvent), "gateway store strips non-allowlisted plaintext fields");
});

test("gateway phase4: invalid event missing required fields is rejected", () => {
  const bridge = new GatewayBridge({ islandId: "island-validate" });
  let threw = false;
  try {
    bridge.ingestLocalMesh({ eventId: "evt-invalid", sig: "deadbeef", ts: Date.now() });
  } catch (error) {
    threw = true;
    assert(error.message.includes("authorFp"), "rejects when authorFp is missing");
  }
  assert(threw, "ingest should reject malformed event");
});

test("gateway phase4: fake signature is rejected by verifyEvent hook", () => {
  const bridge = new GatewayBridge({
    islandId: "island-verify",
    verifyEvent: (event) => event.sig === "valid-sig"
  });

  let threw = false;
  try {
    bridge.ingestLocalMesh(makeEvent({ eventId: "evt-fake-sig" }));
  } catch (error) {
    threw = true;
    assert(error.message.includes("signature verification failed"), "fake sig should fail injected verifier");
  }
  assert(threw, "verifyEvent hook should reject fake signatures");
});

test("gateway phase4: oversized payloads return 413 on ingest routes", async () => {
  const service = createGatewayService({ bridge: new GatewayBridge({ islandId: "island-service" }) });
  const address = await service.listen(0);

  try {
    const oversized = "x".repeat(300 * 1024);
    const local = await requestJson({
      port: address.port,
      method: "POST",
      route: "/gateway/local-ingest",
      body: { event: makeEvent({ eventId: "evt-oversize-local" }), padding: oversized }
    });
    assert(local.statusCode === 413, "local ingest should reject oversized payload");

    const backhaul = await requestJson({
      port: address.port,
      method: "POST",
      route: "/gateway/backhaul-ingest",
      body: { event: makeEvent({ eventId: "evt-oversize-backhaul" }), padding: oversized }
    });
    assert(backhaul.statusCode === 413, "backhaul ingest should reject oversized payload");
  } finally {
    await service.close();
  }
});

test("gateway phase4: event store survives restart and dedupe still works", async () => {
  const filePath = tmpStorePath("durable-events");
  const islandId = "island-restart-a";
  const event = makeEvent({ eventId: "evt-phase4-restart-1", priority: "critical" });

  const firstBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  const firstInsert = firstBridge.ingestLocalMesh(event);
  assert(firstInsert.inserted, "first ingest should insert");
  await firstBridge.store.flush();

  const secondBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  assert(secondBridge.snapshot().store.totalEvents === 1, "stored events should recover after restart");

  const duplicate = secondBridge.ingestLocalMesh(event);
  assert(!duplicate.inserted, "duplicate suppression should still work after restart");
});

test("gateway phase4: export cursor is restart-safe", async () => {
  const filePath = tmpStorePath("export-cursor");
  const islandId = "island-restart-cursor";

  const firstBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  firstBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-1", priority: "critical" }));
  firstBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-2", priority: "high" }));
  await firstBridge.store.flush();

  const firstBatch = firstBridge.exportBackhaulBatch({ cursor: 0 });
  assert(firstBatch.events.length === 2, "initial export should include first two events");
  assert(firstBatch.cursor === 2, "cursor should advance to ingested event count");

  const secondBridge = new GatewayBridge({ islandId, store: durableStore(filePath) });
  secondBridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-cursor-3", priority: "critical" }));
  await secondBridge.store.flush();

  const resumed = secondBridge.exportBackhaulBatch({ cursor: firstBatch.cursor });
  assert(resumed.events.length === 1, "restart should preserve cursor progression");
  assert(resumed.events[0].eventId === "evt-phase4-cursor-3", "resumed export should return only unseen event");
});

test("gateway phase4: append path does not rely on appendFileSync", async () => {
  const filePath = tmpStorePath("async-append");
  const originalAppendFileSync = fs.appendFileSync;

  fs.appendFileSync = () => {
    throw new Error("appendFileSync should not be used in GatewayEventStore.append");
  };

  try {
    const bridge = new GatewayBridge({ islandId: "island-async-append", store: durableStore(filePath) });
    const result = bridge.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-async-path-1", priority: "critical" }));
    assert(result.inserted, "ingest should still insert while appendFileSync is unavailable");
    await bridge.store.flush();

    const recovered = new GatewayBridge({ islandId: "island-async-append", store: durableStore(filePath) });
    assert(recovered.snapshot().store.totalEvents === 1, "async append should durably persist records");
  } finally {
    fs.appendFileSync = originalAppendFileSync;
  }
});

test("gateway phase4: persistent store avoids full duplicated event array at scale", async () => {
  const filePath = tmpStorePath("memory-footprint");
  const bridge = new GatewayBridge({ islandId: "island-memory", store: durableStore(filePath) });

  for (let index = 0; index < 300; index += 1) {
    bridge.ingestLocalMesh(makeEvent({ eventId: `evt-phase4-memory-${index}`, priority: "high" }));
  }
  await bridge.store.flush();

  assert(bridge.snapshot().store.totalEvents === 300, "store should retain all persisted records");
  assert(bridge.store.events.length === 0, "persistent mode should not duplicate full event payloads in events[]");
  assert(bridge.store.pendingRecords.size === 0, "flush should clear transient pending in-memory records");
});

test("gateway phase4: loop suppression still works after restart/import", async () => {
  const storeAPath = tmpStorePath("loop-a");
  const storeBPath = tmpStorePath("loop-b");

  const islandA1 = new GatewayBridge({ islandId: "island-loop-a", store: durableStore(storeAPath) });
  const islandB1 = new GatewayBridge({ islandId: "island-loop-b", store: durableStore(storeBPath) });

  islandA1.ingestLocalMesh(makeEvent({ eventId: "evt-phase4-loop-1", priority: "critical" }));
  await islandA1.store.flush();
  const initialBatch = islandA1.exportBackhaulBatch({ cursor: 0 });
  const imported = islandB1.ingestBackhaul(initialBatch.events[0]);
  assert(imported.inserted, "remote import should insert before restart");
  await islandB1.store.flush();

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
