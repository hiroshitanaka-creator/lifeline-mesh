#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

import { GATTServer } from "../bluetooth/gatt-server.js";
import { FileRelayStore } from "./persistent-relay-store.js";
import {
  parseRelayAdminArgs,
  parseManualSmokeArgs,
  formatRelayStatus,
  resolveDiagnosticsEnabled,
  createSmokeOutput
} from "./relay-ops.js";
import { SingleClientRelayNode } from "./relay-node.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const relayArgs = parseRelayAdminArgs(argv);
const smokeArgs = parseManualSmokeArgs(argv);
const jsonStdoutMode = smokeArgs.nonInteractive && smokeArgs.jsonOutput;

if (jsonStdoutMode) {
  redirectConsoleLogToStderr();
}

const output = createSmokeOutput({ jsonOutput: jsonStdoutMode });

const diagnosticsEnabled = resolveDiagnosticsEnabled({
  cliSpecified: relayArgs.diagnosticsSpecified,
  cliEnabled: relayArgs.diagnosticsEnabled,
  envValue: process.env.LIFELINE_RELAY_DIAG
});
const localName = process.env.LIFELINE_NAME ?? "LifelineMesh";
const relayStorePath = process.env.LIFELINE_RELAY_STORE
  ?? path.resolve(__dirname, "data/relay-store.json");

if (argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

const logger = {
  log: (...parts) => output.info(...parts),
  warn: (...parts) => output.warn(...parts)
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
    output.error("[Smoke] Failed to persist inbound message:", error?.message ?? error);
  });
};

server.onClientConnected = (clientId) => {
  output.info(`[Smoke] client connected: ${clientId}`);
  relayNode.onClientConnected(clientId).catch((error) => {
    output.error("[Smoke] replay failed:", error?.message ?? error);
  });
};

server.onClientDisconnected = (clientId) => {
  output.info(`[Smoke] client disconnected: ${clientId}`);
};

server.onError = (code, error) => {
  output.error(`[Smoke] server error [${code}]:`, error?.message ?? error);
};

output.info(`[Smoke] Starting manual real-bleno harness as "${localName}"`);
output.info(`[Smoke] Relay store path: ${relayStorePath}`);
output.info(`[Smoke] Diagnostics: ${diagnosticsEnabled ? "enabled" : "disabled"}`);

try {
  await server.startAdvertising();
  output.info("[Smoke] Advertising started.");
} catch (error) {
  output.error("[Smoke] Failed to start advertising:", error?.message ?? error);
  process.exit(1);
}

let rl = null;

if (smokeArgs.nonInteractive) {
  await runNonInteractiveSmoke();
} else {
  output.info("[Smoke] Type 'help' for operator commands.");

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });

  rl.on("line", (line) => {
    runCommand(line).catch((error) => {
      output.error("[Smoke] command error:", error?.message ?? error);
    });
  });

  rl.on("close", () => {
    if (!isShuttingDown) {
      shutdown("stdin closed");
    }
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

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
    output.info("[Smoke] cleanup:", JSON.stringify(result));
    await dumpStatus("manual-smoke:post-cleanup");
    return;
  }

  if (input === "clients") {
    output.info("[Smoke] connected clients:", server.connectedClients.join(",") || "none");
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

  output.info(`[Smoke] unknown command: ${input}`);
  printRuntimeHelp();
}

async function sendManualMessage(payloadText) {
  const clientId = server.connectedClients[0];
  if (!clientId) {
    output.info("[Smoke] no active client; connect Web Bluetooth central first");
    return;
  }

  const message = {
    kind: "dmesh-msg",
    msgId: `manual-smoke:${Date.now()}`,
    payload: payloadText || "manual smoke payload",
    source: "manual-smoke"
  };

  await server.sendMessage(message, clientId);
  output.info(`[Smoke] sent msgId=${message.msgId} to ${clientId}`);
}

async function dumpStatus(source) {
  const snapshot = await relayNode.getSnapshot();
  output.info("[Smoke] relay status:", JSON.stringify(formatRelayStatus(snapshot, { source })));
}

let isShuttingDown = false;

async function shutdown(reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  output.info(`\n[Smoke] shutting down (${reason})`);
  if (rl) {
    rl.close();
  }
  relayNode.close();
  if (server.isAdvertising) {
    await server.stopAdvertising();
  }
  process.exit(0);
}

async function runNonInteractiveSmoke() {
  output.info(`[Smoke] Running non-interactive smoke (timeoutMs=${smokeArgs.timeoutMs}, expectClient=${smokeArgs.expectClient})`);
  const startedAt = Date.now();
  const deadline = startedAt + smokeArgs.timeoutMs;
  let clientObserved = server.connectedClients.length > 0;

  while (Date.now() < deadline && smokeArgs.expectClient && !clientObserved) {
    await sleep(250);
    clientObserved = server.connectedClients.length > 0;
  }

  let cleanupResult = null;
  if (smokeArgs.cleanup) {
    cleanupResult = await relayNode.runCleanup("manual-smoke:non-interactive");
  }

  const snapshot = await relayNode.getSnapshot();
  const relayStatus = formatRelayStatus(snapshot, {
    source: "manual-smoke:non-interactive",
    expectClient: smokeArgs.expectClient
  });

  const result = {
    ok: smokeArgs.expectClient ? clientObserved : true,
    mode: "manual-smoke-non-interactive",
    summary: {
      localName,
      relayStorePath,
      diagnosticsEnabled,
      timeoutMs: smokeArgs.timeoutMs,
      elapsedMs: Date.now() - startedAt,
      expectClient: smokeArgs.expectClient,
      clientObserved,
      connectedClients: server.connectedClients,
      cleanupRequested: smokeArgs.cleanup
    },
    relayStatus,
    cleanupResult,
    checklist: smokeChecklist()
  };

  if (smokeArgs.statusFile) {
    await fs.mkdir(path.dirname(smokeArgs.statusFile), { recursive: true });
    await fs.writeFile(smokeArgs.statusFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    output.info(`[Smoke] Wrote status file: ${smokeArgs.statusFile}`);
  }

  if (jsonStdoutMode) {
    output.jsonResult(result);
  } else {
    output.info("[Smoke] non-interactive result:", JSON.stringify(result));
  }

  relayNode.close();
  if (server.isAdvertising) {
    await server.stopAdvertising();
  }

  process.exit(result.ok ? 0 : 2);
}

function smokeChecklist() {
  return [
    "BLE adapter reaches poweredOn and advertising starts",
    "Central client can connect, disconnect, and reconnect",
    "Inbound write is queued in pending store and replayed on reconnect",
    "cleanup command runs and reports removedPending/removedDelivered",
    "status snapshot includes server connectedClients and store counters"
  ];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function redirectConsoleLogToStderr() {
  console.log = (...parts) => {
    process.stderr.write(`${parts.join(" ")}\n`);
  };
}

function printHelp() {
  console.log(`
Manual real-bleno smoke harness (Linux + BlueZ)

Usage:
  node node-server/manual-smoke.js [--diag]
  node node-server/manual-smoke.js --non-interactive [--expect-client] [--timeout-ms 15000] [--cleanup] [--status-file artifacts/real-bleno-smoke.json] [--json]
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

Non-interactive options:
  --non-interactive, --once  run a single smoke cycle and exit
  --expect-client            fail with exit code 2 when no client connects before timeout
  --timeout-ms <ms>          wait timeout for expected client (default: 15000)
  --cleanup                  run relay cleanup before reporting status
  --status-file <path>       write machine-readable smoke JSON output
  --json                     print machine-readable smoke JSON to stdout only

Real-bleno validation checklist:
  - BLE adapter reaches poweredOn and advertising starts
  - Central can connect/disconnect/reconnect without stale state
  - Inbound message persists as pending and replays on reconnect
  - Cleanup reports removedPending/removedDelivered when applicable
  - Status snapshot includes connectedClients and store counters
`);
}

function printRuntimeHelp() {
  output.info("[Smoke] commands: help | status | clients | send <text> | cleanup | exit");
}
