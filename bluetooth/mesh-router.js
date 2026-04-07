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

// ============================================================================
// Phase 3: ETX-based routing + Bloom filter loop prevention
// ============================================================================

// ─── BloomFilter ─────────────────────────────────────────────────────────────

/**
 * A simple in-memory Bloom filter for O(1) probabilistic duplicate detection.
 *
 * Parameters chosen for 100-node / 10k-message scale:
 *   - m = 131072 bits (16 KB)    — bit array size
 *   - k = 3                       — number of hash functions
 * Expected false-positive rate ≈ 0.1% for 10 000 elements.
 *
 * This is used as a fast pre-filter before the authoritative IndexedDB seen-set
 * lookup. A false positive causes an unnecessary IndexedDB query; a false
 * negative is impossible (Bloom filters never produce false negatives).
 */
export class BloomFilter {
  /**
   * @param {number} [m] - Bit array size (default 131072 = 16 KB)
   * @param {number} [k] - Number of hash functions (default 3)
   */
  constructor(m = 131072, k = 3) {
    this.m = m;
    this.k = k;
    this._bits = new Uint8Array(Math.ceil(m / 8));
    this._count = 0;
  }

  /**
   * FNV-1a 32-bit hash variant with seed for multiple independent hashes.
   * @param {string} str
   * @param {number} seed
   * @returns {number}
   */
  _hash(str, seed) {
    let h = (seed ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  /**
   * Add a string key to the Bloom filter.
   * @param {string} key
   */
  add(key) {
    for (let i = 0; i < this.k; i++) {
      const bit = this._hash(key, i * 0xdeadbeef) % this.m;
      this._bits[bit >> 3] |= 1 << (bit & 7);
    }
    this._count++;
  }

  /**
   * Test whether a key is possibly in the set.
   * @param {string} key
   * @returns {boolean} false = definitely not present; true = probably present
   */
  mightContain(key) {
    for (let i = 0; i < this.k; i++) {
      const bit = this._hash(key, i * 0xdeadbeef) % this.m;
      if (!(this._bits[bit >> 3] & (1 << (bit & 7)))) return false;
    }
    return true;
  }

  /** @returns {number} Approximate number of elements added */
  get count() {
    return this._count;
  }

  /** Reset the filter. */
  clear() {
    this._bits.fill(0);
    this._count = 0;
  }

  /**
   * Serialize to a plain object for IndexedDB persistence.
   * @returns {{ m: number, k: number, bits: string, count: number }}
   */
  serialize() {
    return {
      m: this.m,
      k: this.k,
      bits: Array.from(this._bits).join(","),
      count: this._count
    };
  }

  /**
   * Deserialize from a persisted plain object.
   * @param {{ m: number, k: number, bits: string, count: number }} obj
   * @returns {BloomFilter}
   */
  static deserialize(obj) {
    const bf = new BloomFilter(obj.m, obj.k);
    const bytes = obj.bits.split(",").map(Number);
    bf._bits = new Uint8Array(bytes);
    bf._count = obj.count;
    return bf;
  }
}

// ─── ETX Link State ──────────────────────────────────────────────────────────

/**
 * Per-link ETX (Expected Transmission Count) tracker.
 *
 * ETX = 1 / delivery_ratio (lower = better).
 * A perfect link has ETX = 1.0. A 50% loss link has ETX = 2.0.
 *
 * Uses an exponentially weighted moving average (EWMA) with α = 0.25:
 *   delivery_ratio = α * sample + (1 - α) * prev_ratio
 *
 * Reference: De Couto et al., "A High-Throughput Path Metric for Multi-Hop
 * Wireless Routing" (MobiCom 2003).
 */
export class ETXLinkState {
  /**
   * @param {Object} [options]
   * @param {number} [options.alpha] - EWMA smoothing factor (default 0.25)
   * @param {number} [options.initialRatio] - Starting delivery ratio (default 1.0 = perfect)
   * @param {number} [options.windowSize] - Sample window for variance tracking (default 20)
   */
  constructor(options = {}) {
    this.alpha = options.alpha ?? 0.25;
    this._deliveryRatio = options.initialRatio ?? 1.0;
    this._windowSize = options.windowSize ?? 20;
    this._samples = []; // ring buffer of 0/1 samples
    this._totalSent = 0;
    this._totalDelivered = 0;
    this.lastUpdated = Date.now();
  }

  /**
   * Record a transmission outcome.
   * @param {boolean} delivered - true if the packet was ACKed
   */
  recordOutcome(delivered) {
    const sample = delivered ? 1 : 0;

    // EWMA update
    this._deliveryRatio = this.alpha * sample + (1 - this.alpha) * this._deliveryRatio;

    // Ring buffer
    this._samples.push(sample);
    if (this._samples.length > this._windowSize) {
      this._samples.shift();
    }

    this._totalSent++;
    if (delivered) this._totalDelivered++;
    this.lastUpdated = Date.now();
  }

  /**
   * Current ETX value.
   * Returns Infinity if delivery ratio is 0 (link is dead).
   * @returns {number}
   */
  get etx() {
    if (this._deliveryRatio <= 0) return Infinity;
    return 1 / this._deliveryRatio;
  }

  /** @returns {number} EWMA delivery ratio [0, 1] */
  get deliveryRatio() {
    return this._deliveryRatio;
  }

  /** @returns {{ etx, deliveryRatio, totalSent, totalDelivered, lastUpdated }} */
  snapshot() {
    return {
      etx: this.etx,
      deliveryRatio: this._deliveryRatio,
      totalSent: this._totalSent,
      totalDelivered: this._totalDelivered,
      lastUpdated: this.lastUpdated
    };
  }
}

// ─── Phase3MeshRouter ────────────────────────────────────────────────────────

/**
 * Phase3MeshRouter — extends Phase 2 MeshRouter with:
 *   - Per-link ETX tracking (Expected Transmission Count)
 *   - ETX-based egress peer selection (minimum-ETX next-hop)
 *   - ETX values in route advertisements
 *   - Bloom filter for O(1) probabilistic loop prevention
 *   - Persistent seen-set via IndexedDB (authoritative dedup)
 *
 * Usage:
 *   const router = new Phase3MeshRouter({
 *     localPeerId: myFp,
 *     bloomPersistFn: async (bf) => { await idb.put("bloom", bf.serialize()); },
 *     seenPersistFn:  async (key) => { await idb.put("seen", key, key); },
 *     seenLookupFn:   async (key) => { return await idb.get("seen", key) !== undefined; }
 *   });
 *
 *   // After each send, record outcome:
 *   router.recordLinkOutcome(peerId, delivered);
 *
 *   // Before sending, get minimum-ETX next hop:
 *   const nextHop = router.getMinEtxHop(destination);
 *
 *   // Get ETX-enriched route table for route advertisements:
 *   const adv = router.createEtxRouteAdv();
 */
export class Phase3MeshRouter extends MeshRouter {
  /**
   * @param {Object} [options] - All MeshRouter options, plus:
   * @param {Function} [options.bloomPersistFn]  - async (bloomFilter) → void; persist Bloom state
   * @param {Function} [options.seenPersistFn]   - async (key: string) → void; add key to IDB seen-set
   * @param {Function} [options.seenLookupFn]    - async (key: string) → boolean; IDB authoritative check
   * @param {number}   [options.etxAlpha]        - EWMA smoothing factor for ETX (default 0.25)
   */
  constructor(options = {}) {
    super({ ...options, enableRouting: true });

    /** Per-link ETX state: peerId → ETXLinkState */
    this._etxLinks = new Map();

    /** Bloom filter for fast duplicate detection */
    this._bloom = new BloomFilter();

    /** Persistence callbacks (injected by app layer; null = in-memory only) */
    this._bloomPersistFn = options.bloomPersistFn ?? null;
    this._seenPersistFn = options.seenPersistFn ?? null;
    this._seenLookupFn = options.seenLookupFn ?? null;

    this._etxAlpha = options.etxAlpha ?? 0.25;
  }

  // ─── ETX API ───────────────────────────────────────────────────────────────

  /**
   * Record the outcome of a transmission to a peer.
   * Updates the per-link ETX state and emits persistence if configured.
   *
   * @param {string} peerId
   * @param {boolean} delivered
   */
  recordLinkOutcome(peerId, delivered) {
    if (!this._etxLinks.has(peerId)) {
      this._etxLinks.set(peerId, new ETXLinkState({ alpha: this._etxAlpha }));
    }
    this._etxLinks.get(peerId).recordOutcome(delivered);
  }

  /**
   * Get the current ETX for a direct link to a peer.
   * @param {string} peerId
   * @returns {number} ETX value (1.0 = perfect, Infinity = dead link)
   */
  getLinkEtx(peerId) {
    const state = this._etxLinks.get(peerId);
    return state ? state.etx : 1.0; // assume perfect for new links
  }

  /**
   * Get the minimum-ETX next hop toward a destination.
   *
   * Computes cumulative ETX (link ETX + route ETX) for each candidate
   * next-hop and returns the one with the lowest total.
   *
   * @param {string} destination
   * @returns {string|null} peerId of best next hop, or null if unknown
   */
  getMinEtxHop(destination) {
    if (!destination) return null;

    // Direct neighbor
    if (this._neighbors.has(destination)) {
      return destination;
    }

    // Find all routes to destination and pick minimum cumulative ETX
    let bestHop = null;
    let bestEtx = Infinity;

    const entry = this._routes.get(destination);
    if (!entry || entry.expiresAt <= Date.now()) return null;

    // Cumulative ETX = route's advertised ETX + our direct link ETX to next-hop
    const advertisedEtx = typeof entry.etx === "number" ? entry.etx : 1.0 * entry.hops;
    const linkEtx = this.getLinkEtx(entry.via);
    const totalEtx = advertisedEtx + linkEtx;

    if (totalEtx < bestEtx) {
      bestEtx = totalEtx;
      bestHop = entry.via;
    }

    return bestHop;
  }

  /**
   * Get all link ETX snapshots (for operator panel visualization).
   * @returns {Array<{ peerId: string, etx: number, deliveryRatio: number, totalSent: number }>}
   */
  getLinkEtxTable() {
    const result = [];
    for (const [peerId, state] of this._etxLinks.entries()) {
      result.push({ peerId, ...state.snapshot() });
    }
    return result;
  }

  // ─── Route advertisement with ETX ─────────────────────────────────────────

  /**
   * Create an ETX-enriched route advertisement.
   * Extends the base createRouteAdv() with ETX values per route.
   *
   * @returns {Object} Route advertisement with `etx` fields
   */
  createEtxRouteAdv() {
    const adv = this.createRouteAdv();

    // Enrich each route entry with its ETX
    adv.routes = adv.routes.map((r) => ({
      ...r,
      etx: this.getLinkEtx(r.dst) * r.hops
    }));

    return adv;
  }

  /**
   * Process an incoming ETX-enriched route advertisement.
   * Extends base processRouteAdv() to store ETX in route table entries.
   *
   * @param {Object} adv
   * @param {string} ingressPeerId
   * @returns {boolean}
   */
  processEtxRouteAdv(adv, ingressPeerId) {
    const shouldForward = this.processRouteAdv(adv, ingressPeerId);

    if (shouldForward && Array.isArray(adv.routes)) {
      for (const r of adv.routes) {
        if (!r.dst || typeof r.etx !== "number") continue;
        const existing = this._routes.get(r.dst);
        if (existing && typeof r.etx === "number") {
          existing.etx = r.etx;
        }
      }
    }

    return shouldForward;
  }

  // ─── Bloom filter + IDB seen-set deduplication ────────────────────────────

  /**
   * Check and mark a transferId as seen, using Bloom filter + IDB.
   *
   * Flow:
   *   1. Bloom filter test: if definitely NOT seen → mark and return false (new)
   *   2. Bloom filter positive (possible duplicate) → IDB authoritative check
   *   3. IDB confirm: if seen → return true (duplicate)
   *   4. IDB miss: mark in both Bloom and IDB → return false (new)
   *
   * @param {string} transferId
   * @returns {Promise<boolean>} true if duplicate (should suppress), false if new
   */
  async checkAndMarkSeenPersistent(transferId) {
    if (!this._bloom.mightContain(transferId)) {
      // Definitely new — fast path
      this._bloom.add(transferId);
      await this._persistBloom();
      await this._persistSeenKey(transferId);
      return false;
    }

    // Possible duplicate — check IDB
    if (this._seenLookupFn) {
      const inIdb = await this._seenLookupFn(transferId);
      if (inIdb) return true; // confirmed duplicate
    }

    // Bloom false positive or IDB unavailable — treat as new
    this._bloom.add(transferId);
    await this._persistBloom();
    await this._persistSeenKey(transferId);
    return false;
  }

  /**
   * Override shouldForward to use the Bloom filter for fast pre-filtering.
   * Falls back to in-memory seen-set when persistence is not configured.
   *
   * @param {Object} message
   * @param {string} [ingressPeerId]
   * @returns {boolean}
   */
  shouldForward(message, ingressPeerId) {
    if (!message || typeof message !== "object") return false;

    const transferId =
      message.msgId ||
      `${message.kind || "msg"}:${message.ts || Date.now()}`;

    const relay = message.relay || { via: null, hops: 0, maxHops: this.defaultMaxHops };
    const hops = typeof relay.hops === "number" ? relay.hops : 0;
    const maxHops = typeof relay.maxHops === "number" ? relay.maxHops : this.defaultMaxHops;

    if (hops >= maxHops) return false;

    // Bloom filter fast check (synchronous)
    if (this._bloom.mightContain(transferId)) {
      // Possible dup — fall back to in-memory seen-set
      if (this._seen.has(transferId)) return false;
    }

    if (this._seen.size >= this.seenMapMaxSize) this.cleanup();

    this._seen.set(transferId, Date.now());
    this._bloom.add(transferId);

    // Persist asynchronously (fire-and-forget; errors are non-fatal)
    this._persistBloom().catch(() => {});
    this._persistSeenKey(transferId).catch(() => {});

    message.relay = { via: this.localPeerId, hops: hops + 1, maxHops };
    return true;
  }

  async _persistBloom() {
    if (this._bloomPersistFn) {
      try { await this._bloomPersistFn(this._bloom); } catch { /* ignore */ }
    }
  }

  async _persistSeenKey(key) {
    if (this._seenPersistFn) {
      try { await this._seenPersistFn(key); } catch { /* ignore */ }
    }
  }

  /**
   * Load persisted Bloom filter state from IndexedDB on startup.
   * @param {{ m: number, k: number, bits: string, count: number }} serialized
   */
  loadBloomState(serialized) {
    if (serialized) {
      this._bloom = BloomFilter.deserialize(serialized);
    }
  }

  reset() {
    super.reset();
    this._bloom.clear();
    this._etxLinks.clear();
  }
}

