/**
 * GATTServer Integration Tests
 *
 * All tests run against GATTServer + MockGATTBackend, so no BLE hardware
 * is required.  The MockGATTBackend's simulateWrite() method is used to
 * inject chunked packets as if a real BLE central had written them.
 */

import { GATTServer, MockGATTBackend, GATT_SERVER_ERROR } from "../../bluetooth/gatt-server.js";
import { CHARACTERISTICS, MSG_TYPE } from "../../bluetooth/constants.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a raw BLE packet the way BLEManager._writePacket / GATTServer._buildPacket does.
 * @param {number}     msgType
 * @param {number}     chunkIndex
 * @param {number}     totalChunks
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
function buildPacket(msgType, chunkIndex, totalChunks, payload) {
  const header = new Uint8Array([msgType, chunkIndex, totalChunks, 0]);
  const packet = new Uint8Array(header.length + payload.length);
  packet.set(header, 0);
  packet.set(payload, header.length);
  return packet;
}

/**
 * Encode a single-chunk message the way GATTServer._encodeChunkPayload does.
 */
function encodeChunk(transferId, data) {
  const base64 = Buffer.from(data).toString("base64");
  return new TextEncoder().encode(JSON.stringify({ transferId, data: base64 }));
}

/**
 * Create a complete single-chunk DIRECT packet for a given message object.
 */
function makeDirectPacket(message, transferId) {
  const bytes = new TextEncoder().encode(JSON.stringify(message));
  const payload = encodeChunk(transferId, bytes);
  return buildPacket(MSG_TYPE.DIRECT, 0, 1, payload);
}

/**
 * Create a fresh GATTServer + MockGATTBackend pair.
 */
function makeServer(options = {}) {
  const backend = new MockGATTBackend();
  const server = new GATTServer({ backend, ...options });
  return { server, backend };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("startAdvertising: isAdvertising becomes true", async () => {
  const { server } = makeServer();
  assert(!server.isAdvertising, "not advertising initially");
  await server.startAdvertising();
  assert(server.isAdvertising, "advertising after start");
});

test("startAdvertising: backend receives correct serviceUuid and localName", async () => {
  const { server, backend } = makeServer({ localName: "TestMesh" });
  await server.startAdvertising();
  assert(backend.advertising, "backend is advertising");
  assert(backend.localName === "TestMesh", "backend received localName");
  assert(typeof backend.serviceUuid === "string", "backend received serviceUuid");
});

test("startAdvertising: throws if called twice (already advertising)", async () => {
  const { server } = makeServer();
  await server.startAdvertising();
  let threw = false;
  try {
    await server.startAdvertising();
  } catch (e) {
    threw = true;
    assert(e.message === GATT_SERVER_ERROR.ALREADY_ADVERTISING, "correct error code");
  }
  assert(threw, "should throw on double start");
});

test("startAdvertising: throws without backend", async () => {
  const server = new GATTServer();
  let threw = false;
  try {
    await server.startAdvertising();
  } catch (e) {
    threw = true;
    assert(e.message === GATT_SERVER_ERROR.BACKEND_NOT_SET, "correct error code");
  }
  assert(threw, "should throw without backend");
});

test("stopAdvertising: isAdvertising becomes false", async () => {
  const { server } = makeServer();
  await server.startAdvertising();
  await server.stopAdvertising();
  assert(!server.isAdvertising, "not advertising after stop");
});

test("stopAdvertising: throws if not advertising", async () => {
  const { server } = makeServer();
  let threw = false;
  try {
    await server.stopAdvertising();
  } catch (e) {
    threw = true;
    assert(e.message === GATT_SERVER_ERROR.NOT_ADVERTISING, "correct error code");
  }
  assert(threw, "should throw when not advertising");
});

test("client connect: clientCount increments and onClientConnected fires", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();

  const connected = [];
  server.onClientConnected = (clientId) => connected.push(clientId);

  backend.simulateClientConnect("client-a");

  assert(server.clientCount === 1, "clientCount is 1");
  assert(server.connectedClients.includes("client-a"), "client-a in connectedClients");
  assert(connected[0] === "client-a", "onClientConnected fired with correct id");
});

test("client disconnect: clientCount decrements and onClientDisconnected fires", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();

  const disconnected = [];
  server.onClientDisconnected = (id) => disconnected.push(id);

  backend.simulateClientConnect("client-b");
  assert(server.clientCount === 1, "client connected");

  backend.simulateClientDisconnect("client-b");
  assert(server.clientCount === 0, "clientCount is 0 after disconnect");
  assert(disconnected[0] === "client-b", "onClientDisconnected fired");
});

test("message receive: single-chunk write reassembles and fires onMessageReceived", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-c");

  const received = [];
  server.onMessageReceived = (msg, clientId) => received.push({ msg, clientId });

  const message = { kind: "dmesh-msg", msgId: "rx-test-1", payload: "hello" };
  const packet = makeDirectPacket(message, "rx-test-1");
  backend.simulateWrite("client-c", CHARACTERISTICS.MESSAGE_TX, packet);

  // Allow any microtasks to settle
  await new Promise(r => setTimeout(r, 10));

  assert(received.length === 1, "onMessageReceived called once");
  assert(received[0].msg.msgId === "rx-test-1", "correct msgId");
  assert(received[0].clientId === "client-c", "correct clientId");
});

test("message receive: ACK is sent back to client on MESSAGE_RX", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-d");

  const message = { kind: "dmesh-msg", msgId: "ack-test-1" };
  const packet = makeDirectPacket(message, "ack-test-1");
  backend.simulateWrite("client-d", CHARACTERISTICS.MESSAGE_TX, packet);

  await new Promise(r => setTimeout(r, 10));

  const ackNotifs = backend.notifications.filter(n =>
    n.clientId === "client-d" && n.charUuid === CHARACTERISTICS.MESSAGE_RX
  );
  assert(ackNotifs.length >= 1, "at least one notification sent back (ACK)");

  // The first packet byte of an ACK should be MSG_TYPE.ACK (0x03)
  const ackPacket = ackNotifs[0].data;
  assert(ackPacket[0] === MSG_TYPE.ACK, "ACK packet has correct msgType byte");
});

test("sendMessage: message reaches client via notifyCharacteristic", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-e");

  const outMsg = { kind: "dmesh-msg", msgId: "tx-test-1", payload: "world" };
  await server.sendMessage(outMsg, "client-e");

  const txNotifs = backend.notifications.filter(n => n.clientId === "client-e");
  assert(txNotifs.length >= 1, "notification sent to client-e");
  // First byte of first packet should be MSG_TYPE.DIRECT
  assert(txNotifs[0].data[0] === MSG_TYPE.DIRECT, "DIRECT packet type");
});

test("sendMessage: throws CLIENT_NOT_FOUND for unknown client", async () => {
  const { server } = makeServer();
  await server.startAdvertising();

  let threw = false;
  try {
    await server.sendMessage({ msgId: "x" }, "nonexistent-client");
  } catch (e) {
    threw = true;
    assert(e.message === GATT_SERVER_ERROR.CLIENT_NOT_FOUND, "correct error code");
  }
  assert(threw, "should throw for unknown client");
});

test("broadcast: message reaches all connected clients", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-f");
  backend.simulateClientConnect("client-g");

  const outMsg = { kind: "dmesh-msg", msgId: "bcast-1" };
  await server.broadcast(outMsg);

  const fNotifs = backend.notifications.filter(n => n.clientId === "client-f");
  const gNotifs = backend.notifications.filter(n => n.clientId === "client-g");
  assert(fNotifs.length >= 1, "client-f received broadcast");
  assert(gNotifs.length >= 1, "client-g received broadcast");
});

test("stopAdvertising: clears client list", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-h");
  assert(server.clientCount === 1, "client connected");

  await server.stopAdvertising();
  assert(server.clientCount === 0, "clients cleared after stop");
});

test("setBackend: can swap backend after construction", async () => {
  const server = new GATTServer({ localName: "SwapTest" });
  const backend2 = new MockGATTBackend();
  server.setBackend(backend2);

  await server.startAdvertising();
  assert(backend2.advertising, "second backend is advertising");
  assert(backend2.localName === "SwapTest", "localName passed to second backend");
});

test("getSnapshot: returns advertising state and client list", async () => {
  const { server, backend } = makeServer({ localName: "SnapTest" });
  await server.startAdvertising();
  backend.simulateClientConnect("client-snap");

  const snap = server.getSnapshot();
  assert(snap.advertising === true, "snapshot shows advertising");
  assert(snap.localName === "SnapTest", "snapshot has localName");
  assert(snap.clientCount === 1, "snapshot clientCount");
  assert(snap.clients.includes("client-snap"), "snapshot clients list");
});

test("write to non-TX characteristic is ignored (no error)", async () => {
  const { server, backend } = makeServer();
  await server.startAdvertising();
  backend.simulateClientConnect("client-z");

  const received = [];
  server.onMessageReceived = (msg) => received.push(msg);

  // Write to IDENTITY characteristic instead of MESSAGE_TX — should be silently ignored
  const dummyPacket = new Uint8Array([MSG_TYPE.DIRECT, 0, 1, 0, 1, 2, 3]);
  backend.simulateWrite("client-z", CHARACTERISTICS.IDENTITY, dummyPacket);

  await new Promise(r => setTimeout(r, 10));
  assert(received.length === 0, "write to non-TX char is silently ignored");
});

// ─── Runner ───────────────────────────────────────────────────────────────────

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

  console.log(`\ngatt-server integration: ${passed}/${tests.length} passed`);
  if (failed > 0) process.exit(1);
})();
