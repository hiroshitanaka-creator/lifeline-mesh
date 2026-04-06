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

import { FileRelayStore } from "./persistent-relay-store.js";
import { parseRelayAdminArgs, formatRelayStatus, resolveDiagnosticsEnabled } from "./relay-ops.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve bluetooth/ and runtime modules relative to this file
const bluetoothDir = path.resolve(__dirname, "../bluetooth");

// ─── Configuration ────────────────────────────────────────────────────────────

const LOCAL_NAME = process.env.LIFELINE_NAME ?? "LifelineMesh";
const RELAY_STORE_PATH = process.env.LIFELINE_RELAY_STORE
  ?? path.resolve(__dirname, "data/relay-store.json");

const relayAdminArgs = parseRelayAdminArgs(process.argv.slice(2));

const diagnosticsEnabled = resolveDiagnosticsEnabled({
  cliSpecified: relayAdminArgs.diagnosticsSpecified,
  cliEnabled: relayAdminArgs.diagnosticsEnabled,
  envValue: process.env.LIFELINE_RELAY_DIAG
});
const logger = createScopedLogger({ diagnosticsEnabled });

async function runStoreAdminAction(mode) {
  const relayStore = new FileRelayStore({ filePath: RELAY_STORE_PATH });
  await relayStore.init();

  if (mode === "cleanup") {
    const cleanupResult = await relayStore.cleanup();
    console.log("[Server] Relay cleanup result:", JSON.stringify(cleanupResult));
  }

  const storeSnapshot = await relayStore.getSnapshot();
  console.log("[Server] Relay status:", JSON.stringify(formatRelayStatus({ store: storeSnapshot }, { source: `cli:${mode}` })));
}

if (relayAdminArgs.mode !== "serve") {
  try {
    await runStoreAdminAction(relayAdminArgs.mode);
    process.exit(0);
  } catch (error) {
    console.error("[Server] Relay admin action failed:", error?.message ?? error);
    process.exit(1);
  }
}

if (relayAdminArgs.manualSmoke) {
  console.log("[Server] --manual-smoke detected. For interactive harness run: node node-server/manual-smoke.js [--diag]");
}

const { GATTServer } = await import(`${bluetoothDir}/gatt-server.js`);
const { BlenoBackend } = await import(`${bluetoothDir}/backends/node-bleno.js`);
const { SingleClientRelayNode } = await import("./relay-node.js");

// ─── Setup ────────────────────────────────────────────────────────────────────

const backend = new BlenoBackend({ diagnosticsEnabled, logger });
const server = new GATTServer({ localName: LOCAL_NAME });
const relayStore = new FileRelayStore({ filePath: RELAY_STORE_PATH });
const relayNode = new SingleClientRelayNode({ server, store: relayStore, logger, diagnosticsEnabled });

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

async function dumpRelayStatus(source) {
  const snapshot = await relayNode.getSnapshot();
  console.log("[Server] Relay status:", JSON.stringify(formatRelayStatus(snapshot, { source })));
}

async function runRelayCleanup(source = "manual") {
  const cleanupResult = await relayNode.runCleanup(source);
  console.log("[Server] Relay cleanup result:", JSON.stringify({ source, ...cleanupResult }));
  await dumpRelayStatus(`${source}:post-cleanup`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

console.log(`[Server] Starting Lifeline Mesh peripheral as "${LOCAL_NAME}" ...`);
console.log(`[Server] Relay store path: ${RELAY_STORE_PATH}`);
if (diagnosticsEnabled) {
  console.log("[Server] Relay diagnostics: enabled (LIFELINE_RELAY_DIAG or --relay-diag/--diag)");
}

try {
  await server.startAdvertising();
  console.log("[Server] Advertising. Single-client persistent relay mode active.");
  await dumpRelayStatus("startup");
} catch (err) {
  console.error("[Server] Failed to start advertising:", err.message);
  process.exit(1);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down...`);
  try {
    relayNode.close();
    if (server.isAdvertising) await server.stopAdvertising();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (relayAdminArgs.signalsEnabled) {
  process.on("SIGUSR1", () => {
    dumpRelayStatus("signal:SIGUSR1").catch((error) => {
      console.error("[Server] Failed to dump relay status:", error?.message ?? error);
    });
  });

  process.on("SIGUSR2", () => {
    runRelayCleanup("signal:SIGUSR2").catch((error) => {
      console.error("[Server] Failed to run relay cleanup:", error?.message ?? error);
    });
  });
}


function createScopedLogger({ diagnosticsEnabled: enabled }) {
  return {
    log: (...args) => console.log(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
    debug: (...args) => {
      if (enabled) {
        console.log("[RelayDiag]", ...args);
      }
    }
  };
}
