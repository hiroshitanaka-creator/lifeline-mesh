#!/usr/bin/env node

import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

import { GATTServer } from "../bluetooth/gatt-server.js";
import { FileRelayStore } from "./persistent-relay-store.js";
import { parseRelayAdminArgs, formatRelayStatus } from "./relay-ops.js";
import { SingleClientRelayNode } from "./relay-node.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseRelayAdminArgs(process.argv.slice(2));
const diagnosticsEnabled = args.diagnosticsEnabled || parseEnvBool(process.env.LIFELINE_RELAY_DIAG);
const localName = process.env.LIFELINE_NAME ?? "LifelineMesh";
const relayStorePath = process.env.LIFELINE_RELAY_STORE
  ?? path.resolve(__dirname, "data/relay-store.json");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const logger = {
  log: (...parts) => console.log(...parts),
  warn: (...parts) => console.warn(...parts)
};

const { BlenoBackend } = await import("../bluetooth/backends/node-bleno.js");
const backend = new BlenoBackend({ diagnosticsEnabled, logger });
const server = new GATTServer({ localName });
const store = new FileRelayStore({ filePath: relayStorePath });
const relayNode = new SingleClientRelayNode({
  server,
  store,
  logger,
  diagnosticsEnabled
});

await relayNode.init();
server.setBackend(backend);

server.onMessageReceived = (message, clientId) => {
  relayNode.onInboundMessage(message, clientId).catch((error) => {
    console.error("[Smoke] Failed to persist inbound message:", error?.message ?? error);
  });
};

server.onClientConnected = (clientId) => {
  console.log(`[Smoke] client connected: ${clientId}`);
  relayNode.onClientConnected(clientId).catch((error) => {
    console.error("[Smoke] replay failed:", error?.message ?? error);
  });
};

server.onClientDisconnected = (clientId) => {
  console.log(`[Smoke] client disconnected: ${clientId}`);
};

server.onError = (code, error) => {
  console.error(`[Smoke] server error [${code}]:`, error?.message ?? error);
};

console.log(`[Smoke] Starting manual real-bleno harness as "${localName}"`);
console.log(`[Smoke] Relay store path: ${relayStorePath}`);
console.log(`[Smoke] Diagnostics: ${diagnosticsEnabled ? "enabled" : "disabled"}`);

try {
  await server.startAdvertising();
  console.log("[Smoke] Advertising started.");
} catch (error) {
  console.error("[Smoke] Failed to start advertising:", error?.message ?? error);
  process.exit(1);
}

console.log("[Smoke] Type 'help' for operator commands.");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

rl.on("line", (line) => {
  runCommand(line).catch((error) => {
    console.error("[Smoke] command error:", error?.message ?? error);
  });
});

rl.on("close", () => {
  if (!isShuttingDown) {
    shutdown("stdin closed");
  }
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function runCommand(line) {
  const input = line.trim();
  if (!input) return;

  if (input === "help") {
    printRuntimeHelp();
    return;
  }

  if (input === "status") {
    await dumpStatus("manual-smoke:status");
    return;
  }

  if (input === "cleanup") {
    const result = await relayNode.runCleanup("manual-smoke");
    console.log("[Smoke] cleanup:", JSON.stringify(result));
    await dumpStatus("manual-smoke:post-cleanup");
    return;
  }

  if (input === "clients") {
    console.log("[Smoke] connected clients:", server.connectedClients.join(",") || "none");
    return;
  }

  if (input.startsWith("send ")) {
    const payloadText = input.slice(5).trim();
    await sendManualMessage(payloadText);
    return;
  }

  if (input === "exit" || input === "quit") {
    await shutdown("operator exit");
    return;
  }

  console.log(`[Smoke] unknown command: ${input}`);
  printRuntimeHelp();
}

async function sendManualMessage(payloadText) {
  const clientId = server.connectedClients[0];
  if (!clientId) {
    console.log("[Smoke] no active client; connect Web Bluetooth central first");
    return;
  }

  const message = {
    kind: "dmesh-msg",
    msgId: `manual-smoke:${Date.now()}`,
    payload: payloadText || "manual smoke payload",
    source: "manual-smoke"
  };

  await server.sendMessage(message, clientId);
  console.log(`[Smoke] sent msgId=${message.msgId} to ${clientId}`);
}

async function dumpStatus(source) {
  const snapshot = await relayNode.getSnapshot();
  console.log("[Smoke] relay status:", JSON.stringify(formatRelayStatus(snapshot, { source })));
}

let isShuttingDown = false;

async function shutdown(reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Smoke] shutting down (${reason})`);
  rl.close();
  relayNode.close();
  if (server.isAdvertising) {
    await server.stopAdvertising();
  }
  process.exit(0);
}

function parseEnvBool(value) {
  if (!value) return false;
  return ["1", "true", "yes", "on", "debug", "verbose"].includes(String(value).trim().toLowerCase());
}

function printHelp() {
  console.log(`
Manual real-bleno smoke harness (Linux + BlueZ)

Usage:
  node node-server/manual-smoke.js [--diag]
  LIFELINE_RELAY_DIAG=1 node node-server/manual-smoke.js

Prerequisites:
  - Linux host with BlueZ and BLE adapter
  - node-server dependencies installed (@abandonware/bleno)
  - CAP_NET_RAW on node binary or run as root

Operator commands after start:
  help        show commands
  status      print backend/server/store snapshot
  clients     print connected client IDs
  send <text> send one DIRECT message to active client
  cleanup     run relay retention cleanup and print snapshot
  exit        stop harness
`);
}

function printRuntimeHelp() {
  console.log("[Smoke] commands: help | status | clients | send <text> | cleanup | exit");
}
