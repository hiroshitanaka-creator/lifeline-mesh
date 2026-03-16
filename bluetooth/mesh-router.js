/**
 * Lifeline Mesh - Mesh Router (Phase 1: 1-Hop Relay)
 *
 * Implements message relay for the Lifeline Mesh BLE network.
 *
 * Phase 1 scope (implemented here):
 *   - 1-hop relay only: messages are forwarded to directly connected peers only.
 *   - No dynamic routing table or path discovery.
 *   - Deduplication by transferId (msgId or derived fallback).
 *   - Hop budget enforcement: relay.hops < relay.maxHops.
 *   - Automatic cleanup of stale seen-message entries.
 *
 * Phase 2 (not implemented):
 *   - N-hop routing with route advertisements and expiry.
 *   - Shortest-path / freshest-route preference.
 *   - Loop prevention beyond simple TTL.
 *
 * Integration checklist (Phase 1):
 *   1. BLEManager receives message chunk stream and reassembles.
 *   2. Complete messages are deduplicated and stored in inbox.
 *   3. If message is not for this node and shouldForward() returns true,
 *      enqueue to outbox for each currently connected peer except ingress peer.
 *   4. Forwarded messages use the same ACK/retry/outbox flow as local outbound.
 */

export const ROUTER_DEFAULTS = {
  /** Maximum hops when no relay metadata is present in an inbound message. */
  DEFAULT_MAX_HOPS: 1,

  /** How long (ms) to remember a seen transferId before evicting it. */
  SEEN_TTL_MS: 60 * 1000,

  /** Max entries in the seen-message map before forced cleanup. */
  SEEN_MAP_MAX_SIZE: 2000
};

/**
 * Derives a stable transfer ID from a message object.
 * Matches the same logic used in BLEManager._getTransferId.
 *
 * @param {Object} message
 * @returns {string}
 */
function deriveTransferId(message) {
  if (!message || typeof message !== "object") {
    return `anonymous-${Date.now()}`;
  }
  return message.msgId || `${message.kind || "msg"}:${message.ts || Date.now()}`;
}

/**
 * MeshRouter — Phase 1: 1-hop relay.
 *
 * Usage:
 *   const router = new MeshRouter({ localPeerId: myFingerprint });
 *
 *   // On message received from a peer:
 *   const shouldRelay = router.shouldForward(message, ingressPeerId);
 *   if (shouldRelay) {
 *     for (const peerId of connectedPeers) {
 *       if (peerId !== ingressPeerId) {
 *         ble.sendMessage(message);
 *       }
 *     }
 *   }
 */
export class MeshRouter {
  /**
   * @param {Object} [options]
   * @param {string} [options.localPeerId] - Local node's fingerprint / peer ID.
   * @param {number} [options.defaultMaxHops] - Hop limit for messages without relay metadata.
   * @param {number} [options.seenTtlMs] - How long to remember a seen transfer ID.
   * @param {number} [options.seenMapMaxSize] - Max seen-map entries before forced cleanup.
   */
  constructor(options = {}) {
    this.localPeerId = options.localPeerId || "unknown";
    this.defaultMaxHops = options.defaultMaxHops ?? ROUTER_DEFAULTS.DEFAULT_MAX_HOPS;
    this.seenTtlMs = options.seenTtlMs ?? ROUTER_DEFAULTS.SEEN_TTL_MS;
    this.seenMapMaxSize = options.seenMapMaxSize ?? ROUTER_DEFAULTS.SEEN_MAP_MAX_SIZE;

    /**
     * Map from transferId → timestamp of first sight.
     * @type {Map<string, number>}
     */
    this._seen = new Map();
  }

  /**
   * Decide whether to forward a received message, and if so mutate the relay
   * metadata in place so downstream peers see the updated hop count.
   *
   * @param {Object} message - Parsed message object (will be mutated if forwarded).
   * @param {string} [ingressPeerId] - Peer ID the message arrived from (unused in Phase 1,
   *   reserved for Phase 2 path tracking).
   * @returns {boolean} true if the message should be relayed to other peers.
   */
  shouldForward(message, _ingressPeerId) {
    if (!message || typeof message !== "object") {
      return false;
    }

    const transferId = deriveTransferId(message);
    const relay = message.relay || { via: null, hops: 0, maxHops: this.defaultMaxHops };

    // Normalise hops / maxHops to numbers so callers can pass partial objects.
    const hops = typeof relay.hops === "number" ? relay.hops : 0;
    const maxHops = typeof relay.maxHops === "number" ? relay.maxHops : this.defaultMaxHops;

    // Reject if hop budget is already exhausted.
    if (hops >= maxHops) {
      return false;
    }

    // Reject duplicates (same transferId seen before).
    if (this._seen.has(transferId)) {
      return false;
    }

    // Evict stale entries if map is growing too large.
    if (this._seen.size >= this.seenMapMaxSize) {
      this.cleanup();
    }

    // Record that we've seen this transfer.
    this._seen.set(transferId, Date.now());

    // Stamp relay metadata so the next hop knows how far the message has traveled.
    message.relay = {
      via: this.localPeerId,
      hops: hops + 1,
      maxHops
    };

    return true;
  }

  /**
   * Evict seen-map entries that are older than seenTtlMs.
   *
   * Called automatically when the map reaches seenMapMaxSize, but can also
   * be called on a periodic timer to keep memory bounded in long-running sessions.
   *
   * @param {number} [now] - Current timestamp (injectable for tests).
   */
  cleanup(now = Date.now()) {
    for (const [id, ts] of this._seen.entries()) {
      if (now - ts > this.seenTtlMs) {
        this._seen.delete(id);
      }
    }
  }

  /**
   * Returns the number of entries currently in the seen-message map.
   * Useful for diagnostics and tests.
   *
   * @returns {number}
   */
  get seenCount() {
    return this._seen.size;
  }

  /**
   * Returns true if the given transferId has already been seen.
   *
   * @param {string} transferId
   * @returns {boolean}
   */
  hasSeen(transferId) {
    return this._seen.has(transferId);
  }

  /**
   * Reset all router state (seen-message map).
   * Useful between test cases.
   */
  reset() {
    this._seen.clear();
  }
}

export default MeshRouter;
