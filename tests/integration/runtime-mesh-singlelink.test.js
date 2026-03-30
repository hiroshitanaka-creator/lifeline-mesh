import { BLEManager } from "../../bluetooth/ble-manager.js";
import { createRuntimeMeshWiring } from "../../app/src/runtime-mesh.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function packetToDataView(packet) {
  return new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
}

function createInMemoryStore() {
  const outbox = new Map();
  const seen = new Set();
  return {
    addToOutbox(message, recipientFp, meta = {}) {
      outbox.set(message.msgId, {
        msgId: message.msgId,
        message,
        recipientFp,
        ...meta,
        attempts: meta.attempts || 0
      });
      return Promise.resolve();
    },
    addToInbox() {
      return Promise.resolve();
    },
    getPendingOutbox() {
      return Promise.resolve([...outbox.values()].filter((e) => e.status !== "delivered"));
    },
    removeFromOutbox(msgId) {
      outbox.delete(msgId);
      return Promise.resolve();
    },
    updateOutboxStatus(msgId, status, fields = {}) {
      const existing = outbox.get(msgId);
      if (!existing) return Promise.resolve();
      outbox.set(msgId, { ...existing, status, ...fields });
      return Promise.resolve();
    },
    checkAndMarkSeen(msgId, senderFp) {
      const key = `${msgId}:${senderFp}`;
      if (seen.has(key)) return Promise.resolve(false);
      seen.add(key);
      return Promise.resolve(true);
    }
  };
}

function makeDummyMessage(msgId) {
  return {
    kind: "dmesh-msg",
    v: 1,
    ts: Date.now(),
    msgId,
    sndr: "sender-a",
    rcpt: "recipient-c",
    senderSignPK: "dGVzdA==",
    senderBoxPK: "dGVzdA==",
    recipientBoxPK: "dGVzdA==",
    ephPK: "dGVzdA==",
    nonce: "dGVzdGVzdGVzdGVzdGVzdGVz",
    ciphertext: "dGVzdA==",
    signature: "dGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVz"
  };
}

test("runtime single-link: router+onForward path updates no-egress relay state", async () => {
  const runtimeMesh = createRuntimeMeshWiring({
    localPeerId: "node-b",
    now: () => 1711111111111
  });

  const sender = new BLEManager({ store: createInMemoryStore() });
  const relay = new BLEManager({
    store: createInMemoryStore(),
    router: runtimeMesh.router
  });

  relay.onForward = runtimeMesh.onForward;
  relay.device = { id: "peer-a", name: "Peer A" };
  runtimeMesh.onConnectionChange(true, relay.device);

  sender.isConnected = true;
  relay.isConnected = true;

  sender.txCharacteristic = {
    async writeValue(packet) {
      await relay._handleIncomingData({ target: { value: packetToDataView(packet) } });
    }
  };

  relay.txCharacteristic = {
    writeValue(packet) {
      setTimeout(() => {
        sender._handleIncomingData({ target: { value: packetToDataView(packet) } });
      }, 0);
      return Promise.resolve();
    }
  };

  await sender.sendMessage(makeDummyMessage("runtime-single-001"));

  assert(runtimeMesh.relayState.seenTransfers === 1, "router seen transfer count updated");
  assert(runtimeMesh.relayState.lastRelayEvent === "no-egress-peer", "single-link no-egress event recorded");
  assert(runtimeMesh.relayState.relayNoEgressCount === 1, "no-egress counter incremented");
  assert(runtimeMesh.relayState.lastIngressPeerId === "peer-a", "ingress peer recorded");
  assert(runtimeMesh.relayState.lastForwardedMsgId === "runtime-single-001", "message id recorded");
  assert(runtimeMesh.relayState.lastRelayAt === 1711111111111, "timestamp recorded");
});

test("runtime single-link: local peer id and connection state are reflected", () => {
  const runtimeMesh = createRuntimeMeshWiring({ localPeerId: "before" });
  runtimeMesh.updateLocalPeerId("after");
  runtimeMesh.onConnectionChange(true, { id: "peer-x", name: "Peer X" });

  assert(runtimeMesh.relayState.localPeerId === "after", "local peer id updated");
  assert(runtimeMesh.relayState.connectedPeerId === "peer-x", "connected peer id set");
  assert(runtimeMesh.relayState.connectedPeerName === "Peer X", "connected peer name set");

  runtimeMesh.onConnectionChange(false, { id: "peer-x", name: "Peer X" });
  assert(runtimeMesh.relayState.connectedPeerId === null, "connected peer cleared on disconnect");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ runtime-mesh-singlelink: ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ runtime-mesh-singlelink: ${name}`);
      console.error(`  ${error.message}`);
      failed += 1;
    }
  }

  console.log("\n" + "=".repeat(40));
  console.log(`Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
})();
