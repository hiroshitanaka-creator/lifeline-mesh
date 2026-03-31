/**
 * Type definitions for app/src/operator-panel.js
 */

// ─── Snapshot types (mirrors runtime-mesh.js getSnapshot()) ──────────────────

export interface RouteEntry {
  dst: string;
  via: string;
  hops: number;
  seq: number;
  ts: number;
  ttlRemaining: number;
}

export interface RelayRecord {
  action: string;
  reason?: string;
  forwardedTo?: string[];
  skippedLinks?: string[];
  ingressPeerId?: string;
  msgId?: string | null;
  at: number;
}

export interface MeshSnapshot {
  localPeerId?: string;
  connectedPeerId?: string | null;
  linkCount?: number;
  links?: string[];
  relayAttempts?: number;
  relayedCount?: number;
  skipped?: number;
  lastRelay?: RelayRecord | null;
  routeAdvBroadcasts?: number;
  seenMessages?: number;
  neighborCount?: number;
  routeTable?: RouteEntry[];
  routingEnabled?: boolean;
}

export interface OutboxStats {
  pending?: number;
  failed?: number;
}

// ─── Panel handle ─────────────────────────────────────────────────────────────

export interface PanelHandle {
  /** Force an immediate refresh of the panel content. */
  update(): void;
  /** Stop the polling timer and clean up. */
  destroy(): void;
}

export interface PanelHandleWithElement extends PanelHandle {
  /** The root panel element (for createOperatorPanel). */
  element: HTMLElement;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface OperatorPanelOptions {
  /** Returns the current mesh runtime snapshot. Called on every refresh cycle. */
  getSnapshot: () => MeshSnapshot;
  /**
   * Returns outbox queue stats. Called synchronously on every refresh cycle.
   * Defaults to returning empty object (all counts shown as 0).
   */
  getOutboxStats?: () => OutboxStats;
  /**
   * How often (ms) to refresh the panel.
   * @default 2000
   */
  pollIntervalMs?: number;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Render a mesh operator panel HTML string from a snapshot.
 * Exported for unit testing; normally used internally by mountOperatorPanel().
 *
 * @param snapshot    Mesh runtime snapshot.
 * @param outboxStats Outbox queue stats (optional).
 * @returns           HTML string (sanitised; safe to assign to innerHTML).
 */
export declare function renderPanel(snapshot: MeshSnapshot, outboxStats?: OutboxStats): string;

/**
 * Mount the operator panel into an existing DOM element.
 * Injects scoped CSS into document.head (once per page).
 * Starts a polling loop that refreshes the panel every `pollIntervalMs`.
 *
 * @param container  The target HTMLElement to render into.
 * @param options    Configuration and data-source callbacks.
 * @returns          Handle with update() and destroy() methods.
 */
export declare function mountOperatorPanel(
  container: HTMLElement,
  options: OperatorPanelOptions
): PanelHandle;

/**
 * Create a detached panel element without inserting it into the DOM.
 * Useful for shadow DOM, portals, or custom container management.
 *
 * @param options  Configuration and data-source callbacks.
 * @returns        Handle with element, update(), and destroy().
 */
export declare function createOperatorPanel(
  options: OperatorPanelOptions
): PanelHandleWithElement;
