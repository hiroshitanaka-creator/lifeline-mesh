import assert from "node:assert/strict";

import BLEManager from "../../bluetooth/ble-manager.js";
import { CONFIG, MSG_TYPE } from "../../bluetooth/constants.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
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

function createPacket(msgType, chunkIndex, totalChunks, payloadBytes) {
  const header = new Uint8Array([msgType, chunkIndex, totalChunks, 0]);
  const packet = new Uint8Array(header.length + payloadBytes.length);
  packet.set(header, 0);
  packet.set(payloadBytes, header.length);
  return packet;
}

function toCharacteristicEvent(packet) {
  return {
    target: {
      value: new DataView(packet.buffer, packet.byteOffset, packet.byteLength)
    }
  };
}

await test("_chunkData splits payload into CONFIG.CHUNK_SIZE blocks", () => {
  const manager = new BLEManager();
  const data = new Uint8Array(CONFIG.CHUNK_SIZE * 2 + 17);

  const chunks = manager._chunkData(data);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, CONFIG.CHUNK_SIZE);
  assert.equal(chunks[1].length, CONFIG.CHUNK_SIZE);
  assert.equal(chunks[2].length, 17);
});

await test("sendMessage chunks and writes packet headers correctly", async () => {
  const manager = new BLEManager();
  const writes = [];

  manager.isConnected = true;
  manager.txCharacteristic = {
    writeValue(packet) {
      writes.push(new Uint8Array(packet));
    }
  };

  const longContent = "x".repeat(CONFIG.CHUNK_SIZE + 48);
  await manager.sendMessage({ content: longContent, ts: Date.now() });

  assert.equal(writes.length, 2);
  assert.equal(writes[0][0], MSG_TYPE.DIRECT);
  assert.equal(writes[0][1], 0);
  assert.equal(writes[0][2], 2);
  assert.equal(writes[1][0], MSG_TYPE.DIRECT);
  assert.equal(writes[1][1], 1);
  assert.equal(writes[1][2], 2);
});

await test("_handleIncomingData reassembles chunked message and emits callback", () => {
  const manager = new BLEManager();
  const received = [];

  manager.onMessageReceived = (message, type) => {
    received.push({ message, type });
  };

  const originalMessage = {
    id: "msg-1",
    content: "integration-test-payload",
    ts: Date.now()
  };

  const encoded = new TextEncoder().encode(JSON.stringify(originalMessage));
  const chunks = manager._chunkData(encoded);

  chunks.forEach((chunk, index) => {
    const packet = createPacket(MSG_TYPE.DIRECT, index, chunks.length, chunk);
    manager._handleIncomingData(toCharacteristicEvent(packet));
  });

  assert.equal(received.length, 1);
  assert.deepEqual(received[0].message, originalMessage);
  assert.equal(received[0].type, MSG_TYPE.DIRECT);
});

console.log(`\nBLE integration tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
