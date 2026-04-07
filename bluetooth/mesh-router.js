/**
 * Lifeline Mesh - Mesh Router (Phase 1 + Phase 2)
 *
 * Phase 1 scope:
 *   - 1-hop relay only (default): forward to directly connected peers.
 *   - Deduplication by transferId (msgId or derived fallback).
 *   - Hop budget enforcement: relay.hops < relay.maxHops.
 *   - Automatic cleanup of stale seen-message entries.
 *
 * Phase 2 scope (opt-in via options.enableRouting = true):
 *   - N-hop routing with proactive route advertisements.
 *   - Route table with expiry and sequence-number-based loop prevention.
 *   - Shortest-path / freshest-route preference.
 *   - Per-destination next-hop lookup; falls back to flooding when no route.
 *
 * Integration checklist (Phase 1 unchanged):
 *   1. BLEManager receives message chunk stream and reassembles.
 *   2. Complete messages are deduplicated and stored in inbox.
 *   3. If message is not for this node and shouldForward() returns true,
 *      enqueue to outbox for each currently connected peer except ingress peer.
 *   4. Forwarded messages use the same ACK/retry/outbox flow as local outbound.
 *
 * Integration notes (Phase 2):
 *   - Call addNeighbor(peerId) when a BLE connection is established.
 *   - Call removeNeighbor(peerId) when a BLE connection drops.
 *   - Call processRouteAdv(adv, ingressPeerId) when a ROUTE_ADV message arrives.
 *   - Call createRouteAdv() periodically (e.g. every 30 s) and broadcast.
 *   - Call getNextHop(destination) before sending to pick the best egress peer.
 *   - shouldForwardRouteAdv(adv) decides whether to re-broadcast an advertisement.
 */

export const ROUTER_DEFAULTS = {
  /** Maximum hops when no relay metadata is present in an inbound message. */
  DEFAULT_MAX_HOPS: 1,

  /** How long (ms) to remember a seen transferId before evicting it. */
  SEEN_TTL_MS: 60 * 1000,

  /** Max entries in the seen-message map before forced cleanup. */
  SEEN_MAP_MAX_SIZE: 2000
};

/** Route advertisement message kind identifier. */
export const ROUTE_ADV_KIND = "dmesh-route-adv";

export const ROUTING_DEFAULTS = {
  /** How long (ms) a route table entry is considered fresh. */
  ROUTE_TTL_MS: 5 * 60 * 1000,

  /** Maximum hop count allowed in route advertisements. */
  MAX_ROUTE_HOPS: 8,

  /**
   * Sequence-number window for loop prevention.
   * Advertisements whose seq is more than SEQ_WINDOW below the latest
   * seen seq for a given source are discarded as stale duplicates.
   */
  SEQ_WINDOW: 64,

  /** How long (ms) to remember a seen route-advertisement transferId. */
  ADV_SEEN_TTL_MS: 30 * 1000
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
 * Compare two route entries and return the preferred one.
 * Preference order: fewer hops → higher seq → more recent ts.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {Object} the preferred entry
 */
function preferredRoute(a, b) {
  if (a.hops !== b.hops) return a.hops < b.hops ? a : b;
  if (a.seq !== b.seq) return a.seq > b.seq ? a : b;
  return a.ts >= b.ts ? a : b;
}

// ---------------------------------------------------------------------------
// MeshRouter
// ---------------------------------------------------------------------------

/**
 * MeshRouter — Phase 1 (1-hop relay) + Phase 2 (N-hop proactive routing).
 *
 * Phase 1 usage (unchanged):
 *   const router = new MeshRouter({ localPeerId: myFingerprint });
 *   const shouldRelay = router.shouldForward(message, ingressPeerId);
 *
 * Phase 2 usage (opt-in):
 *   const router = new MeshRouter({
 *     localPeerId: myFingerprint,
 *     enableRouting: true,
 *     defaultMaxHops: 4
 *   });
 *
 *   // On BLE connect / disconnect:
 *   router.addNeighbor(peerId);
 *   router.removeNeighbor(peerId);
 *
 *   // On incoming ROUTE_ADV:
 *   const forward = router.processRouteAdv(adv, ingressPeerId);
 *   if (forward) broadcast(adv);
 *
 *   // Periodically:
 *   const adv = router.createRouteAdv();
 *   broadcast(adv);
 *
 *   // Before sending a data message:
 *   const nextHop = router.getNextHop(recipientFp);
 *   // nextHop === null → flood to all peers; otherwise send only to nextHop.
 */
export class MeshRouter {
  /**
   * @param {Object} [options]
   * @param {string}  [options.localPeerId]       - Local node fingerprint / peer ID.
   * @param {number}  [options.defaultMaxHops]    - Hop limit for messages without relay metadata.
   * @param {number}  [options.seenTtlMs]         - Seen-map TTL in ms.
   * @param {number}  [options.seenMapMaxSize]    - Max seen-map entries before forced cleanup.
   * @param {boolean} [options.enableRouting]     - Enable Phase 2 routing table (default: false).
   * @param {number}  [options.routeTtlMs]        - Route TTL in ms (Phase 2).
   * @param {number}  [options.maxRouteHops]      - Max hops in route advertisements (Phase 2).
   * @param {number}  [options.seqWindow]         - Sequence-number window for loop prevention (Phase 2).
   * @param {number}  [options.advSeenTtlMs]      - How long to remember seen adv transferIds (Phase 2).
   */
  constructor(options = {}) {
    this.localPeerId = options.localPeerId || "unknown";
    this.defaultMaxHops = options.defaultMaxHops ?? ROUTER_DEFAULTS.DEFAULT_MAX_HOPS;
    this.seenTtlMs = options.seenTtlMs ?? ROUTER_DEFAULTS.SEEN_TTL_MS;
    this.seenMapMaxSize = options.seenMapMaxSize ?? ROUTER_DEFAULTS.SEEN_MAP_MAX_SIZE;
    this.enableRouting = options.enableRouting ?? false;

    // Phase 2 options
    this.routeTtlMs = options.routeTtlMs ?? ROUTING_DEFAULTS.ROUTE_TTL_MS;
    this.maxRouteHops = options.maxRouteHops ?? ROUTING_DEFAULTS.MAX_ROUTE_HOPS;
    this.seqWindow = options.seqWindow ?? ROUTING_DEFAULTS.SEQ_WINDOW;
    this.advSeenTtlMs = options.advSeenTtlMs ?? ROUTING_DEFAULTS.ADV_SEEN_TTL_MS;

    // Phase 1: seen-message map for data deduplication.
    /** @type {Map<string, number>} transferId → timestamp */
    this._seen = new Map();

    // Phase 2: routing state (only populated when enableRouting is true).

    /**
     * Route table: destination fingerprint → best RouteEntry.
     * RouteEntry = { dst, via, hops, seq, ts, expiresAt }
     * @type {Map<string, Object>}
     */
    this._routes = new Map();

    /**
     * Directly connected neighbors (set by the application layer).
     * @type {Set<string>}
     */
    this._neighbors = new Set();

    /**
     * Last seen sequence number per source (for loop prevention).
     * @type {Map<string, number>}
     */
    this._srcSeq = new Map();

    /**
     * Seen-advertisement map for deduplication of ROUTE_ADV floods.
     * advKey (src:seq) → timestamp
     * @type {Map<string, number>}
     */
    this._advSeen = new Map();

    /**
     * Monotonically increasing sequence number for outbound advertisements.
     * @type {number}
     */
    this._localSeq = 0;
  }

  // ─── Phase 1 API ──────────────────────────────────────────────────────────

  /**
   * Decide whether to forward a received data message and stamp relay metadata.
   *
   * @param {Object} message - Parsed message (mutated on forward).
   * @param {string} [_ingressPeerId] - Unused in Phase 1; reserved for Phase 2.
   * @returns {boolean}
   */
  shouldForward(message, _ingressPeerId) {
    if (!message || typeof message !== "object") {
      return false;
    }

    const transferId = deriveTransferId(message);
    const relay = message.relay || { via: null, hops: 0, maxHops: this.defaultMaxHops };

    const hops = typeof relay.hops === "number" ? relay.hops : 0;
    const maxHops = typeof relay.maxHops === "number" ? relay.maxHops : this.defaultMaxHops;

    if (hops >= maxHops) {
      return false;
    }

    if (this._seen.has(transferId)) {
      return false;
    }

    if (this._seen.size >= this.seenMapMaxSize) {
      this.cleanup();
    }

    this._seen.set(transferId, Date.now());

    message.relay = {
      via: this.localPeerId,
      hops: hops + 1,
      maxHops
    };

    return true;
  }

  /**
   * Evict seen-map entries older than seenTtlMs.
   *
   * @param {number} [now]
   */
  cleanup(now = Date.now()) {
    for (const [id, ts] of this._seen.entries()) {
      if (now - ts > this.seenTtlMs) {
        this._seen.delete(id);
      }
    }

    if (this.enableRouting) {
      this._cleanupRoutes(now);
      this._cleanupAdvSeen(now);
    }
  }

  /** @returns {number} */
  get seenCount() {
    return this._seen.size;
  }

  /** @param {string} transferId @returns {boolean} */
  hasSeen(transferId) {
    return this._seen.has(transferId);
  }

  /** Reset all state. */
  reset() {
    this._seen.clear();
    this._routes.clear();
    this._neighbors.clear();
    this._srcSeq.clear();
    this._advSeen.clear();
    this._localSeq = 0;
  }

  // ─── Phase 2 API ──────────────────────────────────────────────────────────

  /**
   * Register a directly connected neighbor.
   * Also installs a 0-hop route to that neighbor.
   *
   * @param {string} peerId
   */
  addNeighbor(peerId) {
    if (!peerId || peerId === this.localPeerId) return;
    this._neighbors.add(peerId);
    this._upsertRoute({
      dst: peerId,
      via: peerId,
      hops: 0,
      seq: 0,
      ts: Date.now(),
      expiresAt: Date.now() + this.routeTtlMs
    });
  }

  /**
   * Remove a disconnected neighbor and all routes that used it as next-hop.
   *
   * @param {string} peerId
   */
  removeNeighbor(peerId) {
    this._neighbors.delete(peerId);
    for (const [dst, entry] of this._routes.entries()) {
      if (entry.via === peerId) {
        this._routes.delete(dst);
      }
    }
  }

  /**
   * Process an incoming route advertisement. Updates the route table with
   * any new or improved routes discovered in the advertisement.
   *
   * @param {Object} adv - A ROUTE_ADV message object.
   * @param {string} ingressPeerId - The peer the advertisement arrived from.
   * @returns {boolean} true if this advertisement should be re-broadcast.
   */
  processRouteAdv(adv, ingressPeerId) {
    if (!adv || adv.kind !== ROUTE_ADV_KIND) return false;
    if (!adv.src || typeof adv.seq !== "number") return false;

    const advKey = `${adv.src}:${adv.seq}`;

    // Dedup: drop if we've already processed this exact advertisement.
    if (this._advSeen.has(advKey)) {
      return false;
    }

    // Loop prevention: drop if seq is too far behind the last seen seq for
    // this source (within SEQ_WINDOW to handle wrap-around gracefully).
    const lastSeq = this._srcSeq.get(adv.src);
    if (lastSeq !== undefined) {
      const delta = adv.seq - lastSeq;
      // Negative delta that isn't a large wrap-around → stale advertisement.
      if (delta < 0 && delta > -this.seqWindow) {
        return false;
      }
    }

    // Update last-seen sequence number for this source.
    this._srcSeq.set(adv.src, adv.seq);

    // Record advertisement as seen (for dedup on re-broadcast paths).
    this._advSeen.set(advKey, Date.now());

    const now = Date.now();

    // Install a route to the advertisement originator via the ingress peer.
    // The originator is 1 hop via ingressPeerId (unless ingressPeerId IS the originator).
    if (adv.src !== this.localPeerId && ingressPeerId) {
      const hopsToCaller = adv.src === ingressPeerId ? 0 : 1;
      this._upsertRoute({
        dst: adv.src,
        via: ingressPeerId,
        hops: hopsToCaller,
        seq: adv.seq,
        ts: adv.ts || now,
        expiresAt: now + this.routeTtlMs
      });
    }

    // Process each route entry carried in the advertisement.
    if (Array.isArray(adv.routes)) {
      for (const r of adv.routes) {
        if (!r.dst || r.dst === this.localPeerId) continue;
        if (typeof r.hops !== "number" || r.hops < 0) continue;

        const hopsViaAdv = r.hops + 1; // +1 for the hop to adv.src
        if (hopsViaAdv > this.maxRouteHops) continue;

        this._upsertRoute({
          dst: r.dst,
          via: ingressPeerId,
          hops: hopsViaAdv,
          seq: adv.seq,
          ts: adv.ts || now,
          expiresAt: now + this.routeTtlMs
        });
      }
    }

    return true; // caller should re-broadcast this advertisement
  }

  /**
   * Create a route advertisement for this node to broadcast to neighbors.
   * Includes all non-expired routes this node knows about (up to maxRouteHops).
   *
   * @returns {Object} A ROUTE_ADV message ready to send.
   */
  createRouteAdv() {
    this._localSeq = (this._localSeq + 1) & 0xffffffff; // 32-bit wrap-around
    const now = Date.now();

    const routes = [];
    for (const [dst, entry] of this._routes.entries()) {
      if (entry.expiresAt > now && entry.hops < this.maxRouteHops) {
        routes.push({ dst, hops: entry.hops });
      }
    }

    return {
      kind: ROUTE_ADV_KIND,
      src: this.localPeerId,
      seq: this._localSeq,
      ts: now,
      routes
    };
  }

  /**
   * Look up the best known next-hop peer for a given destination.
   *
   * @param {string} destination - Destination peer fingerprint.
   * @returns {string|null} The next-hop peer ID, or null if no route is known
   *   (caller should flood to all connected peers as fallback).
   */
  getNextHop(destination) {
    if (!destination) return null;
    if (this._neighbors.has(destination)) return destination; // direct neighbor

    const entry = this._routes.get(destination);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this._routes.delete(destination);
      return null;
    }
    return entry.via;
  }

  /**
   * Decide whether an incoming route advertisement should be re-broadcast.
   * This is a lighter wrapper around processRouteAdv for callers that want
   * to keep route-table updates and forwarding decisions separate.
   *
   * In practice most callers should just use processRouteAdv() which both
   * updates the table and returns the forwarding decision in one call.
   *
   * @param {Object} adv
   * @returns {boolean}
   */
  shouldForwardRouteAdv(adv) {
    if (!adv || adv.kind !== ROUTE_ADV_KIND) return false;
    const advKey = `${adv.src}:${adv.seq}`;
    if (this._advSeen.has(advKey)) return false;
    const lastSeq = this._srcSeq.get(adv.src);
    if (lastSeq !== undefined) {
      const delta = adv.seq - lastSeq;
      if (delta < 0 && delta > -this.seqWindow) return false;
    }
    return true;
  }

  /**
   * Returns a snapshot of the current route table for diagnostics.
   *
   * @returns {Array<Object>} Array of route entries (copies, not references).
   */
  getRouteTable() {
    const now = Date.now();
    const result = [];
    for (const [dst, entry] of this._routes.entries()) {
      result.push({
        dst,
        via: entry.via,
        hops: entry.hops,
        seq: entry.seq,
        ts: entry.ts,
        ttlRemaining: Math.max(0, entry.expiresAt - now)
      });
    }
    return result;
  }

  /** @returns {number} Number of entries in the route table. */
  get routeCount() {
    return this._routes.size;
  }

  /** @returns {Set<string>} Copy of the current neighbor set. */
  get neighbors() {
    return new Set(this._neighbors);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Insert or update a route entry using the preference function.
   *
   * @param {Object} candidate - { dst, via, hops, seq, ts, expiresAt }
   */
  _upsertRoute(candidate) {
    const existing = this._routes.get(candidate.dst);
    if (!existing || preferredRoute(candidate, existing) === candidate) {
      this._routes.set(candidate.dst, candidate);
    }
  }

  /** Evict expired route entries. */
  _cleanupRoutes(now = Date.now()) {
    for (const [dst, entry] of this._routes.entries()) {
      if (entry.expiresAt <= now) {
        this._routes.delete(dst);
      }
    }
  }

  /** Evict stale advertisement-seen entries. */
  _cleanupAdvSeen(now = Date.now()) {
    for (const [key, ts] of this._advSeen.entries()) {
      if (now - ts > this.advSeenTtlMs) {
        this._advSeen.delete(key);
      }
    }
  }
}

export default MeshRouter;
