/**
 * Lifeline Mesh - BatteryChaos Scenario
 *
 * Simulates power-constrained nodes in disaster scenarios:
 *   - Progressive battery drain (0-100% simulation)
 *   - Transmission power reduction as battery drops
 *   - Node shutdown at critical battery level
 *   - Sleep/wake cycles for power conservation
 *   - Solar charging simulation (intermittent recovery)
 *
 * @module tools/chaos/battery-chaos
 */

import { EventEmitter } from "events";

export const BATTERY_CHAOS_DEFAULTS = {
  /** Initial battery level [0, 100] */
  initialLevel: 100,
  /** Battery drain rate in % per minute of simulated time */
  drainRatePerMinute: 5,
  /** Battery level at which TX power is reduced (%) */
  lowBatteryThreshold: 30,
  /** Battery level at which the node enters sleep mode (%) */
  sleepThreshold: 15,
  /** Battery level at which the node shuts down (%) */
  shutdownThreshold: 5,
  /** Simulation tick interval in ms (real time) */
  tickIntervalMs: 1_000,
  /** How much simulated time passes per tick in minutes */
  timeScaleMinutesPerTick: 0.5,
  /** Enable solar charging simulation */
  enableSolarCharging: false,
  /** Solar charge rate in % per minute when charging */
  solarChargeRate: 3,
  /** Probability of solar charging being active per tick */
  solarActiveProbability: 0.3,
  /** Sleep duration in ms when battery hits sleepThreshold */
  sleepDurationMs: 10_000
};

// ─── BatteryNode ──────────────────────────────────────────────────────────────

/**
 * Simulates the battery lifecycle of a single Lifeline Mesh node.
 */
export class BatteryNode extends EventEmitter {
  /**
   * @param {string} nodeId
   * @param {Object} [options] - Overrides for BATTERY_CHAOS_DEFAULTS
   */
  constructor(nodeId, options = {}) {
    super();
    this.nodeId = nodeId;
    this.config = { ...BATTERY_CHAOS_DEFAULTS, ...options };

    this._level = this.config.initialLevel;
    this._state = "active"; // "active" | "low-power" | "sleeping" | "shutdown"
    this._sleepTimer = null;
    this._charging = false;

    /** Power multiplier: 1.0 = full power; <1.0 = reduced range */
    this.txPowerMultiplier = 1.0;
  }

  /** @returns {number} Current battery level [0, 100] */
  get level() { return this._level; }

  /** @returns {string} Node power state */
  get state() { return this._state; }

  /** @returns {boolean} True if node can transmit */
  get canTransmit() {
    return this._state === "active" || this._state === "low-power";
  }

  /**
   * Apply one simulation tick.
   * @param {boolean} [isSolarActive] - External solar charge signal
   */
  tick(isSolarActive = false) {
    if (this._state === "shutdown") return;
    if (this._state === "sleeping") return; // Sleeping → no drain, no tx

    const drainPerTick = this.config.drainRatePerMinute * this.config.timeScaleMinutesPerTick;

    if (isSolarActive || (this._charging && this.config.enableSolarCharging)) {
      const chargePerTick = this.config.solarChargeRate * this.config.timeScaleMinutesPerTick;
      this._level = Math.min(100, this._level - drainPerTick + chargePerTick);
    } else {
      this._level = Math.max(0, this._level - drainPerTick);
    }

    this._updateState();
    this.emit("tick", {
      nodeId: this.nodeId,
      level: this._level,
      state: this._state,
      txPowerMultiplier: this.txPowerMultiplier
    });
  }

  _updateState() {
    const prev = this._state;

    if (this._level <= this.config.shutdownThreshold) {
      this._state = "shutdown";
      this.txPowerMultiplier = 0;
      if (prev !== "shutdown") this.emit("shutdown", this.nodeId, this._level);
      return;
    }

    if (this._level <= this.config.sleepThreshold && this._state === "low-power") {
      this._enterSleep();
      return;
    }

    if (this._level <= this.config.lowBatteryThreshold) {
      this._state = "low-power";
      // Reduce TX power proportionally to battery level
      this.txPowerMultiplier = Math.max(0.3, this._level / this.config.lowBatteryThreshold);
      if (prev === "active") this.emit("low-battery", this.nodeId, this._level);
    } else {
      this._state = "active";
      this.txPowerMultiplier = 1.0;
      if (prev === "low-power") this.emit("battery-restored", this.nodeId, this._level);
    }
  }

  _enterSleep() {
    if (this._state === "sleeping") return;
    this._state = "sleeping";
    this.txPowerMultiplier = 0;
    this.emit("sleep:start", this.nodeId, this._level);

    this._sleepTimer = setTimeout(() => {
      if (this._state === "sleeping") {
        this._state = "low-power";
        this.txPowerMultiplier = 0.3;
        this.emit("sleep:end", this.nodeId, this._level);
      }
    }, this.config.sleepDurationMs);
  }

  /** Force-charge the battery (simulates user plugging in power). */
  charge(amount = 20) {
    this._level = Math.min(100, this._level + amount);
    if (this._state === "shutdown" || this._state === "sleeping") {
      this._state = "active";
      this.txPowerMultiplier = 1.0;
      this.emit("power-restored", this.nodeId, this._level);
    }
    this.emit("charged", this.nodeId, this._level);
  }

  reset() {
    this._level = this.config.initialLevel;
    this._state = "active";
    this.txPowerMultiplier = 1.0;
    if (this._sleepTimer) { clearTimeout(this._sleepTimer); this._sleepTimer = null; }
  }

  snapshot() {
    return {
      nodeId: this.nodeId,
      level: this._level,
      state: this._state,
      txPowerMultiplier: this.txPowerMultiplier,
      canTransmit: this.canTransmit
    };
  }
}

// ─── BatteryChaos ────────────────────────────────────────────────────────────

/**
 * BatteryChaos orchestrates battery simulation across multiple nodes.
 * Integrates with the NetworkChaos framework to disconnect nodes when
 * their battery drops to shutdown level.
 */
export class BatteryChaos extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.networkChaos] - Optional NetworkChaos instance to sync with
   * @param {Object} [options.nodeDefaults] - Default BatteryNode options
   */
  constructor(options = {}) {
    super();
    this.networkChaos = options.networkChaos ?? null;
    this.nodeDefaults = options.nodeDefaults ?? {};

    /** @type {Map<string, BatteryNode>} */
    this._batteryNodes = new Map();
    this._running = false;
    this._tickTimer = null;
    this._tickIntervalMs = options.tickIntervalMs ?? BATTERY_CHAOS_DEFAULTS.tickIntervalMs;

    this.metrics = {
      shutdowns: 0,
      sleepEvents: 0,
      lowBatteryEvents: 0
    };
  }

  /**
   * Add a node to battery simulation.
   * @param {string} nodeId
   * @param {Object} [options] - BatteryNode options
   * @returns {BatteryNode}
   */
  addNode(nodeId, options = {}) {
    const node = new BatteryNode(nodeId, { ...this.nodeDefaults, ...options });

    node.on("shutdown", (id, level) => {
      this.metrics.shutdowns++;
      this.emit("node:shutdown", id, level);
      // Disconnect from NetworkChaos if integrated
      if (this.networkChaos) {
        const netNode = this.networkChaos._nodes.get(id);
        if (netNode) {
          for (const peerId of netNode.peers) {
            this.networkChaos.disconnectNodes(id, peerId);
          }
        }
      }
    });

    node.on("sleep:start", (id, level) => {
      this.metrics.sleepEvents++;
      this.emit("node:sleep", id, level);
    });

    node.on("low-battery", (id, level) => {
      this.metrics.lowBatteryEvents++;
      this.emit("node:low-battery", id, level);
    });

    this._batteryNodes.set(nodeId, node);
    return node;
  }

  start() {
    if (this._running) return;
    this._running = true;

    this._tickTimer = setInterval(() => {
      for (const node of this._batteryNodes.values()) {
        const solarActive =
          node.config.enableSolarCharging &&
          Math.random() < node.config.solarActiveProbability;
        node.tick(solarActive);
      }
      this.emit("tick", this.getSnapshot());
    }, this._tickIntervalMs);
  }

  stop() {
    this._running = false;
    if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; }
  }

  getSnapshot() {
    const nodes = {};
    for (const [id, node] of this._batteryNodes.entries()) {
      nodes[id] = node.snapshot();
    }
    return {
      metrics: { ...this.metrics },
      nodes
    };
  }

  /** Convenience: create N nodes with staggered initial battery levels */
  static createStaggeredNodes(count, chaos, options = {}) {
    const bc = new BatteryChaos({ networkChaos: chaos, ...options });
    for (let i = 0; i < count; i++) {
      const nodeId = `node-${i}`;
      const initialLevel = 100 - (i / count) * 80; // 100% → 20%
      bc.addNode(nodeId, { initialLevel, ...options.nodeDefaults });
    }
    return bc;
  }
}
