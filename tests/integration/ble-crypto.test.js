import nacl from "../../crypto/node_modules/tweetnacl/nacl-fast.js";
import naclUtil from "../../crypto/node_modules/tweetnacl-util/nacl-util.js";
import * as DMesh from "../../crypto/core.js";
import { BLEManager } from "../../bluetooth/ble-manager.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function packetToDataView(packet) {
  return new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
}

function createLinkedManagers() {
  const sender = new BLEManager();
  const receiver = new BLEManager();

  sender.isConnected = true;
  receiver.isConnected = true;

  sender.txCharacteristic = {
    writeValue(packet) {
      receiver._handleIncomingData({
        target: {
          value: packetToDataView(packet)
        }
      });
    }
  };

  return { sender, receiver };
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

test("integration: missing BLE chunk does not emit complete message", async () => {
  const sender = new BLEManager();
  const receiver = new BLEManager();

  sender.isConnected = true;
  receiver.isConnected = true;

  let writeCount = 0;
  let receivedMessage = null;
  receiver.onMessageReceived = (message) => {
    receivedMessage = message;
  };

  sender.txCharacteristic = {
    writeValue(packet) {
      writeCount += 1;
      if (writeCount !== 2) {
        receiver._handleIncomingData({
          target: {
            value: packetToDataView(packet)
          }
        });
      }
    }
  };

  await sender.sendMessage({
    payload: "x".repeat(900)
  });

  if (writeCount < 2) {
    throw new Error("Expected at least 2 BLE chunks in test setup");
  }
  if (receivedMessage !== null) {
    throw new Error("Receiver should not emit message when a chunk is missing");
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
