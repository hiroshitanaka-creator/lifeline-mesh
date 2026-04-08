import fs from "fs/promises";
import os from "os";
import path from "path";

import { GATTServer, MockGATTBackend } from "../../bluetooth/gatt-server.js";
import { CHARACTERISTICS, MSG_TYPE } from "../../bluetooth/constants.js";
import { FileRelayStore } from "../../node-server/persistent-relay-store.js";
import { SingleClientRelayNode } from "../../node-server/relay-node.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function buildPacket(msgType, chunkIndex, totalChunks, payload) {
  const header = new Uint8Array([msgType, chunkIndex, totalChunks, 0]);
  const packet = new Uint8Array(header.length + payload.length);
  packet.set(header, 0);
  packet.set(payload, header.length);
  return packet;
}

function encodeChunk(transferId, data) {
  const base64 = Buffer.from(data).toString("base64");
  return new TextEncoder().encode(JSON.stringify({ transferId, data: base64 }));
}

function makeDirectPacket(message, transferId) {
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  const payload = encodeChunk(transferId, bytes);
  return buildPacket(MSG_TYPE.DIRECT, 0, 1, payload);
}

function makeAckPacket(transferId) {
  const payload = new TextEncoder().encode(transferId);
  return buildPacket(MSG_TYPE.ACK, 0, 1, payload);
}

function decodeTransferIdFromDirectPacket(packet) {
  const payload = packet.slice(4);
  const envelope = JSON.parse(new TextDecoder().decode(payload));
  return envelope.transferId;
}

async function setupHarness(storePath, storeOptions = {}) {
  const backend = new MockGATTBackend();
  const server = new GATTServer({ backend, localName: "RelayHarness" });
  const store = new FileRelayStore({ filePath: storePath, ...storeOptions });
  const relayNode = new SingleClientRelayNode({
    server,
    store,
    logger: {
      log: () => undefined,
      warn: () => undefined
    }
  });

  await relayNode.init();

  server.onMessageReceived = (message, clientId) => {
    relayNode.onInboundMessage(message, clientId);
  };
  server.onClientConnected = (clientId) => {
    relayNode.onClientConnected(clientId);
  };

  await server.startAdvertising();

  return { backend, server, store, relayNode };
}

test("node relay: inbound message is persisted as pending", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store } = await setupHarness(storePath);

  backend.simulateClientConnect("client-1");

  const message = { kind: "dmesh-msg", msgId: "relay-persist-1", payload: "hello relay" };
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));

  await new Promise((resolve) => setTimeout(resolve, 20));

  const pending = await store.listPending();
  assert(pending.length === 1, "one pending message persisted");
  assert(pending[0].msgId === "relay-persist-1", "pending message keeps msgId");
});

test("node relay: pending message is replayed on reconnect", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store } = await setupHarness(storePath);

  backend.simulateClientConnect("client-1");

  const message = { kind: "dmesh-msg", msgId: "relay-replay-1", payload: "queued then replayed" };
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
  await new Promise((resolve) => setTimeout(resolve, 20));

  backend.notifications.length = 0;
  backend.simulateClientDisconnect("client-1");
  backend.simulateClientConnect("client-1");
  await new Promise((resolve) => setTimeout(resolve, 20));

  const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(directNotifs.length >= 1, "pending message replayed to reconnected client");
  const transferId = decodeTransferIdFromDirectPacket(directNotifs[0].data);
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeAckPacket(transferId));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const pendingAfterReplay = await store.listPending();
  assert(pendingAfterReplay.length === 0, "pending queue drained after replay success");
});

test("node relay: pending message survives process restart and replays", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  // First lifecycle: receive and persist.
  {
    const { backend, server } = await setupHarness(storePath);
    backend.simulateClientConnect("client-a");

    const message = { kind: "dmesh-msg", msgId: "relay-restart-1", payload: "persist me" };
    backend.simulateWrite("client-a", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
    await new Promise((resolve) => setTimeout(resolve, 20));

    await server.stopAdvertising();
  }

  // Second lifecycle: reconnect and replay from persisted disk state.
  {
    const { backend, store } = await setupHarness(storePath);
    backend.simulateClientConnect("client-b");
    await new Promise((resolve) => setTimeout(resolve, 20));

    const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
    assert(directNotifs.length >= 1, "persisted pending message replayed after restart");
    const transferId = decodeTransferIdFromDirectPacket(directNotifs[0].data);
    backend.simulateWrite("client-b", CHARACTERISTICS.MESSAGE_TX, makeAckPacket(transferId));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const pending = await store.listPending();
    assert(pending.length === 0, "pending message marked delivered after replay");
  }
});

test("node relay: duplicate inbound msgId is suppressed within dedupe window", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store, relayNode } = await setupHarness(storePath, {
    dedupeWindowMs: 60 * 1000
  });

  backend.simulateClientConnect("client-1");

  const duplicateMsgId = "relay-dup-1";
  const first = { kind: "dmesh-msg", msgId: duplicateMsgId, payload: "first payload" };
  const duplicate = { kind: "dmesh-msg", msgId: duplicateMsgId, payload: "duplicate payload" };

  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(first, first.msgId));
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(duplicate, duplicate.msgId));
  await new Promise((resolve) => setTimeout(resolve, 30));

  const pending = await store.listPending();
  assert(pending.length === 1, "duplicate inbound packet should not create a second pending entry");
  assert(pending[0].message.payload === "first payload", "original pending payload remains unchanged");

  const flushPromise = relayNode.flushPending("client-1");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const replayDirect = backend.notifications.find((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(Boolean(replayDirect), "flush emits a replay notification");
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeAckPacket(decodeTransferIdFromDirectPacket(replayDirect.data)));
  await flushPromise;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const pendingAfterReplay = await store.listPending();
  assert(pendingAfterReplay.length === 0, "message delivered after replay");

  backend.notifications.length = 0;
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(duplicate, duplicate.msgId));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const pendingAfterDeliveredDuplicate = await store.listPending();
  assert(pendingAfterDeliveredDuplicate.length === 0, "recent delivered duplicate should remain suppressed");
});

test("node relay: cleanup evicts retained delivered entries and reports counts", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store, relayNode } = await setupHarness(storePath, {
    deliveredRetentionMs: 30,
    pendingRetentionMs: 30 * 60 * 1000,
    dedupeWindowMs: 10
  });

  backend.simulateClientConnect("client-cleanup");
  const message = { kind: "dmesh-msg", msgId: "relay-cleanup-1", payload: "cleanup me later" };
  backend.simulateWrite("client-cleanup", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
  await new Promise((resolve) => setTimeout(resolve, 25));

  const flushPromise = relayNode.flushPending("client-cleanup");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const replayDirect = backend.notifications.find((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(Boolean(replayDirect), "cleanup scenario emits replay notification");
  backend.simulateWrite(
    "client-cleanup",
    CHARACTERISTICS.MESSAGE_TX,
    makeAckPacket(decodeTransferIdFromDirectPacket(replayDirect.data))
  );
  await flushPromise;
  await new Promise((resolve) => setTimeout(resolve, 40));
  await store.cleanup();

  const snapshot = await relayNode.getSnapshot();
  assert(snapshot.store.pendingCount === 0, "no pending entries after cleanup");
  assert(snapshot.store.deliveredCount === 0, "delivered entries evicted by retention");
  assert(snapshot.store.cleanup.removedDelivered >= 1, "cleanup stats include delivered removals");
  assert(snapshot.store.retention.deliveredRetentionMs === 30, "snapshot exposes delivered retention window");
  assert(snapshot.store.oldestPendingCreatedAt === null, "snapshot includes oldestPendingCreatedAt for operators");
  assert(typeof snapshot.store.newestDeliveredAt === "number" || snapshot.store.newestDeliveredAt === null, "snapshot includes newestDeliveredAt");
});

test("node relay: manual cleanup removes stale pending entries and is observable", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store, relayNode } = await setupHarness(storePath, {
    pendingRetentionMs: 1,
    deliveredRetentionMs: 30 * 60 * 1000,
    dedupeWindowMs: 10
  });

  backend.simulateClientConnect("client-manual-cleanup");
  const message = { kind: "dmesh-msg", msgId: "relay-pending-cleanup-1", payload: "stale pending" };
  backend.simulateWrite("client-manual-cleanup", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
  await new Promise((resolve) => setTimeout(resolve, 25));

  const cleanupResult = await relayNode.runCleanup("manual-test");
  assert(cleanupResult.removedPending >= 1, "manual cleanup should remove stale pending entries");

  const snapshot = await store.getSnapshot();
  assert(snapshot.pendingCount === 0, "pending queue is empty after manual cleanup");
  assert(snapshot.cleanup.lastRunAt !== null, "cleanup run timestamp is observable");
});


test("node relay: diagnostics emits flush and cleanup lifecycle", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const logs = [];
  const backend = new MockGATTBackend();
  const server = new GATTServer({ backend, localName: "RelayHarnessDiag" });
  const store = new FileRelayStore({ filePath: storePath });
  const relayNode = new SingleClientRelayNode({
    server,
    store,
    diagnosticsEnabled: true,
    logger: {
      log: (message) => logs.push(String(message)),
      warn: () => undefined
    }
  });

  await relayNode.init();
  server.onMessageReceived = (message, clientId) => relayNode.onInboundMessage(message, clientId);
  server.onClientConnected = (clientId) => relayNode.onClientConnected(clientId);

  await server.startAdvertising();
  backend.simulateClientConnect("diag-client");

  const message = { kind: "dmesh-msg", msgId: "relay-diag-1", payload: "diag flow" };
  backend.simulateWrite("diag-client", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
  await new Promise((resolve) => setTimeout(resolve, 25));

  await relayNode.runCleanup("diag-test");

  assert(logs.some((line) => line.includes("[RelayNode][diag] flush start")), "flush start diagnostics are emitted");
  assert(logs.some((line) => line.includes("[RelayNode][diag] flush done")), "flush done diagnostics are emitted");
  assert(logs.some((line) => line.includes("[RelayNode][diag] cleanup reason=diag-test")), "cleanup diagnostics are emitted");
});

test("node relay: flush failure keeps message pending and retries on reconnect", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");

  const { backend, store, relayNode, server } = await setupHarness(storePath);
  backend.simulateClientConnect("client-failure");

  const message = { kind: "dmesh-msg", msgId: "relay-failure-1", payload: "retry me" };
  backend.simulateWrite("client-failure", CHARACTERISTICS.MESSAGE_TX, makeDirectPacket(message, message.msgId));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const originalSendMessage = server.sendMessage.bind(server);
  let failOnce = true;
  server.sendMessage = (outboundMessage, clientId) => {
    if (failOnce) {
      failOnce = false;
      return Promise.reject(new Error("simulated send failure"));
    }
    return originalSendMessage(outboundMessage, clientId);
  };

  await relayNode.flushPending("client-failure");
  let pending = await store.listPending();
  assert(pending.length === 1, "failed flush keeps entry pending");
  assert(pending[0].attempts === 1, "failed flush increments attempt counter");
  assert(pending[0].lastError === "simulated send failure", "failed flush records error reason");

  backend.simulateClientDisconnect("client-failure");
  backend.simulateClientConnect("client-failure");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const retryDirect = backend.notifications.find((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(Boolean(retryDirect), "retry replay notification emitted on reconnect");
  backend.simulateWrite(
    "client-failure",
    CHARACTERISTICS.MESSAGE_TX,
    makeAckPacket(decodeTransferIdFromDirectPacket(retryDirect.data))
  );
  await new Promise((resolve) => setTimeout(resolve, 30));

  pending = await store.listPending();
  assert(pending.length === 0, "pending entry is delivered after retry on reconnect");
});

test("node relay: missing subscriber causes send failure and relay entry remains pending", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const { backend, relayNode, store } = await setupHarness(storePath);
  backend.simulateClientConnect("client-nosub");

  await store.addInboundMessage({ kind: "dmesh-msg", msgId: "relay-nosub-1", payload: "pending" }, "client-nosub");

  const originalNotify = backend.notifyCharacteristic.bind(backend);
  backend.notifyCharacteristic = () => Promise.reject(new Error("no subscriber"));

  await relayNode.flushPending("client-nosub");
  let pending = await store.listPending();
  assert(pending.length === 1, "pending entry remains when notify fails");
  assert(pending[0].attempts === 1, "failed notify increments attempt count");

  backend.notifyCharacteristic = originalNotify;
  const flushPromise = relayNode.flushPending("client-nosub");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(directNotifs.length >= 1, "retry emits replay notification");
  backend.simulateWrite(
    "client-nosub",
    CHARACTERISTICS.MESSAGE_TX,
    makeAckPacket(decodeTransferIdFromDirectPacket(directNotifs[directNotifs.length - 1].data))
  );
  await flushPromise;
  pending = await store.listPending();
  assert(pending.length === 0, "pending drains only after notify succeeds and ACK arrives");
});

test("node relay: disconnect during replay does not mark delivered", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const { backend, relayNode, store } = await setupHarness(storePath);
  backend.simulateClientConnect("client-drop");

  await store.addInboundMessage({ kind: "dmesh-msg", msgId: "relay-drop-1", payload: "drop me" }, "client-drop");

  const flushPromise = relayNode.flushPending("client-drop");
  await new Promise((resolve) => setTimeout(resolve, 20));
  backend.simulateClientDisconnect("client-drop");
  await flushPromise;

  const pending = await store.listPending();
  assert(pending.length === 1, "entry remains pending when replay disconnects before ACK");
});

test("node relay: successful replay drains pending queue only after ACK", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const { backend, relayNode, store } = await setupHarness(storePath);
  backend.simulateClientConnect("client-ack");
  await store.addInboundMessage({ kind: "dmesh-msg", msgId: "relay-ack-1", payload: "ack gated" }, "client-ack");

  let resolved = false;
  const flushPromise = relayNode.flushPending("client-ack").then(() => {
    resolved = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  let pending = await store.listPending();
  assert(pending.length === 1, "entry still pending before ACK");
  assert(!resolved, "flush remains pending before ACK");

  const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(directNotifs.length >= 1, "direct replay notification emitted");
  backend.simulateWrite(
    "client-ack",
    CHARACTERISTICS.MESSAGE_TX,
    makeAckPacket(decodeTransferIdFromDirectPacket(directNotifs[0].data))
  );
  await flushPromise;
  pending = await store.listPending();
  assert(pending.length === 0, "entry drains after ACK");
});

test("node relay store: concurrent add + markDelivered + cleanup keeps state readable", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-store-concurrency-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const store = new FileRelayStore({
    filePath: storePath,
    deliveredRetentionMs: 60 * 60 * 1000,
    pendingRetentionMs: 60 * 60 * 1000
  });

  await store.init();
  const seed = await Promise.all(
    Array.from({ length: 8 }, (_, index) => (
      store.addInboundMessage({ kind: "dmesh-msg", msgId: `relay-concurrent-seed-${index}`, payload: String(index) }, "seed")
    ))
  );

  await Promise.all([
    store.markDelivered(seed[0].id, "client-concurrent"),
    store.addInboundMessage({ kind: "dmesh-msg", msgId: "relay-concurrent-new", payload: "new" }, "client-concurrent"),
    store.cleanup(),
    store.markSendFailed(seed[1].id, new Error("simulated failure"))
  ]);

  const persisted = JSON.parse(await fs.readFile(storePath, "utf8"));
  assert(Array.isArray(persisted.entries), "persisted json remains readable after concurrent mutations");
  const delivered = persisted.entries.find((entry) => entry.id === seed[0].id);
  assert(delivered?.status === "delivered", "markDelivered survives concurrent cleanup and writes");
  const newlyAdded = persisted.entries.find((entry) => entry.msgId === "relay-concurrent-new");
  assert(Boolean(newlyAdded), "concurrent addInboundMessage entry is retained");
});

test("node relay store: repeated cleanup during replay does not corrupt persisted state", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-store-cleanup-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const { backend, store, relayNode } = await setupHarness(storePath, {
    deliveredRetentionMs: 60 * 60 * 1000,
    pendingRetentionMs: 60 * 60 * 1000
  });

  backend.simulateClientConnect("client-replay-cleanup");
  await store.addInboundMessage({ kind: "dmesh-msg", msgId: "relay-replay-cleanup-1", payload: "keep safe" }, "client-replay-cleanup");

  const flushPromise = relayNode.flushPending("client-replay-cleanup");
  await new Promise((resolve) => setTimeout(resolve, 20));
  const replayDirect = backend.notifications.find((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(Boolean(replayDirect), "replay notification emitted for cleanup stress test");

  await Promise.all(Array.from({ length: 10 }, () => store.cleanup()));

  backend.simulateWrite(
    "client-replay-cleanup",
    CHARACTERISTICS.MESSAGE_TX,
    makeAckPacket(decodeTransferIdFromDirectPacket(replayDirect.data))
  );
  await flushPromise;

  const persisted = JSON.parse(await fs.readFile(storePath, "utf8"));
  assert(Array.isArray(persisted.entries), "persisted state is valid json after repeated cleanup during replay");
  const pending = await store.listPending();
  assert(pending.length === 0, "replay still drains pending after repeated cleanup calls");
});

test("node relay store: persist temp path generation is unique per write", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lifeline-relay-store-temp-"));
  const storePath = path.join(tmpDir, "relay-store.json");
  const store = new FileRelayStore({ filePath: storePath });

  const paths = new Set(Array.from({ length: 64 }, () => store._nextTempPath()));
  assert(paths.size === 64, "temp path generation should not collide");
  for (const tempPath of paths) {
    assert(tempPath.startsWith(`${storePath}.`) && tempPath.endsWith(".tmp"), "temp path keeps expected naming envelope");
  }
});

(async () => {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
    }
  }

  console.log(`\nnode-server-relay integration: ${passed}/${tests.length} passed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
