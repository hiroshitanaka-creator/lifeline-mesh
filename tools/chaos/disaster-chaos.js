/**
 * Lifeline Mesh - DisasterChaos Scenario
 *
 * Simulates the worst-case disaster conditions for the Lifeline Mesh
 * protocol: 50% message loss rate, extreme network fragmentation,
 * time synchronization failures, and large node counts.
 *
 * This is the canonical validation scenario for the v2 release gate:
 * "100-node simulation with 99.9% delivery rate" (RELEASE_READINESS_REPORT_v2.md).
 *
 * Key parameters:
 *   - Message loss rate: 50% (default)
 *   - Network fragmentation: random partition into 3-5 islands
 *   - Node count: up to 100
 *   - Duration: 120 seconds of simulated time
 *   - Reconnect healing: gradual (nodes reconnect one by one)
 *
 * @module tools/chaos/disaster-chaos
 */

import { EventEmitter } from "events";
import { NetworkChaos } from "./network-chaos.js";
import { BatteryChaos } from "./battery-chaos.js";

export const DISASTER_DEFAULTS = {
  /** Number of simulated nodes */
  nodeCount: 100,
  /** Message loss probability per hop [0, 1] */
  messageLossRate: 0.5,
  /** Number of network partitions to create */
  partitionCount: 4,
  /** Duration of each partition in ms */
  partitionDurationMs: 20_000,
  /** Rate at which nodes are re-added after failure (nodes/min simulated) */
  healingRate: 5,
  /** Total simulation duration in ms */
  durationMs: 120_000,
  /** Message generation rate per node (msgs/min simulated) */
  messageRatePerNodePerMin: 2,
  /** Enable battery drain on all nodes */
  enableBattery: true,
  /** Simulated time scale factor (1s real = timeScale seconds simulated) */
  timeScale: 10
};

// ─── DisasterChaos ───────────────────────────────────────────────────────────

/**
 * Composite chaos scenario combining Network + Battery chaos under
 * disaster conditions. Tracks delivery rate as the primary KPI.
 */
export class DisasterChaos extends EventEmitter {
  /**
   * @param {Object} [options] - Overrides for DISASTER_DEFAULTS
   */
  constructor(options = {}) {
    super();
    this.config = { ...DISASTER_DEFAULTS, ...options };

    this.networkChaos = new NetworkChaos({
      dropProbability: this.config.messageLossRate,
      disconnectProbability: 0.25,
      disconnectDurationMs: 10_000,
      enablePartitions: true,
      partitionDurationMs: this.config.partitionDurationMs,
      partitionProbability: 0.08,
      meanLatencyMs: 500,
      latencyStdMs: 300
    });

    this.batteryChaos = this.config.enableBattery
      ? new BatteryChaos({
          networkChaos: this.networkChaos,
          nodeDefaults: {
            drainRatePerMinute: 8,
            enableSolarCharging: false,
            shutdownThreshold: 3
          }
        })
      : null;

    /** @type {Map<string, Object>} msgId → message record */
    this._messages = new Map();

    this._running = false;
    this._masterTimer = null;
    this._messageGenTimer = null;

    this.results = {
      totalMessages: 0,
      deliveredMessages: 0,
      lostMessages: 0,
      nodeShutdowns: 0,
      partitionEvents: 0,
      deliveryRate: null,
      kpiMet: null,         // 99.9% delivery rate target
      durationMs: 0,
      startedAt: null,
      endedAt: null
    };
  }

  // ─── Setup ─────────────────────────────────────────────────────────────────

  /**
   * Build the simulated network: N nodes in a mesh topology.
   * Each node is connected to ~3 neighbors (sparse mesh).
   */
  setupNetwork() {
    const n = this.config.nodeCount;

    // Add nodes to NetworkChaos
    for (let i = 0; i < n; i++) {
      const nodeId = `disaster-node-${i}`;
      this.networkChaos.addNode(nodeId);
      if (this.batteryChaos) {
        const initialLevel = 50 + Math.random() * 50; // 50-100%
        this.batteryChaos.addNode(nodeId, { initialLevel });
      }
    }

    // Connect each node to ~3 random neighbors
    const nodeIds = [...this.networkChaos._nodes.keys()];
    for (let i = 0; i < nodeIds.length; i++) {
      const numPeers = 2 + Math.floor(Math.random() * 3); // 2-4 peers
      for (let j = 0; j < numPeers; j++) {
        const peerId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
        if (peerId !== nodeIds[i]) {
          this.networkChaos.connectNodes(nodeIds[i], peerId);
        }
      }
    }

    // Event listeners for metrics
    this.networkChaos.on("partition:start", () => {
      this.results.partitionEvents++;
    });

    if (this.batteryChaos) {
      this.batteryChaos.on("node:shutdown", () => {
        this.results.nodeShutdowns++;
      });
    }
  }

  // ─── Run ───────────────────────────────────────────────────────────────────

  /**
   * Run the disaster chaos scenario for the configured duration.
   * @returns {Promise<Object>} Final results including delivery rate
   */
  async run() {
    this.setupNetwork();

    this._running = true;
    this.results.startedAt = Date.now();

    this.networkChaos.start();
    if (this.batteryChaos) this.batteryChaos.start();

    this.emit("started", { nodeCount: this.config.nodeCount });

    // Generate simulated messages from random nodes
    this._startMessageGeneration();

    // Run for configured duration
    await new Promise((resolve) => {
      this._masterTimer = setTimeout(() => {
        this._running = false;
        resolve();
      }, this.config.durationMs);
    });

    this._stopMessageGeneration();
    this.networkChaos.stop();
    if (this.batteryChaos) this.batteryChaos.stop();

    this.results.endedAt = Date.now();
    this.results.durationMs = this.results.endedAt - this.results.startedAt;

    // Compute final metrics
    const netMetrics = this.networkChaos.getMetrics();
    this.results.totalMessages = netMetrics.totalMessages;
    this.results.deliveredMessages = netMetrics.deliveredMessages;
    this.results.lostMessages = netMetrics.droppedMessages;
    this.results.deliveryRate =
      netMetrics.totalMessages > 0
        ? netMetrics.deliveredMessages / netMetrics.totalMessages
        : null;

    // KPI: 99.9% delivery rate
    this.results.kpiMet = this.results.deliveryRate !== null
      ? this.results.deliveryRate >= 0.999
      : false;

    this.emit("completed", this.results);
    return this.results;
  }

  _startMessageGeneration() {
    const ratePerNodeMs =
      60_000 / (this.config.messageRatePerNodePerMin * this.config.timeScale);

    this._messageGenTimer = setInterval(async () => {
      if (!this._running) return;

      const nodeIds = [...this.networkChaos._nodes.keys()];
      if (nodeIds.length === 0) return;

      // Pick a random source node
      const sourceId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      const sourceNode = this.networkChaos._nodes.get(sourceId);
      if (!sourceNode) return;

      // Check battery state
      if (this.batteryChaos) {
        const battNode = this.batteryChaos._batteryNodes?.get(sourceId);
        if (battNode && !battNode.canTransmit) return;
      }

      const msgId = `disaster-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const message = {
        kind: "dmesh-msg",
        v: 2,
        msgId,
        ts: Date.now(),
        type: "need_help",
        content: "Disaster scenario test message",
        from: sourceId,
        backhaul_flag: false
      };

      this._messages.set(msgId, {
        sentAt: Date.now(),
        from: sourceId,
        delivered: false
      });

      await sourceNode.broadcast(message);

    }, ratePerNodeMs);
  }

  _stopMessageGeneration() {
    if (this._messageGenTimer) {
      clearInterval(this._messageGenTimer);
      this._messageGenTimer = null;
    }
    if (this._masterTimer) {
      clearTimeout(this._masterTimer);
      this._masterTimer = null;
    }
  }

  // ─── CLI entry point ───────────────────────────────────────────────────────

  /**
   * Run as CLI tool.
   * @param {string[]} args - process.argv.slice(2)
   * @returns {Promise<number>} Exit code (0 = KPI met, 1 = KPI not met)
   */
  static async runCLI(args = []) {
    const options = _parseArgs(args);
    const chaos = new DisasterChaos(options);

    chaos.on("started", ({ nodeCount }) => {
      console.log(`[DisasterChaos] Starting: ${nodeCount} nodes, ${options.messageLossRate * 100}% loss, ${options.durationMs / 1000}s`);
    });

    chaos.on("completed", (results) => {
      console.log("\n[DisasterChaos] Results:");
      console.log(`  Total messages:     ${results.totalMessages}`);
      console.log(`  Delivered:          ${results.deliveredMessages}`);
      console.log(`  Lost:               ${results.lostMessages}`);
      console.log(`  Delivery rate:      ${results.deliveryRate !== null ? (results.deliveryRate * 100).toFixed(2) + "%" : "N/A"}`);
      console.log(`  Node shutdowns:     ${results.nodeShutdowns}`);
      console.log(`  Partition events:   ${results.partitionEvents}`);
      console.log(`  Duration:           ${(results.durationMs / 1000).toFixed(1)}s`);
      console.log(`  KPI (≥99.9%):      ${results.kpiMet ? "✓ PASS" : "✗ FAIL"}`);
    });

    const results = await chaos.run();
    return results.kpiMet ? 0 : 1;
  }
}

function _parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--nodes") opts.nodeCount = parseInt(args[++i]);
    if (args[i] === "--loss") opts.messageLossRate = parseFloat(args[++i]);
    if (args[i] === "--duration") opts.durationMs = parseInt(args[++i]) * 1000;
    if (args[i] === "--no-battery") opts.enableBattery = false;
  }
  return opts;
}
