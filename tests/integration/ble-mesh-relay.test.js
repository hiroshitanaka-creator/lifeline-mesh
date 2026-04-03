/**
 * BLE + MeshRouter runtime integration tests.
 *
 * Verifies that MeshRouter.shouldForward() is called inside
 * BLEManager._handleIncomingData() and that the onForward callback fires
 * (or is suppressed) as expected for Phase 1 relay semantics.
 *
 * What these tests cover:
 *   1. onForward fires for a forwardable message (happy path)
 *   2. onForward is suppressed when router deduplicates a known transferId
 *   3. onForward is suppressed when the hop budget is exhausted
 *   4. Existing direct-delivery path is unaffected when no router is set
 *   5. A→B→C: B receives from A, onForward delivers to C; relay metadata correct
 *
 * What is NOT tested here (out of Phase 1 scope):
 *   - Multi-peer egress selection (B_tx to multiple peers)
 *   - GATT server / peripheral mode
 *   - N-hop routing
 */

/* eslint-disable require-await */
import { BLEManager } from "../../bluetooth/ble-manager.js";
import { MeshRouter } from "../../bluetooth/mesh-router.js";

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
  const inbox = [];
  const seen = new Set();
  return {
    inbox,
    async addToOutbox(message, recipientFp, meta = {}) {
      outbox.set(message.msgId, {
        msgId: message.msgId,
        message,
        recipientFp,
        ...meta,
        attempts: meta.attempts || 0
      });
    },
    async addToInbox(entry) {
      inbox.push(entry);
    },
    async getPendingOutbox() {
      return [...outbox.values()].filter((e) => e.status !== "delivered");
    },
    async getFailedOutbox() {
      return [...outbox.values()].filter((e) => e.status === "failed");
    },
    async getOutboxForLink(linkId) {
      return [...outbox.values()].filter((e) => e.linkId === linkId);
    },
    async getOutboxByMinPriority(minPriority) {
      return [...outbox.values()].filter((e) => (e.priority ?? 0) >= minPriority);
    },
    async removeFromOutbox(msgId) {
      outbox.delete(msgId);
    },
    async updateOutboxStatus(msgId, status, fields = {}) {
      const existing = outbox.get(msgId);
      if (!existing) return;
      outbox.set(msgId, { ...existing, status, ...fields });
    },
    async checkAndMarkSeen(msgId, senderFp) {
      const key = `${msgId}:${senderFp}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
  };
}

/**
 * Creates a sender→receiver pair linked in-memory.
 * Sender chunks are delivered synchronously to receiver._handleIncomingData.
 * Receiver ACKs go back to sender via setTimeout(0) so that _waitForAck in
 * the sender resolves after the current synchronous call stack completes.
 *
 * @param {Object} [options]
 * @param {MeshRouter} [options.router] - Passed to the receiver.
 */
function createLinkedManagers(options = {}) {
  const senderStore = createInMemoryStore();
  const receiverStore = createInMemoryStore();

  const sender = new BLEManager({ store: senderStore });
  const receiver = new BLEManager({
    store: receiverStore,
    router: options.router || null
  });

  sender.isConnected = true;
  receiver.isConnected = true;

  sender.txCharacteristic = {
    async writeValue(packet) {
      await receiver._handleIncomingData({
        target: { value: packetToDataView(packet) }
      });
    }
  };

  receiver.txCharacteristic = {
    async writeValue(packet) {
      setTimeout(() => {
        sender._handleIncomingData({
          target: { value: packetToDataView(packet) }
        });
      }, 0);
    }
  };

  return { sender, receiver, senderStore, receiverStore };
}

/**
 * Builds a minimal valid-looking Lifeline Mesh message.
 * BLEManager does not decrypt, so the crypto fields just need to be present.
 */
function makeDummyMessage(msgId) {
  return {
    kind: "dmesh-msg",
    v: 1,
    ts: Date.now(),
    msgId,
    sndr: "test-sender-fp",
    rcpt: "test-recipient-fp",
    senderSignPK: "dGVzdA==",
    senderBoxPK: "dGVzdA==",
    recipientBoxPK: "dGVzdA==",
    ephPK: "dGVzdA==",
    nonce: "dGVzdGVzdGVzdGVzdGVzdGVz",
    ciphertext: "dGVzdA==",
    signature: "dGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVzdGVz"
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test("relay: onForward fires when router says forward", async () => {
  const router = new MeshRouter({ localPeerId: "B", defaultMaxHops: 1 });
  const { sender, receiver } = createLinkedManagers({ router });

  const forwarded = [];
  receiver.onForward = (msg) => forwarded.push(msg);

  const msg = makeDummyMessage("relay-forward-001");
  await sender.sendMessage(msg);

  assert(forwarded.length === 1, "onForward fires exactly once");
  assert(forwarded[0].msgId === msg.msgId, "forwarded message is the original");
  assert(forwarded[0].relay !== undefined, "relay metadata stamped");
  assert(forwarded[0].relay.hops === 1, "relay.hops incremented to 1");
  assert(forwarded[0].relay.via === "B", "relay.via matches router localPeerId");
});

test("relay: router dedup suppresses onForward for repeated transferId", async () => {
  // A shared router instance accumulates seen-message state across
  // separate BLE connections, so a message that arrives via two paths
  // is only forwarded once.
  const router = new MeshRouter({ localPeerId: "B", defaultMaxHops: 2 });
  const forwarded = [];

  // First arrival path
  const { sender: s1, receiver: r1 } = createLinkedManagers({ router });
  r1.onForward = (msg) => forwarded.push(msg);

  const msg = makeDummyMessage("relay-dedup-002");
  await s1.sendMessage(msg);
  assert(forwarded.length === 1, "first arrival: onForward fires");
  assert(router.hasSeen(msg.msgId), "router records the transferId");

  // Second arrival via a different connection (different store, same router).
  // Use a different sndr so the store does not suppress it — only the router dedup
  // should stop the second onForward call.
  const { sender: s2, receiver: r2 } = createLinkedManagers({ router });
  r2.onForward = (msg) => forwarded.push(msg);

  const sameIdMsg = { ...msg, sndr: "other-sender-fp" };
  await s2.sendMessage(sameIdMsg);

  assert(forwarded.length === 1, "second arrival (same transferId): onForward suppressed by router");
});

test("relay: onForward suppressed when hop budget exhausted", async () => {
  const router = new MeshRouter({ localPeerId: "C", defaultMaxHops: 1 });
  const { sender, receiver } = createLinkedManagers({ router });

  const forwarded = [];
  receiver.onForward = (msg) => forwarded.push(msg);

  // Arrive at C with hops already equal to maxHops (exhausted budget).
  const msg = {
    ...makeDummyMessage("relay-hops-003"),
    relay: { via: "B", hops: 1, maxHops: 1 }
  };
  await sender.sendMessage(msg);

  assert(forwarded.length === 0, "onForward NOT called when hops >= maxHops");
  assert(!router.hasSeen(msg.msgId), "exhausted message not added to router seen-map");
});

test("relay: direct delivery path unaffected when no router is set", async () => {
  // Standard pair with no router — existing behavior must be unchanged.
  const { sender, receiver } = createLinkedManagers();

  const received = [];
  receiver.onMessageReceived = (msg) => received.push(msg);

  const msg = makeDummyMessage("relay-direct-004");
  await sender.sendMessage(msg);

  assert(received.length === 1, "onMessageReceived fires as before");
  assert(received[0].msgId === msg.msgId, "message ID preserved");
  assert(receiver.onForward === null, "onForward remains null");
});

test("relay: A→B→C - B receives from A and routes to C via onForward", async () => {
  // This test demonstrates the full Phase 1 integration seam:
  //   A sends encrypted message → B's BLEManager (with router) receives it
  //   → router stamps relay metadata → onForward delivers to C.
  //
  // In production, onForward would call B_egress.sendMessage(message) for
  // each connected peer except the ingress peer.  Here we simulate C's
  // receipt synchronously via the callback to keep the test deterministic.
  const router = new MeshRouter({ localPeerId: "B", defaultMaxHops: 1 });
  const { sender: nodeA, receiver: nodeB } = createLinkedManagers({ router });

  const receivedByC = [];
  nodeB.onForward = (message) => {
    // Caller (application layer) is responsible for peer selection and egress.
    // Simulate: B delivers forwarded message to C.
    receivedByC.push(message);
  };

  const originalMsg = makeDummyMessage("relay-abc-005");
  await nodeA.sendMessage(originalMsg);

  assert(receivedByC.length === 1, "C received the relayed message");
  assert(receivedByC[0].msgId === originalMsg.msgId, "message ID preserved through relay");
  assert(receivedByC[0].relay?.via === "B", "relay.via identifies B as the relay node");
  assert(receivedByC[0].relay?.hops === 1, "1 hop consumed");
  assert(receivedByC[0].relay?.maxHops === 1, "maxHops carried through");
});

test("flushOutbox: sends only entries for active link and prioritizes higher priority", async () => {
  const store = createInMemoryStore();
  const manager = new BLEManager({ store });

  manager.isConnected = true;
  manager.device = { id: "peer-b" };
  manager.txCharacteristic = { async writeValue() { return Promise.resolve(); } };

  const sendOrder = [];
  manager._sendQueuedEntry = async (entry) => {
    sendOrder.push(entry.msgId);
    await store.removeFromOutbox(entry.msgId);
  };

  await store.addToOutbox(makeDummyMessage("normal-peer-b"), "peer-z", {
    status: "pending",
    linkId: "peer-b",
    priority: 0
  });
  await store.addToOutbox(makeDummyMessage("high-peer-b"), "peer-z", {
    status: "pending",
    linkId: "peer-b",
    priority: 1
  });
  await store.addToOutbox(makeDummyMessage("other-link"), "peer-z", {
    status: "pending",
    linkId: "peer-x",
    priority: 2
  });

  await manager.flushOutbox();

  assert(sendOrder.length === 2, "only active-link entries are sent");
  assert(sendOrder[0] === "high-peer-b", "higher priority entry sent first");
  assert(sendOrder[1] === "normal-peer-b", "lower priority entry sent second");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }
  console.log(`\nTests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
})();
