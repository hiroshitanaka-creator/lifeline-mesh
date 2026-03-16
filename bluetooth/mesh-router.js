/**
 * Lifeline Mesh - Mesh Router (Phase 2: N-Hop Relay with Route Advertisements)
 *
 * Implements message relay and route discovery for the Lifeline Mesh BLE network.
 *
 * Phase 1 scope (preserved):
 *   - Deduplication by transferId (msgId or derived fallback).
 *   - Hop budget enforcement: relay.hops < relay.maxHops.
 *   - Automatic cleanup of stale seen-message entries.
 *
 * Phase 2 additions (implemented here):
 *   - RouteTable: tracks known destinations with hop distance and freshness.
 *   - Route advertisements (kind: 'dmesh-route'): nodes broadcast their
 *     connectivity so remote peers can build multi-hop routes.
 *   - processRouteAdvert(): ingest an incoming advertisement and update table.
 *   - createRouteAdvert(): generate an advertisement from the current table.
 *   - selectOutboundPeers(): route-aware peer selection — prefer the best-route
 *     peer for known recipients; flood to all peers (except ingress) for unknowns.
 *   - Loop prevention: seen-map deduplication + route-table guided unicast
 *     avoids redundant floods when a specific route is known.
 *
 * Integration checklist (Phase 2):
 *   1. On peer connect/disconnect, call createRouteAdvert() and broadcast to all peers.
 *   2. On receipt of a 'dmesh-route' message, call processRouteAdvert().
 *   3. On receipt of a regular message, call shouldForward() as before.
 *   4. Replace "all peers except ingress" with selectOutboundPeers() for smarter routing.
 */

export const ROUTER_DEFAULTS = {
  /** Maximum hops when no relay metadata is present in an inbound message. */
  DEFAULT_MAX_HOPS: 3,

  /** How long (ms) to remember a seen transferId before evicting it. */
  SEEN_TTL_MS: 60 * 1000,

  /** Max entries in the seen-message map before forced cleanup. */
  SEEN_MAP_MAX_SIZE: 2000,

  /** How long (ms) a route entry stays valid before being considered stale. */
  ROUTE_TTL_MS: 120 * 1000,

  /** Maximum hop distance included when creating route advertisements. */
  ROUTE_ADVERT_MAX_HOPS: 5
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

// ---------------------------------------------------------------------------
// RouteTable
// ---------------------------------------------------------------------------

/**
 * RouteTable — Phase 2 route storage.
 *
 * Stores the best known path to each destination peer. A "best" route is the
 * one with the fewest hops; when hop counts are equal, the freshest entry wins.
 *
 * Entries expire after routeTtlMs to account for topology changes.
 *
 * @example
 *   const table = new RouteTable();
 *   table.update("peerC", "peerB", 2);
 *   const route = table.getBestRoute("peerC"); // { via: "peerB", hops: 2 }
 */
export class RouteTable {
  /**
   * @param {Object} [options]
   * @param {number} [options.routeTtlMs] - How long (ms) a route entry stays valid.
   */
  constructor(options = {}) {
    this.routeTtlMs = options.routeTtlMs ?? ROUTER_DEFAULTS.ROUTE_TTL_MS;

    /**
     * Map from destination peerId → { via, hops, seenAt }.
     * @type {Map<string, { via: string, hops: number, seenAt: number }>}
     */
    this._routes = new Map();
  }

  /**
   * Add or update a route to `destination`.
   *
   * The entry is updated only if:
   *   - No existing entry exists, OR
   *   - The new route has fewer hops, OR
   *   - Same hop count but the new information is fresher.
   *
   * @param {string} destination - Peer ID of the target node.
   * @param {string} via - Next-hop peer ID to reach `destination`.
   * @param {number} hops - Total hop distance to `destination`.
   * @param {number} [now] - Current timestamp (injectable for tests).
   * @returns {boolean} true if the table was changed.
   */
  update(destination, via, hops, now = Date.now()) {
    if (!destination || !via || typeof hops !== "number") return false;

    const existing = this._routes.get(destination);

    const isBetter = !existing ||
      hops < existing.hops ||
      (hops === existing.hops && now > existing.seenAt);

    if (isBetter) {
      this._routes.set(destination, { via, hops, seenAt: now });
      return true;
    }

    return false;
  }

  /**
   * Return the best known route to `destination`, or null if unknown / expired.
   *
   * @param {string} destination
   * @param {number} [now] - Current timestamp (injectable for tests).
   * @returns {{ via: string, hops: number } | null}
   */
  getBestRoute(destination, now = Date.now()) {
    const entry = this._routes.get(destination);
    if (!entry) return null;

    if (now - entry.seenAt > this.routeTtlMs) {
      this._routes.delete(destination);
      return null;
    }

    return { via: entry.via, hops: entry.hops };
  }

  /**
   * Return all non-expired routes as an array.
   *
   * @param {number} [now]
   * @returns {Array<{ destination: string, via: string, hops: number }>}
   */
  getAll(now = Date.now()) {
    const result = [];
    for (const [dst, entry] of this._routes.entries()) {
      if (now - entry.seenAt <= this.routeTtlMs) {
        result.push({ destination: dst, via: entry.via, hops: entry.hops });
      }
    }
    return result;
  }

  /**
   * Remove expired route entries.
   *
   * @param {number} [now]
   */
  cleanup(now = Date.now()) {
    for (const [dst, entry] of this._routes.entries()) {
      if (now - entry.seenAt > this.routeTtlMs) {
        this._routes.delete(dst);
      }
    }
  }

  /**
   * Return the number of entries currently in the route table (including expired).
   */
  get size() {
    return this._routes.size;
  }

  /** Remove all entries. */
  reset() {
    this._routes.clear();
  }
}

// ---------------------------------------------------------------------------
// MeshRouter
// ---------------------------------------------------------------------------

/**
 * MeshRouter — Phase 2: N-hop relay with route advertisements.
 *
 * Usage (Phase 1, preserved):
 *   const router = new MeshRouter({ localPeerId: myFingerprint });
 *   const shouldRelay = router.shouldForward(message, ingressPeerId);
 *   if (shouldRelay) {
 *     const peers = router.selectOutboundPeers(connectedPeers, ingressPeerId, message);
 *     for (const peerId of peers) ble.sendMessage(message, peerId);
 *   }
 *
 * Usage (Phase 2 additions):
 *   // On new peer connection — broadcast route info:
 *   const advert = router.createRouteAdvert();
 *   for (const peerId of connectedPeers) ble.sendMessage(advert, peerId);
 *
 *   // On receipt of 'dmesh-route' message:
 *   router.processRouteAdvert(advert, ingressPeerId);
 */
export class MeshRouter {
  /**
   * @param {Object} [options]
   * @param {string} [options.localPeerId] - Local node's fingerprint / peer ID.
   * @param {number} [options.defaultMaxHops] - Hop limit for messages without relay metadata.
   * @param {number} [options.seenTtlMs] - How long to remember a seen transfer ID.
   * @param {number} [options.seenMapMaxSize] - Max seen-map entries before forced cleanup.
   * @param {number} [options.routeTtlMs] - How long route entries stay valid.
   * @param {number} [options.routeAdvertMaxHops] - Max hops included in route adverts.
   */
  constructor(options = {}) {
    this.localPeerId = options.localPeerId || "unknown";
    this.defaultMaxHops = options.defaultMaxHops ?? ROUTER_DEFAULTS.DEFAULT_MAX_HOPS;
    this.seenTtlMs = options.seenTtlMs ?? ROUTER_DEFAULTS.SEEN_TTL_MS;
    this.seenMapMaxSize = options.seenMapMaxSize ?? ROUTER_DEFAULTS.SEEN_MAP_MAX_SIZE;
    this.routeAdvertMaxHops = options.routeAdvertMaxHops ?? ROUTER_DEFAULTS.ROUTE_ADVERT_MAX_HOPS;

    /**
     * Map from transferId → timestamp of first sight.
     * @type {Map<string, number>}
     */
    this._seen = new Map();

    /**
     * Phase 2: route table for N-hop routing.
     * @type {RouteTable}
     */
    this.routeTable = new RouteTable({ routeTtlMs: options.routeTtlMs ?? ROUTER_DEFAULTS.ROUTE_TTL_MS });
  }

  // ---------------------------------------------------------------------------
  // Phase 1: flood-based relay (preserved)
  // ---------------------------------------------------------------------------

  /**
   * Decide whether to forward a received message, and if so mutate the relay
   * metadata in place so downstream peers see the updated hop count.
   *
   * Deduplication and hop-budget enforcement are still done here (Phase 1 logic).
   * For smarter peer selection, use selectOutboundPeers() after this returns true.
   *
   * @param {Object} message - Parsed message object (will be mutated if forwarded).
   * @param {string} [ingressPeerId] - Peer ID the message arrived from.
   * @returns {boolean} true if the message should be relayed to other peers.
   */
  shouldForward(message, ingressPeerId) {
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

    // Phase 2: update route table from ingress peer (direct neighbour, hops=1).
    if (ingressPeerId && ingressPeerId !== this.localPeerId) {
      this.routeTable.update(ingressPeerId, ingressPeerId, 1);
    }

    // Stamp relay metadata so the next hop knows how far the message has traveled.
    message.relay = {
      via: this.localPeerId,
      hops: hops + 1,
      maxHops
    };

    return true;
  }

  // ---------------------------------------------------------------------------
  // Phase 2: route advertisements
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming route advertisement and update the local route table.
   *
   * Each route entry in the advertisement is credited with one additional hop
   * (because we heard it via `ingressPeerId`). Entries that exceed
   * routeAdvertMaxHops are ignored to bound the horizon.
   *
   * @param {Object} advert - A 'dmesh-route' message object.
   * @param {string} ingressPeerId - Peer we received the advertisement from.
   * @param {number} [now] - Injectable timestamp for tests.
   */
  processRouteAdvert(advert, ingressPeerId, now = Date.now()) {
    if (!advert || advert.kind !== "dmesh-route") return;
    if (!ingressPeerId || ingressPeerId === this.localPeerId) return;

    // The ingress peer itself is 1 hop away.
    this.routeTable.update(ingressPeerId, ingressPeerId, 1, now);

    const routes = Array.isArray(advert.routes) ? advert.routes : [];
    for (const entry of routes) {
      const { dst, hops } = entry || {};
      if (!dst || typeof hops !== "number") continue;
      if (dst === this.localPeerId) continue; // skip self-entries

      const remoteHops = hops + 1; // one extra hop through ingressPeer
      if (remoteHops > this.routeAdvertMaxHops) continue;

      this.routeTable.update(dst, ingressPeerId, remoteHops, now);
    }
  }

  /**
   * Create a route advertisement message to broadcast to all connected peers.
   *
   * The advertisement lists all known destinations (from the local route table)
   * with hop counts <= routeAdvertMaxHops - 1 (so that after re-advertisement
   * by a neighbour the total stays within bounds).
   *
   * @param {number} [now] - Injectable timestamp for tests.
   * @returns {Object} A 'dmesh-route' message ready to send.
   */
  createRouteAdvert(now = Date.now()) {
    const routes = this.routeTable.getAll(now)
      .filter(r => r.hops < this.routeAdvertMaxHops)
      .map(r => ({ dst: r.destination, hops: r.hops }));

    // Always include self at hops=0 so neighbours can reach us.
    routes.unshift({ dst: this.localPeerId, hops: 0 });

    return {
      kind: "dmesh-route",
      from: this.localPeerId,
      ts: now,
      routes,
      relay: { via: this.localPeerId, hops: 0, maxHops: this.routeAdvertMaxHops }
    };
  }

  /**
   * Select which connected peers to relay a message to.
   *
   * Strategy:
   *   1. If the message has a known `rcpt` (recipient fingerprint) and the route
   *      table has a best route for it, return only the next-hop peer for that
   *      route (unicast). This minimises unnecessary floods.
   *   2. Otherwise fall back to flooding: return all connected peers except the
   *      ingress peer (Phase 1 behaviour).
   *
   * The ingress peer is always excluded to prevent trivial loops.
   *
   * @param {string[]} connectedPeers - Array of currently connected peer IDs.
   * @param {string|null} ingressPeerId - Peer we received the message from (excluded).
   * @param {Object} message - The message being forwarded.
   * @param {number} [now] - Injectable timestamp for tests.
   * @returns {string[]} Peer IDs to relay to.
   */
  selectOutboundPeers(connectedPeers, ingressPeerId, message, now = Date.now()) {
    const peers = Array.isArray(connectedPeers) ? connectedPeers : [];
    const exclude = new Set([ingressPeerId, this.localPeerId].filter(Boolean));

    const candidates = peers.filter(p => !exclude.has(p));

    if (!candidates.length) return [];

    // Attempt unicast if recipient is known.
    const rcpt = message && message.rcpt;
    if (rcpt && rcpt !== this.localPeerId) {
      const route = this.routeTable.getBestRoute(rcpt, now);
      if (route && candidates.includes(route.via)) {
        return [route.via];
      }
    }

    // Fallback: flood to all candidates.
    return candidates;
  }

  // ---------------------------------------------------------------------------
  // Maintenance
  // ---------------------------------------------------------------------------

  /**
   * Evict seen-map entries older than seenTtlMs, and expired route entries.
   *
   * @param {number} [now] - Current timestamp (injectable for tests).
   */
  cleanup(now = Date.now()) {
    for (const [id, ts] of this._seen.entries()) {
      if (now - ts > this.seenTtlMs) {
        this._seen.delete(id);
      }
    }
    this.routeTable.cleanup(now);
  }

  /**
   * Returns the number of entries currently in the seen-message map.
   * @returns {number}
   */
  get seenCount() {
    return this._seen.size;
  }

  /**
   * Returns true if the given transferId has already been seen.
   * @param {string} transferId
   * @returns {boolean}
   */
  hasSeen(transferId) {
    return this._seen.has(transferId);
  }

  /**
   * Reset all router state (seen-message map and route table).
   * Useful between test cases.
   */
  reset() {
    this._seen.clear();
    this.routeTable.reset();
  }
}

export default MeshRouter;
