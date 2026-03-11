/**
 * Lifeline Mesh - BLE Mesh Router
 *
 * Implements a simple epidemic/store-and-forward routing layer on top of
 * the BLE Manager. Each node maintains a routing table and a message cache
 * to forward messages toward their destination and suppress duplicates.
 *
 * Routing Strategy:
 * - Direct delivery: if the destination is a connected peer, deliver directly
 * - Epidemic forwarding: otherwise broadcast to all connected peers with TTL
 * - Duplicate suppression: message cache prevents loops
 *
 * The router does NOT perform decryption. All routing decisions are made
 * on the encrypted envelope alone (using the recipientBoxPK field to match
 * intended recipients). This preserves end-to-end confidentiality.
 *
 * @module bluetooth/mesh-router
 */

import { MSG_TYPE } from "./constants.js";

// ============================================================================
// Constants
// ============================================================================

/** Default TTL for routed messages (hop count) */
const DEFAULT_TTL = 5;

/** Time to keep message IDs in the seen cache (30 minutes) */
const CACHE_DURATION_MS = 30 * 60 * 1000;

/** Time before a routing table entry expires (5 minutes) */
const ROUTE_EXPIRY_MS = 5 * 60 * 1000;

/** Maximum entries in the seen-message cache */
const MAX_CACHE_SIZE = 10000;

// ============================================================================
// MeshRouter
// ============================================================================

/**
 * Multi-hop BLE mesh router
 *
 * Usage:
 *   const router = new MeshRouter(bleManager, myBoxPK);
 *   router.onMessageForMe = (message) => handleIncomingMessage(message);
 *   router.start();
 *   router.routeMessage(encryptedMsg);   // send or forward
 */
export class MeshRouter {
  /**
   * @param {import('./ble-manager.js').BLEManager} bleManager - BLE manager instance
   * @param {Uint8Array} myBoxPK - This node's Curve25519 box public key (for recipient matching)
   * @param {string} myBoxPKB64 - Base64 encoding of myBoxPK
   */
  constructor(bleManager, myBoxPK, myBoxPKB64) {
    this._ble = bleManager;
    this._myBoxPK = myBoxPK;
    this._myBoxPKB64 = myBoxPKB64;

    /**
     * Routing table: recipientBoxPK (base64) → { peerId, lastSeen, hopCount }
     * @type {Map<string, {peerId: string, lastSeen: number, hopCount: number}>}
     */
    this.routingTable = new Map();

    /**
     * Seen-message cache: msgId (string) → { ts: number, delivered: boolean }
     * Prevents forwarding loops and duplicate delivery.
     * @type {Map<string, {ts: number, delivered: boolean}>}
     */
    this.seenMessages = new Map();

    /**
     * Connected peers: peerId (string) → { boxPKB64: string, connectedAt: number }
     * @type {Map<string, {boxPKB64: string, connectedAt: number}>}
     */
    this.peers = new Map();

    // Callbacks
    /** Called when a message addressed to this node is received */
    this.onMessageForMe = null;
    /** Called when a message is forwarded to another peer */
    this.onMessageForwarded = null;
    /** Called when a discovery/identity packet arrives */
    this.onPeerDiscovered = null;

    this._cleanupTimer = null;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the router: wire up BLE callbacks and start periodic cache cleanup
   */
  start() {
    this._ble.onMessageReceived = (message, msgType) => {
      this._handleReceived(message, msgType);
    };

    this._ble.onConnectionChange = (connected, device) => {
      if (connected) {
        this._handlePeerConnected(device);
      } else {
        this._handlePeerDisconnected(device);
      }
    };

    // Periodic cleanup every 5 minutes
    this._cleanupTimer = setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Stop the router and clean up
   */
  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._ble.onMessageReceived = null;
    this._ble.onConnectionChange = null;
  }

  // ============================================================================
  // Routing
  // ============================================================================

  /**
   * Route a message: deliver directly if we are the recipient, otherwise forward.
   *
   * @param {object} message - Lifeline Mesh encrypted message (must have msgId and recipientBoxPK)
   * @param {number} [ttl=DEFAULT_TTL] - Remaining hop count
   * @returns {Promise<void>}
   */
  async routeMessage(message, ttl = DEFAULT_TTL) {
    const msgId = this._getMsgId(message);

    // Duplicate suppression
    if (this.seenMessages.has(msgId)) {
      return;
    }
    this._markSeen(msgId, false);

    // Enforce cache size limit
    if (this.seenMessages.size > MAX_CACHE_SIZE) {
      this._evictOldestSeen();
    }

    // Am I the intended recipient?
    if (this._isForMe(message)) {
      this._markSeen(msgId, true);
      if (this.onMessageForMe) {
        this.onMessageForMe(message);
      }
      return;
    }

    // TTL check
    if (ttl <= 0) {
      return;
    }

    // Attach routing metadata and forward
    const routable = { ...message, _ttl: ttl - 1 };

    // Try direct delivery to known route
    const recipientKey = message.recipientBoxPK;
    if (recipientKey && this.routingTable.has(recipientKey)) {
      const route = this.routingTable.get(recipientKey);
      if (Date.now() - route.lastSeen < ROUTE_EXPIRY_MS) {
        await this._forwardToPeer(routable, route.peerId);
        return;
      }
      // Route expired — fall through to epidemic
      this.routingTable.delete(recipientKey);
    }

    // Epidemic forwarding: send to all connected peers
    await this._broadcast(routable);
  }

  // ============================================================================
  // Peer & Route Management
  // ============================================================================

  /**
   * Register a peer's public key binding when they exchange identities
   *
   * @param {string} peerId - Peer device ID
   * @param {string} boxPKB64 - Peer's box public key (base64)
   * @param {number} [hopCount=0] - 0 if directly connected
   */
  registerPeer(peerId, boxPKB64, hopCount = 0) {
    this.peers.set(peerId, { boxPKB64, connectedAt: Date.now() });
    this._updateRoute(boxPKB64, peerId, hopCount);
  }

  /**
   * Update routing table entry
   *
   * @param {string} recipientBoxPKB64 - Destination's box public key (base64)
   * @param {string} nextHopPeerId - Next hop peer ID
   * @param {number} hopCount - Distance to destination
   */
  _updateRoute(recipientBoxPKB64, nextHopPeerId, hopCount) {
    const existing = this.routingTable.get(recipientBoxPKB64);
    if (!existing || hopCount < existing.hopCount || Date.now() - existing.lastSeen > ROUTE_EXPIRY_MS) {
      this.routingTable.set(recipientBoxPKB64, {
        peerId: nextHopPeerId,
        lastSeen: Date.now(),
        hopCount
      });
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle a message/packet received from the BLE layer
   * @private
   */
  async _handleReceived(message, msgType) {
    if (msgType === MSG_TYPE.IDENTITY || msgType === MSG_TYPE.DISCOVERY) {
      // Identity exchange: learn the peer's public key and update routing table
      if (message && message.boxPK && message._peerId) {
        this.registerPeer(message._peerId, message.boxPK, 0);
        // Also learn about their known peers (if they forwarded routing info)
        if (message._routes) {
          for (const [key, hopCount] of Object.entries(message._routes)) {
            this._updateRoute(key, message._peerId, hopCount + 1);
          }
        }
        if (this.onPeerDiscovered) {
          this.onPeerDiscovered(message);
        }
      }
      return;
    }

    // Regular message (DIRECT or BROADCAST) — route it
    const ttl = (message._ttl !== undefined) ? message._ttl : DEFAULT_TTL;
    await this.routeMessage(message, ttl);
  }

  /**
   * @private
   */
  _handlePeerConnected(device) {
    if (device) {
      const peerId = device.id || device.name || String(device);
      if (!this.peers.has(peerId)) {
        this.peers.set(peerId, { boxPKB64: null, connectedAt: Date.now() });
      }
    }
  }

  /**
   * @private
   */
  _handlePeerDisconnected(device) {
    if (device) {
      const peerId = device.id || device.name || String(device);
      this.peers.delete(peerId);
      // Remove routes that relied on this peer
      for (const [key, route] of this.routingTable) {
        if (route.peerId === peerId) {
          this.routingTable.delete(key);
        }
      }
    }
  }

  // ============================================================================
  // Forwarding Helpers
  // ============================================================================

  /**
   * Forward a message to a specific connected peer
   * @private
   */
  async _forwardToPeer(message, _peerId) {
    try {
      await this._ble.sendMessage(message);
      if (this.onMessageForwarded) {
        this.onMessageForwarded(message, _peerId);
      }
    } catch (err) {
      console.error("[MeshRouter] Forward failed:", err);
    }
  }

  /**
   * Broadcast a message to all connected peers (epidemic forwarding)
   * @private
   */
  async _broadcast(message) {
    try {
      await this._ble.sendMessage(message);
      if (this.onMessageForwarded) {
        this.onMessageForwarded(message, "broadcast");
      }
    } catch (err) {
      console.error("[MeshRouter] Broadcast failed:", err);
    }
  }

  // ============================================================================
  // Recipient Matching
  // ============================================================================

  /**
   * Check if this message is addressed to this node
   * @private
   */
  _isForMe(message) {
    if (!message.recipientBoxPK) return false;
    return message.recipientBoxPK === this._myBoxPKB64;
  }

  // ============================================================================
  // Message ID Extraction
  // ============================================================================

  /**
   * Get a stable ID for deduplication
   * Uses message.msgId if present, otherwise falls back to nonce.
   * @private
   */
  _getMsgId(message) {
    if (message.msgId) return message.msgId;
    if (message.nonce) return message.nonce;
    // Last resort: stringify a few stable fields
    return `${message.ts}:${message.senderSignPK}:${message.recipientBoxPK}`;
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Mark a message as seen in the cache
   * @private
   */
  _markSeen(msgId, delivered) {
    this.seenMessages.set(msgId, { ts: Date.now(), delivered });
  }

  /**
   * Remove the oldest entry from the seen-message cache
   * @private
   */
  _evictOldestSeen() {
    let oldest = null;
    let oldestTs = Infinity;
    for (const [id, entry] of this.seenMessages) {
      if (entry.ts < oldestTs) {
        oldestTs = entry.ts;
        oldest = id;
      }
    }
    if (oldest) {
      this.seenMessages.delete(oldest);
    }
  }

  /**
   * Periodic cleanup: remove expired cache entries and routing table entries
   * @private
   */
  _cleanup() {
    const now = Date.now();

    // Purge old seen-message cache entries
    for (const [id, entry] of this.seenMessages) {
      if (now - entry.ts > CACHE_DURATION_MS) {
        this.seenMessages.delete(id);
      }
    }

    // Purge expired routing table entries
    for (const [key, route] of this.routingTable) {
      if (now - route.lastSeen > ROUTE_EXPIRY_MS) {
        this.routingTable.delete(key);
      }
    }
  }

  // ============================================================================
  // Diagnostics
  // ============================================================================

  /**
   * Return a snapshot of current router state (for debugging/UI display)
   *
   * @returns {object}
   */
  getStatus() {
    return {
      peers: this.peers.size,
      routes: this.routingTable.size,
      seenMessages: this.seenMessages.size,
      peerIds: [...this.peers.keys()]
    };
  }

  /**
   * Get the best known route to a destination
   *
   * @param {string} recipientBoxPKB64 - Destination's box public key (base64)
   * @returns {{ peerId: string, hopCount: number } | null}
   */
  getRoute(recipientBoxPKB64) {
    const route = this.routingTable.get(recipientBoxPKB64);
    if (!route || Date.now() - route.lastSeen > ROUTE_EXPIRY_MS) {
      return null;
    }
    return { peerId: route.peerId, hopCount: route.hopCount };
  }

  /**
   * Check if a specific message ID has already been seen
   *
   * @param {string} msgId
   * @returns {boolean}
   */
  hasSeen(msgId) {
    return this.seenMessages.has(msgId);
  }
}

export default MeshRouter;
