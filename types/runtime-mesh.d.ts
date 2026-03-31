/**
 * Type definitions for app/src/runtime-mesh.js
 */

import type { MeshRouter } from "../bluetooth/mesh-router.js";

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface RouteTableEntry {
  dst: string;
  via: string;
  hops: number;
  seq: number;
  ts: number;
  ttlRemaining: number;
}

export interface RelayResult {
  action: "forwarded" | "skipped" | "rebroadcast-route-adv" | "dropped-route-adv";
  /** Present when action === 'forwarded' or 'rebroadcast-route-adv'. */
  forwardedTo?: string[];
  /** Present when action === 'forwarded'. */
  skippedLinks?: string[];
  /** Present when action === 'skipped'. */
  reason?: "no-connected-peer" | "ingress-only-link";
  ingressPeerId?: string;
  msgId?: string | null;
  at: number;
}

export interface MeshRuntimeSnapshot {
  localPeerId: string;
  /** Legacy single-link field; equals the last-added link's peerId or null. */
  connectedPeerId: string | null;
  linkCount: number;
  links: string[];
  relayAttempts: number;
  relayedCount: number;
  skipped: number;
  lastRelay: RelayResult | null;
  routeAdvBroadcasts: number;
  seenMessages: number;
  neighborCount: number;
  routeTable: RouteTableEntry[];
  routingEnabled: boolean;
}

// ─── BLE Link manager interface (minimal) ────────────────────────────────────

/** Minimal interface a BLE link manager must satisfy. */
export interface ILinkManager {
  /** Send a message to the connected peer. */
  sendMessage(message: Record<string, unknown>): Promise<void>;
}

// ─── MeshRuntime handle ───────────────────────────────────────────────────────

export interface MeshRuntimeHandle {
  /** The underlying MeshRouter instance. */
  router: MeshRouter;

  /** Mutable internal state (for advanced introspection). */
  state: {
    localPeerId: string;
    connectedPeerId: string | null;
    relayAttempts: number;
    relayedCount: number;
    skipped: number;
    lastRelay: RelayResult | null;
    routeAdvBroadcasts: number;
  };

  /** Update the local peer fingerprint (called after key generation). */
  setLocalPeerId(peerId: string): void;

  /**
   * Register a BLE link.
   * Automatically enables Phase 2 routing when ≥2 links are active.
   */
  addLink(peerId: string, manager: ILinkManager): void;

  /**
   * Unregister a BLE link on disconnect.
   * Removes the peer from the router's neighbor table.
   */
  removeLink(peerId: string): void;

  /**
   * Legacy single-link connection-change handler.
   * Calls addLink / removeLink internally.
   * Kept for backward compatibility with existing BLEManager wiring.
   */
  onConnectionChange(connected: boolean, device?: { id?: string; _bleManager?: ILinkManager } | null): void;

  /**
   * Called by BLEManager.onForward when a message should be relayed.
   * Handles both ROUTE_ADV re-broadcast and data message forwarding.
   */
  onForward(params: { message: Record<string, unknown>; ingressPeerId: string }): Promise<RelayResult>;

  /**
   * Immediately broadcast a route advertisement to all connected links.
   * No-op if fewer than 2 links are active.
   */
  broadcastRouteAdv(): Promise<void>;

  /** Return a complete snapshot of runtime state for the UI / operator panel. */
  getSnapshot(): MeshRuntimeSnapshot;

  /** Stop all background timers and clear all state. Call on app teardown. */
  destroy(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new mesh runtime instance.
 *
 * @param localPeerId  Local node fingerprint / peer ID.
 *                     Can be updated later via handle.setLocalPeerId().
 * @returns            MeshRuntimeHandle
 */
export declare function createMeshRuntime(localPeerId?: string): MeshRuntimeHandle;
