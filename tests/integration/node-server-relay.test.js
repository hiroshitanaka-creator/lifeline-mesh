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

async function setupHarness(storePath) {
  const backend = new MockGATTBackend();
  const server = new GATTServer({ backend, localName: "RelayHarness" });
  const store = new FileRelayStore({ filePath: storePath });
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
  await new Promise((resolve) => setTimeout(resolve, 40));

  const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
  assert(directNotifs.length >= 1, "pending message replayed to reconnected client");

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
    await new Promise((resolve) => setTimeout(resolve, 40));

    const directNotifs = backend.notifications.filter((notification) => notification.data[0] === MSG_TYPE.DIRECT);
    assert(directNotifs.length >= 1, "persisted pending message replayed after restart");

    const pending = await store.listPending();
    assert(pending.length === 0, "pending message marked delivered after replay");
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
