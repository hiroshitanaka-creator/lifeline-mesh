/**
 * Lifeline Mesh - NetworkChaos Scenario
 *
 * Simulates realistic adversarial network conditions:
 *   - Random disconnections (peer drops)
 *   - Latency injection (variable delay per link)
 *   - Packet loss (uniform random drop probability)
 *   - Link flapping (rapid connect/disconnect cycles)
 *   - Partition events (split network into isolated islands)
 *
 * @module tools/chaos/network-chaos
 */

import { EventEmitter } from "events";

// ─── Default configuration ────────────────────────────────────────────────────

export const NETWORK_CHAOS_DEFAULTS = {
  /** Mean disconnect duration in ms */
  disconnectDurationMs: 5_000,
  /** Probability [0, 1] of a link being disconnected at any given probe */
  disconnectProbability: 0.15,
  /** Mean added latency per hop in ms */
  meanLatencyMs: 200,
  /** Latency standard deviation in ms (jitter) */
  latencyStdMs: 100,
  /** Packet drop probability [0, 1] */
  dropProbability: 0.1,
  /** Probe interval for chaos events in ms */
  probeIntervalMs: 2_000,
  /** Enable network partition events */
  enablePartitions: true,
  /** Maximum partition duration in ms */
  partitionDurationMs: 15_000,
  /** Partition probability per probe */
  partitionProbability: 0.05
};

// ─── NetworkChaos ─────────────────────────────────────────────────────────────

/**
 * Network chaos injector for Lifeline Mesh integration tests.
 *
 * Wraps a simulated network of NodeSim instances and randomly applies
 * latency, loss, and disconnection events.
 *
 * @extends EventEmitter
 */
export class NetworkChaos extends EventEmitter {
  /**
   * @param {Object} [options] - Overrides for NETWORK_CHAOS_DEFAULTS
   */
  constructor(options = {}) {
    super();
    this.config = { ...NETWORK_CHAOS_DEFAULTS, ...options };

    /** @type {Map<string, NodeSim>} nodeId → NodeSim */
    this._nodes = new Map();

    /** @type {Map<string, { fromId: string, toId: string, status: string, since: number }>} */
    this._links = new Map();

    /** @type {Map<string, Set<string>>} partition label → nodeId set */
    this._partitions = new Map();

    this._running = false;
    this._probeTimer = null;

    /** Metrics collected during the run */
    this.metrics = {
      totalMessages: 0,
      deliveredMessages: 0,
      droppedMessages: 0,
      disconnections: 0,
      reconnections: 0,
      partitions: 0,
      startedAt: null,
      endedAt: null
    };
  }

  // ─── Node management ───────────────────────────────────────────────────────

  /**
   * Add a simulated node.
   * @param {string} nodeId
   * @param {Object} [nodeOptions]
   * @returns {NodeSim}
   */
  addNode(nodeId, nodeOptions = {}) {
    const node = new NodeSim(nodeId, { chaos: this, ...nodeOptions });
    this._nodes.set(nodeId, node);
    this.emit("node:added", nodeId);
    return node;
  }

  removeNode(nodeId) {
    const node = this._nodes.get(nodeId);
    if (node) node.destroy();
    this._nodes.delete(nodeId);
    this.emit("node:removed", nodeId);
  }

  /**
   * Connect two nodes with a simulated link.
   * @param {string} fromId
   * @param {string} toId
   */
  connectNodes(fromId, toId) {
    const linkKey = _linkKey(fromId, toId);
    this._links.set(linkKey, {
      fromId, toId,
      status: "connected",
      since: Date.now()
    });

    const fromNode = this._nodes.get(fromId);
    const toNode = this._nodes.get(toId);
    if (fromNode) fromNode._addPeer(toId, toNode);
    if (toNode) toNode._addPeer(fromId, fromNode);

    this.emit("link:connected", fromId, toId);
  }

  disconnectNodes(fromId, toId) {
    const linkKey = _linkKey(fromId, toId);
    const link = this._links.get(linkKey);
    if (!link) return;

    link.status = "disconnected";
    link.since = Date.now();

    const fromNode = this._nodes.get(fromId);
    const toNode = this._nodes.get(toId);
    if (fromNode) fromNode._removePeer(toId);
    if (toNode) toNode._removePeer(fromId);

    this.metrics.disconnections++;
    this.emit("link:disconnected", fromId, toId);
  }

  // ─── Chaos control ─────────────────────────────────────────────────────────

  /** Start the chaos probe loop. */
  start() {
    if (this._running) return;
    this._running = true;
    this.metrics.startedAt = Date.now();
    this._probeTimer = setInterval(() => this._probe(), this.config.probeIntervalMs);
    this.emit("started");
  }

  /** Stop the chaos probe loop. */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._probeTimer) {
      clearInterval(this._probeTimer);
      this._probeTimer = null;
    }
    this.metrics.endedAt = Date.now();
    this.emit("stopped", this.getMetrics());
  }

  /** @returns {Object} Current metrics snapshot */
  getMetrics() {
    const total = this.metrics.totalMessages;
    const delivered = this.metrics.deliveredMessages;
    return {
      ...this.metrics,
      deliveryRate: total > 0 ? delivered / total : null,
      durationMs: (this.metrics.endedAt || Date.now()) - (this.metrics.startedAt || Date.now()),
      nodeCount: this._nodes.size,
      linkCount: this._links.size
    };
  }

  // ─── Internal probe ────────────────────────────────────────────────────────

  _probe() {
    // Random link disconnections
    for (const [linkKey, link] of this._links.entries()) {
      if (link.status === "connected" && Math.random() < this.config.disconnectProbability) {
        const { fromId, toId } = link;
        this.disconnectNodes(fromId, toId);

        // Schedule reconnection
        const durationMs = _jitter(this.config.disconnectDurationMs, 0.5);
        setTimeout(() => {
          if (!this._running) return;
          link.status = "connected";
          link.since = Date.now();
          const fromNode = this._nodes.get(fromId);
          const toNode = this._nodes.get(toId);
          if (fromNode && toNode) {
            fromNode._addPeer(toId, toNode);
            toNode._addPeer(fromId, fromNode);
          }
          this.metrics.reconnections++;
          this.emit("link:reconnected", fromId, toId);
        }, durationMs);
      }
    }

    // Network partition events
    if (this.config.enablePartitions && Math.random() < this.config.partitionProbability) {
      this._applyPartition();
    }
  }

  _applyPartition() {
    const nodeIds = [...this._nodes.keys()];
    if (nodeIds.length < 4) return;

    // Split nodes into two groups randomly
    const shuffled = nodeIds.sort(() => Math.random() - 0.5);
    const mid = Math.floor(shuffled.length / 2);
    const groupA = new Set(shuffled.slice(0, mid));
    const groupB = new Set(shuffled.slice(mid));

    this.metrics.partitions++;
    this.emit("partition:start", { groupA: [...groupA], groupB: [...groupB] });

    // Disconnect cross-partition links
    for (const [, link] of this._links.entries()) {
      const aInA = groupA.has(link.fromId);
      const bInB = groupB.has(link.toId);
      const aInB = groupB.has(link.fromId);
      const bInA = groupA.has(link.toId);
      if ((aInA && bInB) || (aInB && bInA)) {
        this.disconnectNodes(link.fromId, link.toId);
      }
    }

    // Heal partition after duration
    setTimeout(() => {
      if (!this._running) return;
      for (const [linkKey, link] of this._links.entries()) {
        if (link.status === "disconnected") {
          link.status = "connected";
          link.since = Date.now();
          const fromNode = this._nodes.get(link.fromId);
          const toNode = this._nodes.get(link.toId);
          if (fromNode && toNode) {
            fromNode._addPeer(link.toId, toNode);
            toNode._addPeer(link.fromId, fromNode);
          }
        }
      }
      this.emit("partition:healed");
    }, _jitter(this.config.partitionDurationMs, 0.3));
  }

  /**
   * Apply artificial latency to a message send.
   * @param {Function} fn - Async function to delay
   * @returns {Promise}
   */
  injectLatency(fn) {
    const latencyMs = Math.max(0, _gaussian(this.config.meanLatencyMs, this.config.latencyStdMs));
    return new Promise((resolve, reject) => {
      setTimeout(() => fn().then(resolve, reject), latencyMs);
    });
  }

  /**
   * Decide whether to drop a packet (based on dropProbability).
   * @returns {boolean} true = drop the packet
   */
  shouldDrop() {
    return Math.random() < this.config.dropProbability;
  }
}

// ─── NodeSim ──────────────────────────────────────────────────────────────────

/**
 * Simulated Lifeline Mesh node for chaos testing.
 * Wraps a set of simulated BLE/LoRa peer connections with chaos injection.
 */
export class NodeSim extends EventEmitter {
  constructor(nodeId, { chaos = null, ...options } = {}) {
    super();
    this.nodeId = nodeId;
    this.chaos = chaos;

    /** @type {Map<string, NodeSim>} peerId → peer node */
    this._peers = new Map();

    /** @type {Map<string, Object>} msgId → message (inbox) */
    this.inbox = new Map();

    this.options = options;
  }

  _addPeer(peerId, peerNode) {
    this._peers.set(peerId, peerNode);
    this.emit("peer:connected", peerId);
  }

  _removePeer(peerId) {
    this._peers.delete(peerId);
    this.emit("peer:disconnected", peerId);
  }

  /** @returns {string[]} Connected peer IDs */
  get peers() {
    return [...this._peers.keys()];
  }

  /**
   * Send a message to all connected peers (with chaos injection).
   * @param {Object} message
   * @returns {Promise<{ sent: number, dropped: number }>}
   */
  async broadcast(message) {
    if (this.chaos) this.chaos.metrics.totalMessages++;

    let sent = 0;
    let dropped = 0;

    for (const [peerId, peer] of this._peers.entries()) {
      if (this.chaos?.shouldDrop()) {
        dropped++;
        if (this.chaos) this.chaos.metrics.droppedMessages++;
        this.emit("message:dropped", message.msgId, peerId);
        continue;
      }

      const sendFn = async () => {
        peer.inbox.set(message.msgId || String(Date.now()), message);
        peer.emit("message:received", message, this.nodeId);
        if (this.chaos) this.chaos.metrics.deliveredMessages++;
        sent++;
      };

      if (this.chaos) {
        await this.chaos.injectLatency(sendFn);
      } else {
        await sendFn();
      }
    }

    return { sent, dropped };
  }

  destroy() {
    this._peers.clear();
    this.removeAllListeners();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _linkKey(a, b) {
  return [a, b].sort().join("↔");
}

function _jitter(base, factor) {
  return base * (1 + (Math.random() - 0.5) * 2 * factor);
}

function _gaussian(mean, std) {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}
