/* eslint-disable require-await, no-empty-function */
import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as DMesh from "../../crypto/core.js";
import { BLEManager } from "../../bluetooth/ble-manager.js";
import { TransportManager } from "../../crypto/transport.js";
import { OUTBOX_RETRY_INTERVAL_MS } from "../../crypto/store.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function packetToDataView(packet) {
  return new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
}

function createInMemoryStore() {
  const outbox = new Map();
  const inbox = [];
  const seen = new Set();
  const chunks = new Map();
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
    async removeFromOutbox(msgId) {
      outbox.delete(msgId);
    },
    async updateOutboxStatus(msgId, status, fields = {}) {
      const existing = outbox.get(msgId);
      if (!existing) {
        return;
      }
      const { countAttempt = false, ...rest } = fields;
      outbox.set(msgId, {
        ...existing,
        status,
        ...rest,
        ...(countAttempt
          ? {
            attempts: (existing.attempts || 0) + 1,
            lastAttempt: Date.now()
          }
          : {})
      });
    },
    async checkAndMarkSeen(msgId, senderFp) {
      const key = `${msgId}:${senderFp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    },
    async storeChunk(chunk) {
      const key = `${chunk.msgId}:${chunk.seq}`;
      if (chunks.has(key)) {
        return null;
      }

      chunks.set(key, { ...chunk, receivedAt: Date.now() });
      const messageChunks = [...chunks.values()]
        .filter((entry) => entry.msgId === chunk.msgId)
        .sort((a, b) => a.seq - b.seq);

      if (messageChunks.some((entry) => entry.total !== chunk.total)) {
        for (const entry of messageChunks) {
          chunks.delete(`${entry.msgId}:${entry.seq}`);
        }
        throw new Error("Inconsistent chunk totals detected");
      }

      if (messageChunks.length !== chunk.total) {
        return null;
      }

      for (let i = 0; i < messageChunks.length; i++) {
        if (messageChunks[i].seq !== i) {
          return null;
        }
      }

      for (const entry of messageChunks) {
        chunks.delete(`${entry.msgId}:${entry.seq}`);
      }

      return messageChunks.map((entry) => ({
        v: 1,
        kind: "dmesh-chunk",
        msgId: entry.msgId,
        seq: entry.seq,
        total: entry.total,
        data: entry.data
      }));
    },
    async getPendingChunks(msgId) {
      return [...chunks.values()].filter((entry) => entry.msgId === msgId);
    },
    async cleanupOldChunks(maxAgeMs = 24 * 60 * 60 * 1000) {
      const cutoff = Date.now() - maxAgeMs;
      for (const [key, entry] of chunks.entries()) {
        if (entry.receivedAt < cutoff) {
          chunks.delete(key);
        }
      }
    },
    async clearPendingChunks(msgId) {
      for (const key of [...chunks.keys()]) {
        if (key.startsWith(`${msgId}:`)) {
          chunks.delete(key);
        }
      }
    },
    snapshot() {
      return [...outbox.values()];
    },
    pendingChunks(msgId) {
      return [...chunks.values()].filter((entry) => entry.msgId === msgId);
    }
  };
}

function createLinkedManagers(options = {}) {
  const senderStore = options.senderStore || createInMemoryStore();
  const receiverStore = options.receiverStore || createInMemoryStore();

  const sender = new BLEManager({
    protocolConfig: options.protocolConfig,
    store: senderStore,
    transportManager: options.transportManager
  });
  const receiver = new BLEManager({
    protocolConfig: options.protocolConfig,
    store: receiverStore
  });

  sender.isConnected = true;
  receiver.isConnected = true;

  sender.txCharacteristic = {
    async writeValue(packet) {
      await receiver._handleIncomingData({
        target: {
          value: packetToDataView(packet)
        }
      });
    }
  };

  receiver.txCharacteristic = {
    async writeValue(packet) {
      setTimeout(() => {
        sender._handleIncomingData({
          target: {
            value: packetToDataView(packet)
          }
        });
      }, 0);
    }
  };

  return { sender, receiver, senderStore, receiverStore };
}

test("integration: encrypt -> BLE send -> decrypt mainline", async () => {
  const aliceSign = DMesh.generateSignKeyPair(nacl);
  const aliceBox = DMesh.generateBoxKeyPair(nacl);
  const bobBox = DMesh.generateBoxKeyPair(nacl);
  const { sender, receiver } = createLinkedManagers();

  const encrypted = DMesh.encryptMessage({
    content: "Emergency beacon: Shelter A is safe.",
    senderSignPK: aliceSign.publicKey,
    senderSignSK: aliceSign.secretKey,
    senderBoxPK: aliceBox.publicKey,
    senderBoxSK: aliceBox.secretKey,
    recipientBoxPK: bobBox.publicKey,
    type: "im_safe"
  }, nacl, naclUtil);

  let receivedMessage = null;
  receiver.onMessageReceived = (message) => {
    receivedMessage = message;
  };

  await sender.sendMessage(encrypted);

  if (!receivedMessage) {
    throw new Error("BLE receiver did not reassemble message");
  }

  const result = DMesh.decryptMessage({
    message: receivedMessage,
    recipientBoxPK: bobBox.publicKey,
    recipientBoxSK: bobBox.secretKey,
    expectedSenderSignPK: aliceSign.publicKey,
    expectedSenderBoxPK: aliceBox.publicKey
  }, nacl, naclUtil);

  if (result.content !== "Emergency beacon: Shelter A is safe.") {
    throw new Error("Decrypted content mismatch after BLE transport");
  }
});

test("integration: configurable chunk/ack/retry params are applied", async () => {
  const { sender } = createLinkedManagers({
    protocolConfig: {
      mtu: 120,
      chunkSize: 80,
      ackTimeoutMs: 100,
      retryCount: 2,
      retryDelayMs: 5
    }
  });

  if (sender.protocolConfig.chunkSize !== 80) {
    throw new Error("Expected custom chunkSize to be applied");
  }
  if (sender.protocolConfig.ackTimeoutMs !== 100) {
    throw new Error("Expected custom ACK timeout to be applied");
  }
  if (sender.protocolConfig.retryCount !== 2) {
    throw new Error("Expected custom retryCount to be applied");
  }
});

test("integration: runtime protocol config update applies bounds", async () => {
  const manager = new BLEManager({
    protocolConfig: {
      ackTimeoutMs: 400,
      retryCount: 2,
      retryDelayMs: 5,
      reassemblyTimeoutMs: 5000
    }
  });

  const next = manager.updateProtocolConfig({
    ackTimeoutMs: 50,
    retryCount: 0,
    retryDelayMs: -5,
    reassemblyTimeoutMs: 200
  });

  if (next.ackTimeoutMs !== 100) {
    throw new Error(`Expected ackTimeoutMs lower bound 100, got ${next.ackTimeoutMs}`);
  }
  if (next.retryCount !== 1) {
    throw new Error(`Expected retryCount lower bound 1, got ${next.retryCount}`);
  }
  if (next.retryDelayMs !== 0) {
    throw new Error(`Expected retryDelayMs lower bound 0, got ${next.retryDelayMs}`);
  }
  if (next.reassemblyTimeoutMs !== 1000) {
    throw new Error(`Expected reassemblyTimeoutMs lower bound 1000, got ${next.reassemblyTimeoutMs}`);
  }
});

test("integration: reorder + duplicate chunks still reassemble once", async () => {
  const { sender, receiver } = createLinkedManagers({
    protocolConfig: { chunkSize: 80 }
  });

  const outgoingPackets = [];
  sender.txCharacteristic = {
    async writeValue(packet) {
      outgoingPackets.push(packet.slice());
    }
  };
  sender._waitForAck = async () => {};

  let received = 0;
  receiver.onMessageReceived = () => {
    received += 1;
  };

  await sender.sendMessage({
    kind: "dmesh-msg",
    msgId: "reorder-case",
    payload: "y".repeat(700),
    ts: Date.now()
  });

  const directPackets = outgoingPackets.filter((packet) => packet[0] !== 0x03);
  if (directPackets.length < 3) {
    throw new Error("Expected multiple chunks for reorder test");
  }

  const sequence = [directPackets[1], directPackets[0], directPackets[1], ...directPackets.slice(2)];
  for (const packet of sequence) {
    await receiver._handleIncomingData({ target: { value: packetToDataView(packet) } });
  }

  if (received !== 1) {
    throw new Error(`Expected one reassembled message, got ${received}`);
  }
});

test("integration: missing BLE chunk does not emit complete message", async () => {
  const { sender, receiver } = createLinkedManagers({
    protocolConfig: { chunkSize: 80 }
  });

  const outgoingPackets = [];
  sender.txCharacteristic = {
    async writeValue(packet) {
      outgoingPackets.push(packet.slice());
    }
  };
  sender._waitForAck = async () => {};

  let receivedMessage = null;
  receiver.onMessageReceived = (message) => {
    receivedMessage = message;
  };

  await sender.sendMessage({
    kind: "dmesh-msg",
    msgId: "missing-case",
    payload: "x".repeat(900),
    ts: Date.now()
  });

  const directPackets = outgoingPackets.filter((packet) => packet[0] !== 0x03);
  if (directPackets.length < 2) {
    throw new Error("Expected at least 2 BLE chunks in test setup");
  }

  for (const packet of directPackets.filter((_, i) => i !== 1)) {
    await receiver._handleIncomingData({ target: { value: packetToDataView(packet) } });
  }

  if (receivedMessage !== null) {
    throw new Error("Receiver should not emit message when a chunk is missing");
  }
});

test("integration: duplicate complete BLE message is deduplicated in inbox", async () => {
  const { sender, receiver, receiverStore } = createLinkedManagers({
    protocolConfig: { chunkSize: 80 }
  });

  const outgoingPackets = [];
  sender.txCharacteristic = {
    async writeValue(packet) {
      outgoingPackets.push(packet.slice());
    }
  };
  sender._waitForAck = async () => {};

  let received = 0;
  receiver.onMessageReceived = () => {
    received += 1;
  };

  await sender.sendMessage({
    kind: "dmesh-msg",
    msgId: "dedupe-case",
    sndr: "sender-a",
    payload: "d".repeat(300),
    ts: Date.now()
  });

  const directPackets = outgoingPackets.filter((packet) => packet[0] !== 0x03);

  for (const packet of directPackets) {
    await receiver._handleIncomingData({ target: { value: packetToDataView(packet) } });
  }
  for (const packet of directPackets) {
    await receiver._handleIncomingData({ target: { value: packetToDataView(packet) } });
  }

  if (received !== 1) {
    throw new Error(`Expected one onMessageReceived callback for duplicate complete message, got ${received}`);
  }
  if (receiverStore.inbox.length !== 1) {
    throw new Error(`Expected one inbox entry after duplicate delivery, got ${receiverStore.inbox.length}`);
  }
});

test("integration: persisted chunks resume across receiver restart", async () => {
  const sharedStore = createInMemoryStore();
  const sender = new BLEManager({ protocolConfig: { chunkSize: 80 }, store: createInMemoryStore() });
  sender.isConnected = true;

  const outgoingPackets = [];
  sender.txCharacteristic = {
    async writeValue(packet) {
      outgoingPackets.push(packet.slice());
    }
  };
  sender._waitForAck = async () => {};

  await sender.sendMessage({
    kind: "dmesh-msg",
    msgId: "resume-case",
    sndr: "sender-a",
    payload: "r".repeat(700),
    ts: Date.now()
  });

  const directPackets = outgoingPackets.filter((packet) => packet[0] !== 0x03);
  const firstReceiver = new BLEManager({ protocolConfig: { chunkSize: 80 }, store: sharedStore });
  firstReceiver.isConnected = true;
  await firstReceiver._handleIncomingData({ target: { value: packetToDataView(directPackets[0]) } });

  if (sharedStore.pendingChunks("resume-case").length !== 1) {
    throw new Error("Expected first chunk to be persisted before restart");
  }

  const resumedReceiver = new BLEManager({ protocolConfig: { chunkSize: 80 }, store: sharedStore });
  resumedReceiver.isConnected = true;
  resumedReceiver.txCharacteristic = { async writeValue() {} };
  let received = 0;
  resumedReceiver.onMessageReceived = () => {
    received += 1;
  };

  for (const packet of directPackets.slice(1)) {
    await resumedReceiver._handleIncomingData({ target: { value: packetToDataView(packet) } });
  }

  if (received !== 1) {
    throw new Error(`Expected resumed receiver to emit once, got ${received}`);
  }
  if (sharedStore.pendingChunks("resume-case").length !== 0) {
    throw new Error("Expected persisted chunks to be cleaned up after completion");
  }
});

test("integration: stale persisted chunks are cleaned before reassembly", async () => {
  const store = createInMemoryStore();
  const manager = new BLEManager({ store, protocolConfig: { chunkSize: 80, reassemblyTimeoutMs: 1000 } });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  await store.storeChunk({
    v: 1,
    kind: "dmesh-chunk",
    msgId: "stale-case",
    seq: 0,
    total: 2,
    data: Buffer.from("stale").toString("base64")
  });

  const stale = store.pendingChunks("stale-case")[0];
  stale.receivedAt = Date.now() - 60_000;

  const chunkPayload = new TextEncoder().encode(JSON.stringify({
    transferId: "stale-case",
    data: Buffer.from("fresh").toString("base64")
  }));
  const packet = new Uint8Array([0x01, 0x00, 0x02, 0x00, ...chunkPayload]);
  await manager._handleIncomingData({ target: { value: packetToDataView(packet) } });

  if (store.pendingChunks("stale-case").length !== 1) {
    throw new Error("Expected stale chunk cleanup to remove old residue before storing fresh chunk");
  }
});

test("integration: inconsistent persisted total aborts transfer and purges chunk store", async () => {
  const store = createInMemoryStore();
  await store.storeChunk({
    v: 1,
    kind: "dmesh-chunk",
    msgId: "mismatch-case",
    seq: 0,
    total: 2,
    data: Buffer.from("a").toString("base64")
  });

  const manager = new BLEManager({ store });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };
  const errors = [];
  manager.onError = (_code, error) => errors.push(error.message);

  const chunkPayload = new TextEncoder().encode(JSON.stringify({
    transferId: "mismatch-case",
    data: Buffer.from("b").toString("base64")
  }));
  const packet = new Uint8Array([0x01, 0x01, 0x03, 0x00, ...chunkPayload]);
  await manager._handleIncomingData({ target: { value: packetToDataView(packet) } });

  if (!errors.some((message) => /Mismatched totalChunks/.test(message))) {
    throw new Error("Expected mismatched totalChunks error");
  }
  if (store.pendingChunks("mismatch-case").length !== 0) {
    throw new Error("Expected inconsistent persisted chunks to be purged");
  }
});

test("integration: rejects invalid BLE packet header before decode", async () => {
  const { receiver } = createLinkedManagers();

  const errors = [];
  receiver.onError = (code) => {
    errors.push(code);
  };

  await receiver._handleIncomingData({
    target: {
      value: new DataView(new Uint8Array([0x01, 0x00, 0x01]).buffer)
    }
  });

  if (!errors.includes("BLE_RECEIVE_FAILED")) {
    throw new Error("Expected BLE_RECEIVE_FAILED for short header packet");
  }
});

test("integration: rejects receive state mismatch by msgType", async () => {
  const manager = new BLEManager();

  await manager._getOrCreateReceiveState(0x01, 2, "transfer-1");

  let threw = false;
  try {
    await manager._getOrCreateReceiveState(0x02, 2, "transfer-1");
  } catch (error) {
    threw = /Mismatched msgType/.test(error.message);
  }

  if (!threw) {
    throw new Error("Expected mismatched msgType to throw");
  }
});

test("integration: low-level send rejects payload requiring over 255 chunks", async () => {
  const manager = new BLEManager({
    protocolConfig: { chunkSize: 16 }
  });

  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const tooLarge = {
    kind: "dmesh-msg",
    msgId: "too-many-chunks",
    payload: "z".repeat(5000),
    ts: Date.now()
  };

  let threw = false;
  try {
    await manager._sendMessageWithAck(tooLarge);
  } catch (error) {
    threw = /max 255/.test(error.message);
  }

  if (!threw) {
    throw new Error("Expected sendMessage to reject when chunk count exceeds protocol limit");
  }
});

test("integration: flushOutbox skips invalid and non-ble entries", async () => {
  const store = {
    async getPendingOutbox() {
      return [
        { transport: "ble", msgId: "missing-message" },
        { transport: "clipboard", msgId: "clipboard-1", message: { msgId: "clipboard-1" } },
        { transport: "ble", msgId: "ble-1", message: { kind: "dmesh-msg", msgId: "ble-1", payload: "ok" } }
      ];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox() {},
    async updateOutboxStatus() {}
  };

  const manager = new BLEManager({ store });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const sent = [];
  manager._sendQueuedEntry = async (entry) => {
    sent.push(entry.msgId);
  };

  await manager.flushOutbox();

  if (sent.length !== 1 || sent[0] !== "ble-1") {
    throw new Error(`Expected only ble-1 to be sent, got: ${sent.join(",")}`);
  }
});

test("integration: flushOutbox retries stale failed entries but skips cooldown failures", async () => {
  const now = Date.now();
  const store = {
    async getPendingOutbox() {
      return [
        {
          transport: "ble",
          msgId: "pending-1",
          status: "pending",
          message: { kind: "dmesh-msg", msgId: "pending-1", payload: "pending" }
        }
      ];
    },
    async getFailedOutbox() {
      return [
        {
          transport: "ble",
          msgId: "failed-recent",
          status: "failed",
          lastAttempt: now,
          message: { kind: "dmesh-msg", msgId: "failed-recent", payload: "cooldown" }
        },
        {
          transport: "ble",
          msgId: "failed-stale",
          status: "failed",
          lastAttempt: now - OUTBOX_RETRY_INTERVAL_MS - 1,
          message: { kind: "dmesh-msg", msgId: "failed-stale", payload: "retry" }
        }
      ];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox() {},
    async updateOutboxStatus() {}
  };

  const manager = new BLEManager({ store });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const sent = [];
  manager._sendQueuedEntry = async (entry) => {
    sent.push(entry.msgId);
  };

  await manager.flushOutbox();

  if (sent.length !== 2 || !sent.includes("failed-stale") || !sent.includes("pending-1")) {
    throw new Error(`Expected stale failed + pending to be sent, got: ${sent.join(",")}`);
  }
  if (sent.includes("failed-recent")) {
    throw new Error("Expected recent failed entry to remain in cooldown");
  }
});

test("integration: stale failed retry failure does not block pending flush", async () => {
  const now = Date.now();
  const store = {
    async getPendingOutbox() {
      return [
        {
          transport: "ble",
          msgId: "pending-survivor",
          status: "pending",
          message: { kind: "dmesh-msg", msgId: "pending-survivor", payload: "ok" },
          attempts: 0
        }
      ];
    },
    async getFailedOutbox() {
      return [
        {
          transport: "ble",
          msgId: "failed-stale-blocker",
          status: "failed",
          lastAttempt: now - OUTBOX_RETRY_INTERVAL_MS - 1,
          message: { kind: "dmesh-msg", msgId: "failed-stale-blocker", payload: "retry" },
          attempts: 0
        }
      ];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox() {},
    async updateOutboxStatus() {}
  };

  const manager = new BLEManager({ store, protocolConfig: { retryCount: 1, retryDelayMs: 1 } });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const sent = [];
  manager._sendQueuedEntry = async (entry) => {
    sent.push(entry.msgId);
    if (entry.msgId === "failed-stale-blocker") {
      throw new Error("retry-failed");
    }
  };

  await manager.flushOutbox();

  if (!sent.includes("pending-survivor")) {
    throw new Error("Expected pending entry to be sent even with stale failed retry error");
  }
});

test("integration: flushOutbox emits queued state for retry-cooldown entries", async () => {
  const now = Date.now();
  const store = {
    async getPendingOutbox() {
      return [];
    },
    async getFailedOutbox() {
      return [
        {
          transport: "ble",
          msgId: "failed-recent-emit",
          status: "failed",
          lastAttempt: now,
          message: { kind: "dmesh-msg", msgId: "failed-recent-emit", payload: "cooldown" }
        }
      ];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox() {},
    async updateOutboxStatus() {}
  };

  const manager = new BLEManager({ store });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const states = [];
  manager.onTransferState = ({ state, ...details }) => {
    states.push({ state, ...details });
  };

  manager._sendQueuedEntry = async () => {
    throw new Error("Cooldown entry must not be sent");
  };

  await manager.flushOutbox();

  const queued = states.find((entry) => entry.state === "queued" && entry.msgId === "failed-recent-emit");
  if (!queued) {
    throw new Error("Expected queued state for cooldown entry");
  }
  if (queued.reason !== "retry-cooldown") {
    throw new Error(`Expected retry-cooldown reason, got ${queued.reason}`);
  }
  if (!(queued.remainingMs > 0)) {
    throw new Error(`Expected positive remainingMs, got ${queued.remainingMs}`);
  }
  if (!(queued.nextRetryAt > now)) {
    throw new Error(`Expected nextRetryAt > now, got ${queued.nextRetryAt}`);
  }
});


test("integration: outbox retry loop triggers flush while connected", async () => {
  const manager = new BLEManager();
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  let intervalHandler = null;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (handler) => {
    intervalHandler = handler;
    return 1234;
  };

  let clearedTimer = null;
  globalThis.clearInterval = (timerId) => {
    clearedTimer = timerId;
  };

  let flushCalls = 0;
  manager.flushOutbox = async () => {
    flushCalls += 1;
  };

  try {
    manager._startOutboxRetryLoop();
    if (typeof intervalHandler !== "function") {
      throw new Error("Expected retry loop to register interval handler");
    }

    await intervalHandler();

    if (flushCalls !== 1) {
      throw new Error(`Expected flushOutbox to be called once, got ${flushCalls}`);
    }

    manager._stopOutboxRetryLoop();
    if (clearedTimer !== 1234) {
      throw new Error(`Expected clearInterval to be called with 1234, got ${clearedTimer}`);
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("integration: outbox retry loop skips flush when disconnected", async () => {
  const manager = new BLEManager();
  manager.isConnected = false;
  manager.txCharacteristic = null;

  let intervalHandler = null;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (handler) => {
    intervalHandler = handler;
    return 99;
  };

  globalThis.clearInterval = () => {};

  let flushCalls = 0;
  manager.flushOutbox = async () => {
    flushCalls += 1;
  };

  try {
    manager._startOutboxRetryLoop();
    await intervalHandler();

    if (flushCalls !== 0) {
      throw new Error("Expected no background flush when disconnected");
    }
  } finally {
    manager._stopOutboxRetryLoop();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("integration: flushOutbox failure injection keeps pending until retries exhausted", async () => {
  const store = {
    entries: new Map([["f1", { msgId: "f1", message: { msgId: "f1" }, transport: "ble", attempts: 0 }]]),
    async getPendingOutbox() {
      return [...this.entries.values()];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox(msgId) {
      this.entries.delete(msgId);
    },
    async updateOutboxStatus(msgId, status, fields = {}) {
      const current = this.entries.get(msgId);
      if (!current) return;
      this.entries.set(msgId, { ...current, status, ...fields });
    }
  };

  const manager = new BLEManager({
    store,
    protocolConfig: { retryCount: 2, retryDelayMs: 1 }
  });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  let attempts = 0;
  manager._sendMessageWithAck = async () => {
    attempts += 1;
    throw new Error("injected-failure");
  };

  let threw = false;
  try {
    await manager.flushOutbox();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error("Expected flushOutbox to throw when retries are exhausted");
  }
  if (attempts !== 2) {
    throw new Error(`Expected 2 attempts, got ${attempts}`);
  }
  const entry = store.entries.get("f1");
  if (!entry || entry.status !== "failed") {
    throw new Error("Expected outbox entry status=failed after retries");
  }
});

test("integration: attempts counter tracks actual send tries (not every status write)", async () => {
  const updates = [];
  const store = {
    entries: new Map([["a1", { msgId: "a1", message: { msgId: "a1" }, transport: "ble", attempts: 0 }]]),
    async getPendingOutbox() {
      return [...this.entries.values()];
    },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox(msgId) {
      this.entries.delete(msgId);
    },
    async updateOutboxStatus(msgId, status, fields = {}) {
      const current = this.entries.get(msgId);
      if (!current) return;
      const next = { ...current, status, ...fields };
      if (fields.countAttempt) {
        next.attempts = (current.attempts || 0) + 1;
        next.lastAttempt = Date.now();
      }
      updates.push({ status, countAttempt: Boolean(fields.countAttempt) });
      this.entries.set(msgId, next);
    }
  };

  const manager = new BLEManager({ store, protocolConfig: { retryCount: 3, retryDelayMs: 1 } });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  let tries = 0;
  manager._sendMessageWithAck = async () => {
    tries += 1;
    if (tries < 2) {
      throw new Error("first-try-fail");
    }
  };

  await manager.flushOutbox();

  if (tries !== 2) {
    throw new Error(`Expected 2 send attempts, got ${tries}`);
  }

  const incrementWrites = updates.filter((u) => u.countAttempt);
  if (incrementWrites.length !== 2) {
    throw new Error(`Expected 2 countAttempt writes, got ${incrementWrites.length}`);
  }

  const deliveredUpdate = updates.find((u) => u.status === "delivered");
  if (!deliveredUpdate || deliveredUpdate.countAttempt) {
    throw new Error("Expected delivered update without attempts increment");
  }
});

test("integration: BLE failure auto-fallbacks to clipboard/file via TransportManager", async () => {
  class MockBleTransport {
    constructor() { this.name = "ble"; }
    getCapabilities() { return { name: this.name }; }
    async isAvailable() { return true; }
    async send() { throw new Error("ble-down"); }
    receive() { return Promise.resolve([]); }
    startListening() { return Promise.resolve(); }
    stopListening() { return Promise.resolve(); }
    dispose() { return Promise.resolve(); }
  }

  class MockClipboardTransport {
    constructor() { this.name = "clipboard"; this.sent = 0; }
    getCapabilities() { return { name: this.name }; }
    async isAvailable() { return true; }
    async send() { this.sent += 1; return ["clipboard-ok"]; }
    receive() { return Promise.resolve([]); }
    startListening() { return Promise.resolve(); }
    stopListening() { return Promise.resolve(); }
    dispose() { return Promise.resolve(); }
  }

  const tm = new TransportManager({ autoInit: false });
  const ble = new MockBleTransport();
  const clipboard = new MockClipboardTransport();
  tm.registerTransport(ble);
  tm.registerTransport(clipboard);

  const result = await tm.sendWithFallback("ble", { msgId: "fb-1" });
  if (result.transport !== "clipboard") {
    throw new Error(`Expected fallback to clipboard, got ${result.transport}`);
  }
  if (clipboard.sent !== 1) {
    throw new Error("Expected clipboard send to be called once");
  }
});


test("integration: BLE manager emits transport states for retry/failure", async () => {
  const store = {
    entries: new Map([["s1", { msgId: "s1", message: { msgId: "s1" }, transport: "ble", attempts: 0 }]]),
    async getPendingOutbox() { return [...this.entries.values()]; },
    async addToOutbox() {},
    async addToInbox() {},
    async removeFromOutbox(msgId) { this.entries.delete(msgId); },
    async updateOutboxStatus(msgId, status, fields = {}) {
      const current = this.entries.get(msgId);
      if (!current) return;
      this.entries.set(msgId, { ...current, status, ...fields });
    }
  };

  const manager = new BLEManager({ store, protocolConfig: { retryCount: 2, retryDelayMs: 1 } });
  manager.isConnected = true;
  manager.txCharacteristic = { async writeValue() {} };

  const states = [];
  manager.onTransferState = ({ state }) => {
    states.push(state);
  };

  manager._sendMessageWithAck = async () => {
    throw new Error("forced-send-failure");
  };

  let threw = false;
  try {
    await manager.flushOutbox();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error("Expected send failure after retries");
  }

  const required = ["sending", "retrying", "fallback", "failed"];
  for (const state of required) {
    if (!states.includes(state)) {
      throw new Error(`Expected transport state: ${state}`);
    }
  }
});


test("integration: offline send queues in outbox, then connected flush delivers and clears queue", async () => {
  const senderStore = createInMemoryStore();
  const receiverStore = createInMemoryStore();

  const sender = new BLEManager({
    store: senderStore,
    protocolConfig: { retryCount: 2, retryDelayMs: 1 }
  });

  const receiver = new BLEManager({
    store: receiverStore,
    protocolConfig: { retryCount: 2, retryDelayMs: 1 }
  });

  sender.isConnected = false;
  sender.txCharacteristic = null;
  receiver.isConnected = true;

  const transferStates = [];
  sender.onTransferState = ({ state }) => {
    transferStates.push(state);
  };

  const queuedMessage = {
    kind: "dmesh-msg",
    msgId: "offline-queued-1",
    ts: Date.now(),
    rcpt: "recipient-a",
    sndr: "sender-a",
    payload: "queued-payload"
  };

  await sender.sendMessage(queuedMessage, { recipientFp: "recipient-a" });

  const queuedEntry = senderStore.snapshot().find((entry) => entry.msgId === queuedMessage.msgId);
  if (!queuedEntry) {
    throw new Error("Expected message to be queued in outbox while offline");
  }
  if (queuedEntry.status !== "pending") {
    throw new Error(`Expected queued status=pending, got ${queuedEntry.status}`);
  }
  if (!transferStates.includes("queued")) {
    throw new Error("Expected queued transfer state when sending offline");
  }

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

  sender.isConnected = true;
  await sender.flushOutbox();

  const remaining = senderStore.snapshot();
  if (remaining.length !== 0) {
    throw new Error(`Expected outbox to be empty after flush, got ${remaining.length} entry(ies)`);
  }

  const deliveredStateSeen = transferStates.includes("delivered");
  if (!deliveredStateSeen) {
    throw new Error("Expected delivered transfer state after flush");
  }

  const received = receiverStore.inbox.find((entry) => entry.msgId === queuedMessage.msgId);
  if (!received) {
    throw new Error("Expected queued message to be delivered to receiver inbox after reconnect");
  }
});

test("integration: connect succeeds even when stale failed retry exhausts", async () => {
  const now = Date.now();
  const manager = new BLEManager({
    store: {
      async addToOutbox() {},
      async addToInbox() {},
      async getPendingOutbox() { return []; },
      async getFailedOutbox() {
        return [{
          transport: "ble",
          msgId: "failed-on-connect",
          status: "failed",
          lastAttempt: now - OUTBOX_RETRY_INTERVAL_MS - 1,
          attempts: 0,
          message: { kind: "dmesh-msg", msgId: "failed-on-connect", payload: "x" }
        }];
      },
      async removeFromOutbox() {},
      async updateOutboxStatus() {},
      async checkAndMarkSeen() { return true; }
    },
    io: {
      hasBluetooth: () => true,
      requestDevice: async () => null,
      connectGatt: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => ({}) }) }),
      getPrimaryService: async (server) => server.getPrimaryService(),
      getCharacteristic: async (service) => service.getCharacteristic(),
      startNotifications: async () => {},
      addCharacteristicListener: () => {},
      addDisconnectListener: () => {},
      disconnectGatt: () => {}
    },
    protocolConfig: { retryCount: 1, retryDelayMs: 1 }
  });

  manager._sendMessageWithAck = async () => {
    throw new Error("failed-retry-connect");
  };

  await manager.connect({
    id: "connect-test-device",
    name: "connect-test-device",
    gatt: { connected: true, disconnect() {} },
    addEventListener() {}
  });

  if (!manager.isConnected) {
    throw new Error("Expected manager to stay connected even when failed retry cannot be delivered");
  }

  manager._stopOutboxRetryLoop();
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(50));
console.log(`Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
