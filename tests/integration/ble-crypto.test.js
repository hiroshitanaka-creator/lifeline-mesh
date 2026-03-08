/* eslint-disable require-await, no-empty-function */
import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as DMesh from "../../crypto/core.js";
import { BLEManager } from "../../bluetooth/ble-manager.js";
import { TransportManager } from "../../crypto/transport.js";

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
      outbox.set(msgId, { ...existing, status, ...fields });
    },
    snapshot() {
      return [...outbox.values()];
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
