/**
 * Lifeline Mesh - Node.js BLE Peripheral Server
 *
 * Runs on Linux / Raspberry Pi as a BLE peripheral (GATT server).
 * Mobile/desktop browsers connect to this node via Web Bluetooth as centrals.
 *
 * Usage:
 *   cd node-server && npm install && node server.js
 *
 * Prerequisites (Linux):
 *   sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
 *   sudo setcap cap_net_raw+eip $(which node)   # or run as root
 */

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve bluetooth/ and runtime modules relative to this file
const bluetoothDir = path.resolve(__dirname, "../bluetooth");

const { GATTServer } = await import(`${bluetoothDir}/gatt-server.js`);
const { BlenoBackend } = await import(`${bluetoothDir}/backends/node-bleno.js`);
const { FileRelayStore } = await import("./persistent-relay-store.js");
const { SingleClientRelayNode } = await import("./relay-node.js");

// ─── Configuration ────────────────────────────────────────────────────────────

const LOCAL_NAME = process.env.LIFELINE_NAME ?? "LifelineMesh";
const RELAY_STORE_PATH = process.env.LIFELINE_RELAY_STORE
  ?? path.resolve(__dirname, "data/relay-store.json");

// ─── Setup ────────────────────────────────────────────────────────────────────

const backend = new BlenoBackend();
const server = new GATTServer({ localName: LOCAL_NAME });
const relayStore = new FileRelayStore({ filePath: RELAY_STORE_PATH });
const relayNode = new SingleClientRelayNode({ server, store: relayStore });

await relayNode.init();

server.onMessageReceived = (message, clientId) => {
  relayNode.onInboundMessage(message, clientId).catch((error) => {
    console.error("[Server] Failed to persist inbound relay message:", error?.message ?? error);
  });
};

server.onClientConnected = (clientId) => {
  console.log(`[Server] Client connected: ${clientId} (single-client mode active)`);
  relayNode.onClientConnected(clientId).catch((error) => {
    console.error("[Server] Failed to replay pending relay messages:", error?.message ?? error);
  });
};

server.onClientDisconnected = (clientId) => {
  console.log(`[Server] Client disconnected: ${clientId}`);
};

server.onError = (code, err) => {
  console.error(`[Server] Error [${code}]:`, err?.message ?? err);
};

server.setBackend(backend);

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`[Server] Starting Lifeline Mesh peripheral as "${LOCAL_NAME}" ...`);
console.log(`[Server] Relay store path: ${RELAY_STORE_PATH}`);

try {
  await server.startAdvertising();
  const snapshot = await relayNode.getSnapshot();
  console.log("[Server] Advertising. Single-client persistent relay mode active.");
  console.log("[Server] Relay snapshot:", JSON.stringify(snapshot));
} catch (err) {
  console.error("[Server] Failed to start advertising:", err.message);
  process.exit(1);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down...`);
  try {
    if (server.isAdvertising) await server.stopAdvertising();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
