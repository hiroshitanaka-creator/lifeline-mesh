/**
 * Lifeline Mesh - Hybrid Backhaul Transport Plugin
 *
 * Provides seamless integration with wide-area backhaul networks
 * (Starlink, LTE, satellite) when mesh-local transport (BLE/LoRa) fails.
 *
 * Features:
 *   - Automatic backhaul detection (Starlink, LTE, WiFi, satellite)
 *   - Priority failover: BLE → LoRa → Starlink (configurable)
 *   - `backhaul_flag` stamped on messages to identify relay path
 *   - Bulk sync on restoration: queued messages uploaded in batch
 *   - Anonymous mode: temporary key rotation for privacy on public backhaul
 *   - TAK Server endpoint integration
 *   - operator panel status reporting
 *
 * Transport priority order (default, configurable):
 *   1. BLE (direct, end-to-end encrypted, no internet)
 *   2. LoRa (mesh, medium range, no internet)
 *   3. Starlink / cloud relay (internet, authenticated upload)
 *
 * @module transport-layer/hybrid-backhaul
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const TRANSPORT_PRIORITY = {
  BLE: 1,
  LORA: 2,
  WIFI: 3,
  LTE: 4,
  STARLINK: 5,
  SATELLITE: 6
};

export const BACKHAUL_FLAG = "backhaul_v2";

/** Default failover chain */
export const DEFAULT_FAILOVER_CHAIN = ["ble", "lora", "starlink"];

// ─── HybridBackhaul ──────────────────────────────────────────────────────────

/**
 * Hybrid backhaul coordinator.
 *
 * Usage:
 *   const backhaul = new HybridBackhaul({
 *     transports: {
 *       ble:      bleManager,
 *       lora:     loraBackend,
 *       starlink: new StarlinkRelay({ endpoint: "https://relay.example.com/v2" })
 *     },
 *     failoverChain: ["ble", "lora", "starlink"],
 *     anonymousOnBackhaul: true
 *   });
 *
 *   await backhaul.send(message, recipientFp);
 */
export class HybridBackhaul {
  /**
   * @param {Object} options
   * @param {Object}   options.transports           - { ble, lora, starlink, ... }
   * @param {string[]} [options.failoverChain]      - Ordered transport names to try
   * @param {boolean}  [options.anonymousOnBackhaul] - Rotate keys for backhaul privacy
   * @param {Function} [options.getEphemeralKeys]   - () → { signPK, signSK, boxPK, boxSK }
   * @param {Function} [options.onTransportChange]  - (transport: string) → void
   * @param {Object}   [options.logger]
   */
  constructor(options = {}) {
    this.transports = options.transports ?? {};
    this.failoverChain = options.failoverChain ?? DEFAULT_FAILOVER_CHAIN;
    this.anonymousOnBackhaul = options.anonymousOnBackhaul ?? false;
    this.getEphemeralKeys = options.getEphemeralKeys ?? null;
    this.onTransportChange = options.onTransportChange ?? null;
    this.logger = options.logger ?? console;

    /** Currently active transport name */
    this._activeTransport = null;

    /** Messages queued during backhaul-only connectivity */
    this._pendingBulkSync = [];

    /** Backhaul detection probe interval */
    this._probeTimer = null;

    /** Last known transport capabilities */
    this._transportStatus = {};
  }

  // ─── Core send ─────────────────────────────────────────────────────────────

  /**
   * Send a message via the highest-priority available transport.
   * Falls back through the configured chain automatically.
   *
   * @param {Object} message - Lifeline Mesh encrypted message
   * @param {string} [recipientFp] - Recipient fingerprint (optional)
   * @returns {Promise<{ transport: string, backhaulFlag: boolean }>}
   */
  async send(message, recipientFp) {
    for (const transportName of this.failoverChain) {
      const transport = this.transports[transportName];
      if (!transport) continue;

      const isLocalTransport = transportName === "ble" || transportName === "lora";
      const isConnected =
        typeof transport.isConnected === "function"
          ? transport.isConnected()
          : false;

      if (!isConnected && isLocalTransport) {
        this.logger.log(`[HybridBackhaul] ${transportName} not connected, trying next`);
        continue;
      }

      const outMessage = { ...message };

      // Stamp backhaul flag on non-local transports
      if (!isLocalTransport) {
        outMessage.backhaul_flag = BACKHAUL_FLAG;
        outMessage.backhaul_transport = transportName;
        outMessage.backhaul_ts = Date.now();

        // Apply anonymous mode if configured
        if (this.anonymousOnBackhaul && this.getEphemeralKeys) {
          const ephKeys = await this.getEphemeralKeys();
          if (ephKeys) {
            outMessage._anon_hint = {
              ephSignPK: ephKeys.signPK,
              ephBoxPK: ephKeys.boxPK
            };
          }
        }
      }

      try {
        if (typeof transport.sendMessage === "function") {
          await transport.sendMessage(outMessage, { recipientFp });
        } else if (typeof transport.send === "function") {
          await transport.send(outMessage, recipientFp);
        } else {
          throw new Error(`Transport ${transportName} has no send method`);
        }

        if (this._activeTransport !== transportName) {
          this._activeTransport = transportName;
          if (this.onTransportChange) this.onTransportChange(transportName);
        }

        this.logger.log(`[HybridBackhaul] sent via ${transportName}`);
        return {
          transport: transportName,
          backhaulFlag: !isLocalTransport
        };
      } catch (err) {
        this.logger.warn(
          `[HybridBackhaul] ${transportName} send failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    throw new Error("[HybridBackhaul] All transports failed");
  }

  // ─── Bulk sync ─────────────────────────────────────────────────────────────

  /**
   * Queue a message for bulk upload when backhaul connectivity is restored.
   * Used during mesh-only operation to accumulate messages for later sync.
   *
   * @param {Object} message
   * @param {string} [recipientFp]
   */
  queueForBulkSync(message, recipientFp) {
    this._pendingBulkSync.push({
      message: { ...message, backhaul_flag: BACKHAUL_FLAG, backhaul_queued_at: Date.now() },
      recipientFp,
      queuedAt: Date.now()
    });
    this.logger.log(`[HybridBackhaul] queued for bulk sync: ${message.msgId} (queue=${this._pendingBulkSync.length})`);
  }

  /**
   * Upload all queued messages to the backhaul transport.
   * Called automatically when backhaul connectivity is detected.
   *
   * @param {string} [transportName] - Override transport (default: first available backhaul)
   * @returns {Promise<{ uploaded: number, failed: number }>}
   */
  async flushBulkSync(transportName) {
    const backhaulName = transportName ?? this._findAvailableBackhaul();
    if (!backhaulName) {
      this.logger.warn("[HybridBackhaul] No backhaul transport available for bulk sync");
      return { uploaded: 0, failed: 0 };
    }

    const transport = this.transports[backhaulName];
    if (!transport) return { uploaded: 0, failed: 0 };

    const queue = [...this._pendingBulkSync];
    this._pendingBulkSync = [];

    let uploaded = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        if (typeof transport.sendBatch === "function") {
          // Batch API (more efficient for satellite uplinks)
          await transport.sendBatch([item.message]);
        } else if (typeof transport.sendMessage === "function") {
          await transport.sendMessage(item.message, { recipientFp: item.recipientFp });
        }
        uploaded++;
      } catch (err) {
        this.logger.warn(`[HybridBackhaul] bulk sync failed for ${item.message.msgId}: ${err.message}`);
        this._pendingBulkSync.push(item); // re-queue
        failed++;
      }
    }

    this.logger.log(`[HybridBackhaul] bulk sync complete: uploaded=${uploaded} failed=${failed}`);
    return { uploaded, failed };
  }

  // ─── Backhaul detection ────────────────────────────────────────────────────

  /**
   * Probe for available backhaul connectivity.
   * Uses navigator.onLine and optional latency probe.
   *
   * @returns {Promise<{ available: boolean, transport: string|null, latencyMs: number|null }>}
   */
  async probeBackhaul() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { available: false, transport: null, latencyMs: null };
    }

    // Find first available backhaul transport (non-BLE, non-LoRa)
    for (const name of this.failoverChain) {
      if (name === "ble" || name === "lora") continue;
      const transport = this.transports[name];
      if (!transport) continue;

      if (typeof transport.probe === "function") {
        try {
          const result = await transport.probe();
          if (result.available) {
            return { available: true, transport: name, latencyMs: result.latencyMs ?? null };
          }
        } catch { /* transport unavailable */ }
      } else {
        // Assume available if online and transport is configured
        return { available: true, transport: name, latencyMs: null };
      }
    }

    return { available: false, transport: null, latencyMs: null };
  }

  /**
   * Start automatic backhaul monitoring.
   * On connectivity restoration, automatically flushes bulk sync queue.
   *
   * @param {number} [intervalMs] - Probe interval (default: 30 seconds)
   */
  startMonitoring(intervalMs = 30_000) {
    this.stopMonitoring();

    this._probeTimer = setInterval(async () => {
      const result = await this.probeBackhaul();
      if (result.available && this._pendingBulkSync.length > 0) {
        this.logger.log(`[HybridBackhaul] backhaul detected (${result.transport}), flushing ${this._pendingBulkSync.length} queued messages`);
        await this.flushBulkSync(result.transport);
      }
    }, intervalMs);
  }

  stopMonitoring() {
    if (this._probeTimer) {
      clearInterval(this._probeTimer);
      this._probeTimer = null;
    }
  }

  // ─── Status / diagnostics ─────────────────────────────────────────────────

  getStatus() {
    return {
      activeTransport: this._activeTransport,
      failoverChain: this.failoverChain,
      pendingBulkSync: this._pendingBulkSync.length,
      anonymousMode: this.anonymousOnBackhaul,
      transports: Object.fromEntries(
        Object.entries(this.transports).map(([name, t]) => [
          name,
          {
            configured: true,
            connected: typeof t.isConnected === "function" ? t.isConnected() : "unknown"
          }
        ])
      )
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  _findAvailableBackhaul() {
    for (const name of this.failoverChain) {
      if (name === "ble" || name === "lora") continue;
      if (this.transports[name]) return name;
    }
    return null;
  }
}

// ─── StarlinkRelay ──────────────────────────────────────────────────────────

/**
 * Starlink / satellite relay transport backend.
 *
 * Uploads messages to an optional cloud relay server via HTTPS when
 * Starlink connectivity is available. Recipients receive messages when
 * they reconnect to a node with backhaul access.
 *
 * Privacy: messages are already end-to-end encrypted by the Lifeline Mesh
 * protocol. The relay server sees ciphertext only.
 */
export class StarlinkRelay {
  /**
   * @param {Object} options
   * @param {string}   options.endpoint     - Relay server URL
   * @param {string}   [options.authToken]  - Bearer token (optional)
   * @param {number}   [options.timeoutMs]  - Request timeout (default: 15 000 ms)
   * @param {boolean}  [options.anonymous]  - Do not send auth headers
   */
  constructor(options = {}) {
    if (!options.endpoint) throw new Error("StarlinkRelay: endpoint is required");
    this.endpoint = options.endpoint;
    this.authToken = options.authToken ?? null;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.anonymous = options.anonymous ?? false;
    this._online = false;
  }

  isConnected() {
    return this._online && (typeof navigator === "undefined" || navigator.onLine);
  }

  async probe() {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000)
      });
      this._online = res.ok;
      return { available: res.ok, latencyMs: Date.now() - t0 };
    } catch {
      this._online = false;
      return { available: false, latencyMs: null };
    }
  }

  async sendMessage(message) {
    const headers = { "Content-Type": "application/json" };
    if (!this.anonymous && this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.endpoint}/v2/relay`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      throw new Error(`StarlinkRelay: upload failed ${res.status} ${res.statusText}`);
    }

    this._online = true;
    return res.json();
  }

  async sendBatch(messages) {
    const headers = { "Content-Type": "application/json" };
    if (!this.anonymous && this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const res = await fetch(`${this.endpoint}/v2/relay/batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      throw new Error(`StarlinkRelay: batch upload failed ${res.status} ${res.statusText}`);
    }

    this._online = true;
    return res.json();
  }
}

// ─── TAK Server integration ──────────────────────────────────────────────────

/**
 * TAK (Team Awareness Kit) Server integration endpoint.
 *
 * Converts Lifeline Mesh emergency messages to CoT (Cursor on Target) XML
 * format for interoperability with ATAK/WinTAK/iTAK clients.
 *
 * Reference: https://www.mitre.org/sites/default/files/pdf/09_4937.pdf
 */
export class TAKServerEndpoint {
  /**
   * @param {Object} options
   * @param {string} options.serverUrl  - TAK server URL (TCP/SSL or HTTPS)
   * @param {string} [options.callsign] - Default callsign for Lifeline Mesh node
   */
  constructor(options = {}) {
    if (!options.serverUrl) throw new Error("TAKServerEndpoint: serverUrl required");
    this.serverUrl = options.serverUrl;
    this.callsign = options.callsign ?? "LIFELINE";
  }

  /**
   * Convert a Lifeline Mesh payload to CoT XML and post to TAK server.
   *
   * @param {Object} payload - Decrypted Lifeline Mesh message payload
   * @param {Object} [location] - { lat, lng, hae? }
   * @returns {Promise<void>}
   */
  async sendCoT(payload, location) {
    const cot = this._toCoT(payload, location);
    const res = await fetch(`${this.serverUrl}/api/cot`, {
      method: "POST",
      headers: { "Content-Type": "application/xml" },
      body: cot,
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) {
      throw new Error(`TAK server error: ${res.status} ${res.statusText}`);
    }
  }

  /**
   * Convert a Lifeline Mesh payload to CoT XML.
   * @param {Object} payload
   * @param {Object} [location]
   * @returns {string} CoT XML
   */
  _toCoT(payload, location) {
    const ts = new Date(payload.ts || Date.now()).toISOString();
    const stale = new Date((payload.exp || payload.ts + 86400000)).toISOString();
    const uid = `LIFELINE.${payload.type || "msg"}.${Date.now()}`;
    const how = "m-g"; // machine-generated
    const lat = location?.lat ?? 0;
    const lng = location?.lng ?? 0;
    const hae = location?.hae ?? 9999999.0; // unknown altitude
    const ce = location?.accuracy ?? 9999999.0;

    const type = this._cotType(payload.type);
    const remarks = payload.content || "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
  uid="${uid}"
  type="${type}"
  how="${how}"
  time="${ts}"
  start="${ts}"
  stale="${stale}">
  <point lat="${lat}" lon="${lng}" hae="${hae}" ce="${ce}" le="9999999.0"/>
  <detail>
    <contact callsign="${this.callsign}-MESH"/>
    <remarks>${remarks.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]))}</remarks>
    <status readiness="true"/>
    <lifeline_mesh type="${payload.type || "text"}" urgency="${payload.urgency || "medium"}"/>
  </detail>
</event>`;
  }

  _cotType(msgType) {
    const map = {
      im_safe: "a-f-G-U-C",      // friendly ground unit — civilian
      need_help: "a-u-G",          // unknown ground (emergency)
      medical: "a-u-G-E-V-A",      // medical vehicle / emergency
      shelter_info: "b-m-p-s-m",  // shelter point
      supplies: "b-r-f-h-c",       // supply cache
      text: "a-f-G-U-C"
    };
    return map[msgType] ?? "a-f-G-U-C";
  }
}
