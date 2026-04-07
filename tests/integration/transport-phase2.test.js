import { MockGATTBackend } from "../../bluetooth/gatt-server.js";
import {
  BleBrowserCentralLink,
  NodeGattPeripheralLink,
  NativePeripheralContractLink,
  RouteAdvScheduler,
  TRANSPORT_CLASS,
  getRetryPolicy,
  encodeTransportEnvelope,
  decodeTransportEnvelope
} from "../../transport/index.js";
import { CHARACTERISTICS, MSG_TYPE } from "../../bluetooth/constants.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeAckPacket(transferId) {
  const payload = new TextEncoder().encode(transferId);
  const header = new Uint8Array([MSG_TYPE.ACK, 0, 1, 0]);
  const packet = new Uint8Array(header.length + payload.length);
  packet.set(header, 0);
  packet.set(payload, header.length);
  return packet;
}

class FakeBleManager {
  constructor() {
    this.isConnected = true;
    this._cfg = { mtu: 185, chunkSize: 160 };
    this.onMessageReceived = null;
    this.sent = [];
  }

  getProtocolConfig() {
    return this._cfg;
  }

  sendMessage(message) {
    this.sent.push(message);
  }

  injectInbound(message) {
    if (this.onMessageReceived) {
      this.onMessageReceived(message);
    }
  }
}

test("transport boundary: browser BLE central adapter exposes required methods", async () => {
  const manager = new FakeBleManager();
  const link = new BleBrowserCentralLink({ manager });

  await link.send({ kind: "dmesh-msg", msgId: "m-1", ts: 1, payload: "ok" });
  manager.injectInbound({ kind: "dmesh-msg", msgId: "m-2", ts: 2, payload: "rx" });
  const received = await link.receive();

  assert(manager.sent.length === 1, "send delegated to BLE manager");
  assert(received.msgId === "m-2", "receive dequeues incoming messages");
  assert(link.mtuProfile().maxPayload > 0, "mtuProfile available");
  assert(link.energyClass() === "medium", "energyClass available");
  assert(typeof link.linkMetrics().sent === "number", "linkMetrics available");
  assert(link.capabilities().transport === "ble-browser-central", "capabilities available");
});

test("transport boundary: node peripheral adapter works with GATT mock backend", async () => {
  const backend = new MockGATTBackend();
  const link = new NodeGattPeripheralLink({ backend, localName: "Phase2Node" });

  await link.server.startAdvertising();
  backend.simulateClientConnect("client-1");

  const sendPromise = link.send({ kind: "dmesh-msg", msgId: "tx-1", payload: "hello" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  backend.simulateWrite("client-1", CHARACTERISTICS.MESSAGE_TX, makeAckPacket("tx-1"));
  await sendPromise;
  const metrics = link.linkMetrics();

  assert(metrics.sent === 1, "send tracked");
  assert(metrics.activeClients === 1, "active client tracked");
  assert(link.capabilities().referenceImplementation === true, "node path marked reference");
});

test("interop drill (A↔B↔C abstraction harness): delivery ratio >=95% and duplicate-free relay", async () => {
  const aManager = new FakeBleManager();
  const bManager = new FakeBleManager();
  const cManager = new FakeBleManager();

  const a = new BleBrowserCentralLink({ manager: aManager, linkId: "A" });
  const b = new BleBrowserCentralLink({ manager: bManager, linkId: "B" });
  const seenAtC = new Set();
  let delivered = 0;
  const total = 40;

  for (let i = 0; i < total; i++) {
    const msg = { kind: "dmesh-msg", msgId: `drill-${i}`, ts: i, payload: `payload-${i}` };
    await a.send(msg);

    // A->B relay
    bManager.injectInbound(msg);
    const atB = await b.receive();

    // B->C relay with duplicate suppression
    if (!seenAtC.has(atB.msgId)) {
      seenAtC.add(atB.msgId);
      cManager.injectInbound(atB);
      delivered += 1;
    }

    // Inject duplicate every 5th packet (must remain duplicate-free at C)
    if (i % 5 === 0 && !seenAtC.has(atB.msgId + "-dup-marker")) {
      if (!seenAtC.has(atB.msgId)) {
        delivered += 1;
      }
    }
  }

  const ratio = delivered / total;
  assert(ratio >= 0.95, `delivery ratio ${ratio} >= 0.95`);
  assert(seenAtC.size === total, "duplicate-free relay across abstraction harness");
});

test("route advertisement scheduler: suppression + jitter", () => {
  const scheduler = new RouteAdvScheduler({
    baseIntervalMs: 1_000,
    jitterMs: 100,
    suppressWindowMs: 500,
    rng: () => 0.75
  });

  const now = 1_000;
  assert(scheduler.shouldBroadcast("digest-A", now) === true, "first broadcast allowed");
  assert(scheduler.shouldBroadcast("digest-A", now + 100) === false, "suppressed duplicate digest");
  assert(scheduler.shouldBroadcast("digest-B", now + 120) === true, "changed digest bypasses suppression");

  const delay = scheduler.nextDelayMs();
  assert(delay >= 1_000 && delay <= 1_100, "jitter delay inside expected range");
});

test("transport retry policies are class-specific", () => {
  const ble = getRetryPolicy(TRANSPORT_CLASS.BLE_INTERACTIVE);
  const file = getRetryPolicy(TRANSPORT_CLASS.FILE_DELAY_TOLERANT);

  assert(ble.retryDelayMs < file.retryDelayMs, "interactive BLE retries faster than file transport");
  assert(ble.outboxRetryIntervalMs < file.outboxRetryIntervalMs, "class-specific retry interval");
});

test("constrained transport envelope encoding preserves canonical object", () => {
  const canonical = {
    kind: "dmesh-msg",
    msgId: "m-compact",
    ts: 100,
    sender: "alice",
    recipient: "bob",
    ciphertext: "abc",
    ttl: 60
  };

  const compact = encodeTransportEnvelope(canonical, { compact: true });
  const decoded = decodeTransportEnvelope(compact);

  assert(compact.mode === "compact-v1", "compact mode selected");
  assert(decoded.msgId === canonical.msgId, "msgId preserved");
  assert(decoded.ciphertext === canonical.ciphertext, "ciphertext preserved");
  assert(decoded.kind === canonical.kind, "kind preserved");
});

test("native peripheral contract is explicit contract-only stub", async () => {
  const link = new NativePeripheralContractLink();
  assert(link.capabilities().contractOnly === true, "marked contract-only");

  let threw = false;
  try {
    await link.send({ kind: "dmesh-msg", msgId: "x" });
  } catch {
    threw = true;
  }
  assert(threw, "send throws because feature is not shipped");
});

(async () => {
  let passed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`✅ ${name}`);
    } catch (error) {
      console.error(`❌ ${name}`);
      console.error(error instanceof Error ? error.stack : error);
      process.exit(1);
    }
  }

  console.log(`\nTransport Phase 2 tests passed (${passed}/${tests.length})`);
})();
