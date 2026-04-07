/**
 * Lifeline Mesh - Meshtastic / goTenna Bridge
 *
 * Converts between Lifeline Mesh wire format and:
 *   - Meshtastic JSON API format (https://meshtastic.org/docs/development/api)
 *   - goTenna Mesh JSON format
 *   - TAK Server CoT XML (see transport-layer/hybrid-backhaul.js)
 *
 * This module is used by the LoRa backend (bluetooth/ble-manager.js LoRaBackend)
 * when communicating with Meshtastic devices over serial or MQTT.
 *
 * Architecture:
 *   Lifeline Mesh ←→ MeshtasticConverter ←→ Meshtastic node (serial/MQTT)
 *
 * Meshtastic channel configuration required:
 *   - PSK: "lifeline" (or custom shared key)
 *   - Channel name: "LIFELINE"
 *   - Modem preset: LONG_FAST
 *
 * @module tools/bridge/meshtastic-converter
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Meshtastic port numbers used for Lifeline Mesh payloads */
export const MESHTASTIC_PORTS = {
  TEXT_MESSAGE: 1,        // Plain text (fallback for non-Lifeline nodes)
  TELEMETRY: 67,          // Device telemetry
  LIFELINE_MESH: 256,     // Custom port: Lifeline Mesh v2 binary
  POSITION: 3             // GPS position
};

/** Maximum Meshtastic payload size */
export const MESHTASTIC_MAX_PAYLOAD = 237; // bytes (after protocol overhead)

/** Lifeline Mesh channel PSK (ASCII, 16 chars) */
export const LIFELINE_CHANNEL_NAME = "LIFELINE";

// ─── MeshtasticConverter ─────────────────────────────────────────────────────

/**
 * Converts Lifeline Mesh messages to/from Meshtastic JSON format.
 *
 * Meshtastic JSON (FromRadio):
 * {
 *   "packet": {
 *     "from": 1234567890,          // Node ID (uint32)
 *     "to": 4294967295,            // Destination (0xFFFFFFFF = broadcast)
 *     "decoded": {
 *       "portnum": "TEXT_MESSAGE_APP",
 *       "text": "...",             // for text messages
 *       "payload": "<base64>",     // for binary payloads
 *     },
 *     "id": 12345,
 *     "rxTime": 1706012345,
 *     "rxSnr": 8.0,
 *     "rxRssi": -85,
 *     "hopLimit": 3
 *   }
 * }
 */
export class MeshtasticConverter {
  /**
   * @param {Object} [options]
   * @param {number} [options.localNodeId] - Local Meshtastic node ID (uint32)
   * @param {string} [options.channelKey] - AES channel key (hex string)
   * @param {boolean} [options.stripEncryption] - If true, send plaintext (for testing)
   */
  constructor(options = {}) {
    this.localNodeId = options.localNodeId ?? 0;
    this.channelKey = options.channelKey ?? null;
    this.stripEncryption = options.stripEncryption ?? false;
  }

  // ─── Lifeline Mesh → Meshtastic ──────────────────────────────────────────

  /**
   * Convert a Lifeline Mesh message to a Meshtastic ToRadio packet.
   *
   * For Meshtastic nodes that support custom port numbers (portnum 256),
   * the full Lifeline Mesh JSON is packed as a binary payload.
   *
   * For compatibility with standard Meshtastic text nodes, a short
   * human-readable summary is also included in the `text` field.
   *
   * @param {Object} lifeline_message - Lifeline Mesh encrypted message
   * @param {Object} [options]
   * @param {number} [options.destNodeId] - Destination node ID (default: broadcast)
   * @param {number} [options.hopLimit]  - Hop limit (default: 3)
   * @returns {Object} Meshtastic ToRadio packet JSON
   */
  toMeshtastic(lifeline_message, options = {}) {
    const destNodeId = options.destNodeId ?? 0xffffffff; // broadcast
    const hopLimit = options.hopLimit ?? 3;

    const msgJson = JSON.stringify(lifeline_message);
    const msgBytes = new TextEncoder().encode(msgJson);

    // If message fits in one Meshtastic packet, send as-is
    // Otherwise, must chunk (handled by caller via chunkForMeshtastic())
    if (msgBytes.length > MESHTASTIC_MAX_PAYLOAD) {
      throw new Error(
        `Message too large for single Meshtastic packet: ${msgBytes.length}B > ${MESHTASTIC_MAX_PAYLOAD}B. ` +
        "Use chunkForMeshtastic() instead."
      );
    }

    const payloadB64 = _uint8ToBase64(msgBytes);
    const summary = this._makeSummary(lifeline_message);

    return {
      packet: {
        to: destNodeId,
        from: this.localNodeId,
        decoded: {
          portnum: "PRIVATE_APP",
          portnumValue: MESHTASTIC_PORTS.LIFELINE_MESH,
          payload: payloadB64,
          // Text fallback for Meshtastic nodes without Lifeline firmware
          text: summary
        },
        id: Math.floor(Math.random() * 0x7fffffff),
        hopLimit,
        channel: LIFELINE_CHANNEL_NAME,
        wantAck: true
      }
    };
  }

  /**
   * Chunk a large Lifeline Mesh message into multiple Meshtastic packets.
   *
   * @param {Object} lifeline_message
   * @param {Object} [options] - Same as toMeshtastic options
   * @returns {Object[]} Array of Meshtastic ToRadio packets
   */
  chunkForMeshtastic(lifeline_message, options = {}) {
    const msgJson = JSON.stringify(lifeline_message);
    const msgBytes = new TextEncoder().encode(msgJson);
    const msgId = lifeline_message.msgId || `meshtastic-${Date.now()}`;

    const CHUNK_DATA_SIZE = MESHTASTIC_MAX_PAYLOAD - 40; // 40 bytes for chunk envelope
    const total = Math.ceil(msgBytes.length / CHUNK_DATA_SIZE);
    const packets = [];

    for (let seq = 0; seq < total; seq++) {
      const start = seq * CHUNK_DATA_SIZE;
      const end = Math.min(start + CHUNK_DATA_SIZE, msgBytes.length);
      const chunkData = msgBytes.slice(start, end);

      const chunkEnvelope = {
        kind: "lm-chunk",
        msgId,
        seq,
        total,
        data: _uint8ToBase64(chunkData)
      };

      const chunkBytes = new TextEncoder().encode(JSON.stringify(chunkEnvelope));
      const destNodeId = options.destNodeId ?? 0xffffffff;
      const hopLimit = options.hopLimit ?? 3;

      packets.push({
        packet: {
          to: destNodeId,
          from: this.localNodeId,
          decoded: {
            portnum: "PRIVATE_APP",
            portnumValue: MESHTASTIC_PORTS.LIFELINE_MESH,
            payload: _uint8ToBase64(chunkBytes)
          },
          id: Math.floor(Math.random() * 0x7fffffff) + seq,
          hopLimit,
          channel: LIFELINE_CHANNEL_NAME,
          wantAck: seq === total - 1 // ACK only the last chunk
        }
      });
    }

    return packets;
  }

  // ─── Meshtastic → Lifeline Mesh ──────────────────────────────────────────

  /**
   * Parse an incoming Meshtastic FromRadio packet.
   *
   * Returns null if the packet is not a Lifeline Mesh message.
   *
   * @param {Object} meshtasticPacket - Meshtastic JSON packet
   * @returns {{ message?: Object, chunk?: Object, type: string } | null}
   */
  fromMeshtastic(meshtasticPacket) {
    const pkt = meshtasticPacket?.packet;
    if (!pkt) return null;

    const decoded = pkt.decoded;
    if (!decoded) return null;

    // Only process Lifeline Mesh custom port
    const isLifelinePort =
      decoded.portnumValue === MESHTASTIC_PORTS.LIFELINE_MESH ||
      decoded.portnum === "PRIVATE_APP";

    if (!isLifelinePort) {
      // Handle plain text messages as Lifeline Mesh text type
      if (decoded.portnum === "TEXT_MESSAGE_APP" && decoded.text) {
        return {
          type: "text-fallback",
          message: {
            kind: "dmesh-msg",
            v: 1,
            ts: (pkt.rxTime || Date.now() / 1000) * 1000,
            content: decoded.text,
            via_meshtastic: true,
            meshtastic_from: pkt.from,
            meshtastic_rssi: pkt.rxRssi,
            meshtastic_snr: pkt.rxSnr
          }
        };
      }
      return null;
    }

    if (!decoded.payload) return null;

    let payloadBytes;
    try {
      payloadBytes = _base64ToUint8(decoded.payload);
    } catch {
      return null;
    }

    let payloadObj;
    try {
      payloadObj = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch {
      return null;
    }

    // Chunk envelope
    if (payloadObj.kind === "lm-chunk") {
      return {
        type: "chunk",
        chunk: {
          ...payloadObj,
          meshtastic_from: pkt.from,
          meshtastic_rssi: pkt.rxRssi,
          meshtastic_snr: pkt.rxSnr,
          receivedAt: Date.now()
        }
      };
    }

    // Complete Lifeline Mesh message
    return {
      type: "message",
      message: {
        ...payloadObj,
        via_meshtastic: true,
        meshtastic_from: pkt.from,
        meshtastic_rssi: pkt.rxRssi,
        meshtastic_snr: pkt.rxSnr,
        receivedAt: Date.now()
      }
    };
  }

  // ─── goTenna bridge ──────────────────────────────────────────────────────

  /**
   * Convert a Lifeline Mesh message to goTenna Mesh API format.
   *
   * goTenna API: https://github.com/gotenna/PublicSDK
   * Payload format: { sender_gid, recipient_gids, data: "<b64>", type: 1 }
   *
   * @param {Object} lifeline_message
   * @param {Object} options
   * @param {string} options.senderGid  - Sender GID (goTenna user ID)
   * @param {string[]} [options.recipientGids] - Recipients (default: broadcast)
   * @returns {Object} goTenna API message object
   */
  toGoTenna(lifeline_message, options = {}) {
    const msgJson = JSON.stringify(lifeline_message);
    const msgBytes = new TextEncoder().encode(msgJson);

    // goTenna max payload: 235 bytes; use base64 encoding
    if (msgBytes.length > 235) {
      throw new Error(
        `Message too large for goTenna: ${msgBytes.length}B > 235B. Use chunking.`
      );
    }

    return {
      sender_gid: options.senderGid,
      recipient_gids: options.recipientGids ?? [],
      data: _uint8ToBase64(msgBytes),
      type: 1,  // type 1 = encrypted data message
      is_binary: true,
      channel: LIFELINE_CHANNEL_NAME
    };
  }

  /**
   * Parse an incoming goTenna message.
   * @param {Object} gotennaMsg - goTenna API message object
   * @returns {{ message: Object } | null}
   */
  fromGoTenna(gotennaMsg) {
    if (!gotennaMsg || !gotennaMsg.data) return null;

    let bytes;
    try {
      bytes = _base64ToUint8(gotennaMsg.data);
    } catch {
      return null;
    }

    let message;
    try {
      message = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }

    return {
      type: "message",
      message: {
        ...message,
        via_gotenna: true,
        gotenna_sender: gotennaMsg.sender_gid,
        receivedAt: Date.now()
      }
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Generate a short human-readable summary for Meshtastic text fallback.
   * @param {Object} msg
   * @returns {string}
   */
  _makeSummary(msg) {
    const kind = msg.kind || "msg";
    const type = msg.type || kind;
    const fp = (msg.senderSignPK || "").slice(0, 8) || "MESH";

    const summaries = {
      im_safe: `[LIFELINE:SAFE] ${fp}`,
      need_help: `[LIFELINE:HELP] ${fp}`,
      medical: `[LIFELINE:MEDICAL] ${fp}`,
      shelter_info: `[LIFELINE:SHELTER] ${fp}`,
      text: `[LIFELINE] ${fp}`
    };

    return summaries[type] || `[LIFELINE:${type.toUpperCase()}] ${fp}`;
  }
}

// ─── ChunkReassembler ─────────────────────────────────────────────────────────

/**
 * Reassembles chunked Lifeline Mesh messages received via Meshtastic.
 */
export class ChunkReassembler {
  constructor() {
    /** msgId → { chunks: Map<seq, Uint8Array>, total, receivedAt } */
    this._pending = new Map();
    this._timeoutMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Add a chunk and attempt reassembly.
   * @param {Object} chunk - { msgId, seq, total, data: base64 }
   * @returns {Object|null} Reassembled message or null if incomplete
   */
  addChunk(chunk) {
    const { msgId, seq, total, data } = chunk;
    if (!msgId || typeof seq !== "number" || typeof total !== "number") return null;

    if (!this._pending.has(msgId)) {
      this._pending.set(msgId, { chunks: new Map(), total, receivedAt: Date.now() });
    }

    const state = this._pending.get(msgId);
    state.chunks.set(seq, _base64ToUint8(data));

    if (state.chunks.size < total) return null;

    // All chunks received — reassemble
    const parts = [];
    for (let i = 0; i < total; i++) {
      const part = state.chunks.get(i);
      if (!part) return null; // gap
      parts.push(part);
    }

    const combined = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    this._pending.delete(msgId);

    try {
      return JSON.parse(new TextDecoder().decode(combined));
    } catch {
      return null;
    }
  }

  /** Evict stale partial assemblies. */
  cleanup() {
    const cutoff = Date.now() - this._timeoutMs;
    for (const [msgId, state] of this._pending.entries()) {
      if (state.receivedAt < cutoff) {
        this._pending.delete(msgId);
      }
    }
  }
}

// ─── Utility functions ────────────────────────────────────────────────────────

function _uint8ToBase64(u8) {
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  if (typeof globalThis.btoa === "function") return globalThis.btoa(binary);
  return Buffer.from(u8).toString("base64");
}

function _base64ToUint8(b64) {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}
