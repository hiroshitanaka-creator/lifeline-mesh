/**
 * Lifeline Mesh - Chaos Orchestrator
 *
 * CLI runner for all chaos scenarios. Used by:
 *   node tools/chaos/orchestrator.js --scenario <name> [options]
 *
 * @module tools/chaos/orchestrator
 */

import { NetworkChaos, NodeSim } from "./network-chaos.js";
import { BatteryChaos } from "./battery-chaos.js";
import { DisasterChaos } from "./disaster-chaos.js";

/**
 * Runs a named chaos scenario and returns results.
 * @param {string} scenario - "network" | "battery" | "disaster"
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function runScenario(scenario, options = {}) {
  switch (scenario) {
    case "network":   return _runNetworkScenario(options);
    case "battery":   return _runBatteryScenario(options);
    case "disaster":  return DisasterChaos.runCLI([]);
    default:
      throw new Error(`Unknown chaos scenario: ${scenario}`);
  }
}

async function _runNetworkScenario(options) {
  const nodeCount = options.nodeCount ?? 10;
  const durationMs = (options.durationSeconds ?? 30) * 1000;

  const chaos = new NetworkChaos({
    dropProbability: options.dropProbability ?? 0.1,
    disconnectProbability: options.disconnectProbability ?? 0.15,
    ...options
  });

  // Build mesh
  const nodeIds = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `net-node-${i}`;
    chaos.addNode(id);
    nodeIds.push(id);
  }

  // Connect neighbors
  for (let i = 0; i < nodeIds.length - 1; i++) {
    chaos.connectNodes(nodeIds[i], nodeIds[i + 1]);
  }
  // Ring closure
  if (nodeIds.length > 2) {
    chaos.connectNodes(nodeIds[nodeIds.length - 1], nodeIds[0]);
  }

  chaos.start();

  // Send test messages
  let sentTotal = 0;
  const msgTimer = setInterval(async () => {
    for (const id of nodeIds) {
      const node = chaos._nodes.get(id);
      if (!node) continue;
      const msg = { msgId: `nm-${Date.now()}-${Math.random().toString(36).slice(2)}`, kind: "dmesh-msg", v: 2, ts: Date.now() };
      await node.broadcast(msg).catch(() => {});
      sentTotal++;
    }
  }, 500);

  await new Promise((r) => setTimeout(r, durationMs));

  clearInterval(msgTimer);
  chaos.stop();

  const metrics = chaos.getMetrics();
  console.log("[NetworkChaos] Results:", JSON.stringify(metrics, null, 2));
  return metrics;
}

async function _runBatteryScenario(options) {
  const nodeCount = options.nodeCount ?? 5;
  const durationMs = (options.durationSeconds ?? 30) * 1000;

  const bc = BatteryChaos.createStaggeredNodes(nodeCount, null, options);
  bc.start();

  bc.on("node:shutdown", (id, level) => {
    console.log(`[BatteryChaos] ${id} shut down at ${level.toFixed(1)}%`);
  });

  bc.on("node:low-battery", (id, level) => {
    console.log(`[BatteryChaos] ${id} low battery: ${level.toFixed(1)}%`);
  });

  await new Promise((r) => setTimeout(r, durationMs));
  bc.stop();

  const snap = bc.getSnapshot();
  console.log("[BatteryChaos] Results:", JSON.stringify(snap.metrics, null, 2));
  return snap;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("orchestrator.js")) {
  const args = process.argv.slice(2);
  const scenarioIdx = args.indexOf("--scenario");
  const scenario = scenarioIdx >= 0 ? args[scenarioIdx + 1] : "disaster";

  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--nodes") options.nodeCount = parseInt(args[++i]);
    if (args[i] === "--duration") options.durationSeconds = parseInt(args[++i]);
    if (args[i] === "--loss") options.dropProbability = parseFloat(args[++i]);
  }

  runScenario(scenario, options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export class ChaosOrchestrator {
  static run = runScenario;
}
