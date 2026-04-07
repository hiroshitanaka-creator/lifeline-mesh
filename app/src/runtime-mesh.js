/**
 * Lifeline Mesh - App-level Mesh Runtime
 *
 * Wraps MeshRouter (Phase 1 + Phase 2) with multi-link state management.
 *
 * Multi-link model
 * ─────────────────
 * The runtime maintains a Map<peerId, {manager}> of active BLE links.
 * When a message arrives on one link (ingress) and the router decides it
 * should be forwarded, the runtime sends it out on every OTHER link (egress).
 * This enables N-hop store-and-forward relay across simultaneous connections.
 *
 * Route advertisements (Phase 2)
 * ────────────────────────────────
 * When enableRouting is true (automatically set when ≥2 links are active),
 * the runtime periodically calls router.createRouteAdv() and broadcasts the
 * resulting ROUTE_ADV message to all connected peers.
 * Incoming ROUTE_ADV messages are processed via router.processRouteAdv() and
 * re-broadcast when the router decides they should be forwarded.
 *
 * Usage
 * ─────
 *   const runtime = createMeshRuntime("myFingerprint");
 *
 *   // Single-link (Phase 1 compatible):
 *   runtime.onConnectionChange(true, device);
 *   runtime.onConnectionChange(false, device);
 *
 *   // Multi-link: register BLE manager instances per link
 *   runtime.addLink("peer-a", bleManagerA);
 *   runtime.removeLink("peer-a");
 *
 *   // Forward callback (called by BLEManager):
 *   bleManager.onForward = (msg, ingressPeerId) =>
 *     runtime.onForward({ message: msg, ingressPeerId });
 *
 *   // Snapshot for UI:
 *   runtime.getSnapshot();
 */

import { MeshRouter, ROUTE_ADV_KIND } from "../../bluetooth/mesh-router.js";

/** Interval between proactive route advertisement broadcasts (ms). */
const ROUTE_ADV_INTERVAL_MS = 30_000;

/**
 * Create a new mesh runtime instance.
 *
 * @param {string} [localPeerId] - Local node fingerprint / peer ID.
 * @returns {object} Runtime API object.
 */
export function createMeshRuntime(localPeerId = "unknown") {
  const router = new MeshRouter({
    localPeerId,
    defaultMaxHops: 1,
    enableRouting: false  // Enabled automatically when ≥2 links are active
  });

  const state = {
    localPeerId,
    // Legacy single-link field — kept for backward compatibility.
    // Equals the most recently added link's peerId, or null when no links.
    connectedPeerId: null,
    relayAttempts: 0,
    relayedCount: 0,
    skipped: 0,
    lastRelay: null,
    routeAdvBroadcasts: 0
  };

  /**
   * Active BLE links: peerId → { manager } where manager is a BLEManager
   * instance (or any object with a compatible sendMessage(msg) API).
   * @type {Map<string, {manager: object}>}
   */
  const links = new Map();

  /** Timer handle for periodic route advertisement. */
  let routeAdvTimer = null;

  // ─── Internal helpers ─────────────────────────────────────────────────────

  function sync() {
    state.localPeerId = router.localPeerId;
  }

  /**
   * Enable/disable Phase 2 routing and the route-adv broadcast loop based on
   * the current number of active links.
   */
  function _reconcileRoutingMode() {
    const multiLink = links.size >= 2;

    if (multiLink && !router.enableRouting) {
      router.enableRouting = true;
    }
    // Keep routing enabled once activated even if a link drops below 2
    // (route table knowledge remains valid for surviving links).

    if (multiLink && !routeAdvTimer) {
      _startRouteAdvLoop();
    } else if (!multiLink && routeAdvTimer) {
      _stopRouteAdvLoop();
    }
  }

  function _startRouteAdvLoop() {
    if (routeAdvTimer) return;
    routeAdvTimer = globalThis.setInterval(() => {
      _broadcastRouteAdv();
    }, ROUTE_ADV_INTERVAL_MS);
  }

  function _stopRouteAdvLoop() {
    if (!routeAdvTimer) return;
    globalThis.clearInterval(routeAdvTimer);
    routeAdvTimer = null;
  }

  /**
   * Create a route advertisement and send it to all connected links.
   */
  async function _broadcastRouteAdv() {
    if (links.size === 0) return;
    router.cleanup();
    const adv = router.createRouteAdv();
    state.routeAdvBroadcasts += 1;
    for (const { manager } of links.values()) {
      try {
        await manager.sendMessage(adv);
      } catch (err) {
        console.warn("[MeshRuntime] Route adv broadcast failed on link:", err instanceof Error ? err.message : String(err));
      }
    }
  }

  /**
   * Forward a message to all egress links (all links except the ingress link).
   *
   * @param {object} message
   * @param {string} ingressPeerId
   * @returns {Promise<{action:string, forwardedTo:string[], skippedLinks:string[]}>}
   */
  async function _forwardToEgressLinks(message, ingressPeerId) {
    const forwardedTo = [];
    const skippedLinks = [];

    for (const [peerId, { manager }] of links.entries()) {
      if (peerId === ingressPeerId) {
        skippedLinks.push(peerId);
        continue;
      }
      try {
        await manager.sendMessage(message, { linkId: peerId });
        forwardedTo.push(peerId);
      } catch (err) {
        console.warn(`[MeshRuntime] Forward to ${peerId} failed:`, err instanceof Error ? err.message : String(err));
        skippedLinks.push(peerId);
      }
    }

    return { action: "forwarded", forwardedTo, skippedLinks };
  }

  async function _forwardToSpecificLink(message, peerId) {
    const link = links.get(peerId);
    if (!link) {
      return { action: "skipped", forwardedTo: [], skippedLinks: [peerId], reason: "missing-next-hop-link" };
    }
    try {
      await link.manager.sendMessage(message, { linkId: peerId });
      return { action: "forwarded", forwardedTo: [peerId], skippedLinks: [] };
    } catch (err) {
      console.warn(`[MeshRuntime] Forward to preferred next-hop ${peerId} failed:`, err instanceof Error ? err.message : String(err));
      return { action: "skipped", forwardedTo: [], skippedLinks: [peerId], reason: "next-hop-send-failed" };
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    router,
    state,

    setLocalPeerId(peerId) {
      router.localPeerId = peerId || "unknown";
      sync();
    },

    /**
     * Register a BLE link. The manager must implement sendMessage(msg).
     * This is the preferred API for multi-link topologies.
     *
     * @param {string} peerId
     * @param {object} manager - BLEManager instance or compatible object.
     */
    addLink(peerId, manager) {
      if (!peerId || !manager) return;
      links.set(peerId, { manager });
      router.addNeighbor(peerId);
      state.connectedPeerId = peerId;
      _reconcileRoutingMode();
    },

    /**
     * Unregister a BLE link on disconnect.
     * @param {string} peerId
     */
    removeLink(peerId) {
      if (!links.has(peerId)) return;
      links.delete(peerId);
      router.removeNeighbor(peerId);
      if (state.connectedPeerId === peerId) {
        // Update connectedPeerId to another link, or null
        const remaining = links.keys().next();
        state.connectedPeerId = remaining.done ? null : remaining.value;
      }
      _reconcileRoutingMode();
    },

    /**
     * Legacy single-link connection change handler.
     * Calls addLink/removeLink internally.
     * Kept for backward compatibility with existing BLEManager wiring.
     *
     * @param {boolean} connected
     * @param {object}  [device]
     */
    onConnectionChange(connected, device) {
      const peerId = device?.id || null;
      if (connected && peerId) {
        this.addLink(peerId, device._bleManager ?? { sendMessage: () => Promise.resolve() });
      } else if (!connected && peerId) {
        this.removeLink(peerId);
      } else if (!connected) {
        // Fallback: no device ID — clear connectedPeerId directly
        if (state.connectedPeerId) {
          this.removeLink(state.connectedPeerId);
        }
      }
    },

    /**
     * Called by BLEManager when a fully reassembled, deduplicated message
     * arrives and the router decides it should be forwarded.
     *
     * Handles two message kinds:
     *   • ROUTE_ADV — processed by the router; re-broadcast if novel.
     *   • Data messages — forwarded to all egress links.
     *
     * @param {{message: object, ingressPeerId: string}} param
     * @returns {Promise<object>} Relay result descriptor.
     */
    async onForward({ message, ingressPeerId }) {
      router.cleanup();
      state.relayAttempts += 1;

      // ── Route advertisement handling ─────────────────────────────────────
      if (message?.kind === ROUTE_ADV_KIND) {
        const shouldRebroadcast = router.processRouteAdv(message, ingressPeerId);
        const result = {
          action: shouldRebroadcast ? "rebroadcast-route-adv" : "dropped-route-adv",
          ingressPeerId,
          msgId: null,
          at: Date.now()
        };

        if (shouldRebroadcast && links.size > 1) {
          const { forwardedTo } = await _forwardToEgressLinks(message, ingressPeerId);
          result.forwardedTo = forwardedTo;
          state.relayedCount += forwardedTo.length > 0 ? 1 : 0;
        } else {
          state.skipped += 1;
        }

        state.lastRelay = result;
        return result;
      }

      // ── Data message forwarding ──────────────────────────────────────────
      if (links.size === 0) {
        const result = {
          action: "skipped",
          reason: "no-connected-peer",
          ingressPeerId,
          msgId: message?.msgId ?? null,
          at: Date.now()
        };
        state.skipped += 1;
        state.lastRelay = result;
        return result;
      }

      if (links.size === 1) {
        // Only one link: it must be the ingress — nowhere to forward.
        const result = {
          action: "skipped",
          reason: "ingress-only-link",
          ingressPeerId,
          msgId: message?.msgId ?? null,
          at: Date.now()
        };
        state.skipped += 1;
        state.lastRelay = result;
        return result;
      }

      const destination = message?.rcpt || null;
      const nextHop = destination ? router.getNextHop(destination) : null;
      let action = "forwarded";
      let forwardedTo = [];
      let skippedLinks = [];
      let routing = nextHop ? "known-route" : "unknown-route-fallback";

      if (nextHop && nextHop !== ingressPeerId) {
        const preferred = await _forwardToSpecificLink(message, nextHop);
        forwardedTo = preferred.forwardedTo;
        skippedLinks = preferred.skippedLinks;

        if (forwardedTo.length === 0) {
          // Route can be stale in dynamic mesh; preserve delivery with egress flood fallback.
          const fallback = await _forwardToEgressLinks(message, ingressPeerId);
          forwardedTo = fallback.forwardedTo;
          skippedLinks = Array.from(new Set([...skippedLinks, ...fallback.skippedLinks]));
          routing = "known-route-fallback-flood";
        } else {
          routing = "known-route";
        }
      } else {
        // Unknown destination (or stale route pointing back to ingress): flood fallback.
        const fallback = await _forwardToEgressLinks(message, ingressPeerId);
        action = fallback.action;
        forwardedTo = fallback.forwardedTo;
        skippedLinks = fallback.skippedLinks;
        if (nextHop && nextHop === ingressPeerId) {
          routing = "stale-route-fallback-flood";
        }
      }

      const result = {
        action,
        forwardedTo,
        skippedLinks,
        routing,
        nextHop,
        destination,
        ingressPeerId,
        msgId: message?.msgId ?? null,
        at: Date.now()
      };

      if (forwardedTo.length > 0) {
        state.relayedCount += 1;
      } else {
        state.skipped += 1;
      }

      state.lastRelay = result;
      return result;
    },

    /**
     * Broadcast a route advertisement immediately (useful on first connect).
     * No-op if fewer than 2 links are active.
     */
    broadcastRouteAdv() {
      return _broadcastRouteAdv();
    },

    /**
     * Get a complete snapshot of runtime state for the UI.
     * @returns {object}
     */
    getSnapshot() {
      return {
        localPeerId: state.localPeerId,
        // Legacy single-link field
        connectedPeerId: state.connectedPeerId,
        // Multi-link fields
        linkCount: links.size,
        links: Array.from(links.keys()),
        relayAttempts: state.relayAttempts,
        relayedCount: state.relayedCount,
        skipped: state.skipped,
        lastRelay: state.lastRelay,
        routeAdvBroadcasts: state.routeAdvBroadcasts,
        // Router state
        seenMessages: router.seenCount,
        neighborCount: router.neighbors.size,
        routeTable: router.getRouteTable(),
        routingEnabled: router.enableRouting
      };
    },

    /** Stop all background timers (call on teardown). */
    destroy() {
      _stopRouteAdvLoop();
      links.clear();
      router.reset();
      state.connectedPeerId = null;
    }
  };
}
