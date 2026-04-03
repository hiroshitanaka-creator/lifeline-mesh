/**
 * Lifeline Mesh - Operator Panel
 *
 * A self-contained UI panel for network operators and power users that
 * shows live mesh runtime state: active links, route table, relay counters,
 * route-advertisement activity, and outbox queue depth.
 *
 * Usage
 * ─────
 *   import { mountOperatorPanel } from './operator-panel.js';
 *
 *   const panel = mountOperatorPanel(document.getElementById('operator-panel'), {
 *     getSnapshot: () => meshRuntime.getSnapshot(),
 *     getOutboxStats: () => ({ pending: 3, failed: 1 }),  // optional
 *     pollIntervalMs: 2000                                  // optional
 *   });
 *
 *   // Later, to stop polling:
 *   panel.destroy();
 *
 * The mount target element receives the panel's innerHTML and a `<style>` tag
 * scoped to the `.lm-op-panel` class. Re-mounting on the same element is safe.
 */

// ─── CSS ─────────────────────────────────────────────────────────────────────

const PANEL_CSS = `
.lm-op-panel {
  font-family: 'Courier New', Courier, monospace;
  font-size: 13px;
  background: #0d1117;
  color: #c9d1d9;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 12px 16px;
  max-width: 680px;
  box-sizing: border-box;
}
.lm-op-panel h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: #58a6ff;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.lm-op-panel .lm-op-section {
  margin-bottom: 12px;
}
.lm-op-panel .lm-op-section-title {
  font-weight: bold;
  color: #8b949e;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
  border-bottom: 1px solid #21262d;
  padding-bottom: 2px;
}
.lm-op-panel .lm-op-kv {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.lm-op-panel .lm-op-stat {
  display: flex;
  gap: 4px;
  align-items: baseline;
}
.lm-op-panel .lm-op-key {
  color: #8b949e;
}
.lm-op-panel .lm-op-val {
  color: #e6edf3;
  font-weight: bold;
}
.lm-op-panel .lm-op-val.green  { color: #3fb950; }
.lm-op-panel .lm-op-val.yellow { color: #d29922; }
.lm-op-panel .lm-op-val.red    { color: #f85149; }
.lm-op-panel .lm-op-val.blue   { color: #58a6ff; }
.lm-op-panel .lm-op-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.lm-op-panel .lm-op-link-chip {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  color: #79c0ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.lm-op-panel .lm-op-route-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin-top: 4px;
}
.lm-op-panel .lm-op-route-table th {
  text-align: left;
  color: #8b949e;
  font-weight: normal;
  padding: 2px 6px 2px 0;
  border-bottom: 1px solid #21262d;
}
.lm-op-panel .lm-op-route-table td {
  padding: 2px 6px 2px 0;
  color: #c9d1d9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}
.lm-op-panel .lm-op-route-table tr:hover td {
  background: #161b22;
}
.lm-op-panel .lm-op-empty {
  color: #484f58;
  font-style: italic;
  font-size: 11px;
}
.lm-op-panel .lm-op-last-relay {
  background: #161b22;
  border-radius: 4px;
  padding: 4px 8px;
  margin-top: 4px;
  font-size: 11px;
  color: #8b949e;
}
.lm-op-panel .lm-op-last-relay span {
  color: #c9d1d9;
}
.lm-op-panel .lm-op-updated {
  color: #484f58;
  font-size: 10px;
  text-align: right;
  margin-top: 8px;
}
`;

// ─── Template helpers ─────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortId(id) {
  if (!id || id === "unknown") return id;
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function formatMs(ms) {
  if (ms <= 0) return "0s";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function formatAgo(ts) {
  if (!Number.isFinite(ts)) return "never";
  const delta = Math.max(0, Date.now() - ts);
  return `${Math.round(delta / 1000)}s ago`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Render the operator panel HTML from a runtime snapshot.
 *
 * @param {object} snapshot - Output of meshRuntime.getSnapshot()
 * @param {object} [outboxStats] - { pending, failed } counts
 * @param {object} [maintenanceStats]
 * @param {object} [retention]
 * @returns {string} HTML string
 */
export function renderPanel(snapshot, outboxStats = {}, maintenanceStats = {}, retention = {}) {
  const {
    localPeerId = "unknown",
    linkCount = 0,
    links = [],
    relayAttempts = 0,
    relayedCount = 0,
    skipped = 0,
    routeAdvBroadcasts = 0,
    seenMessages = 0,
    neighborCount = 0,
    routeTable = [],
    routingEnabled = false,
    lastRelay = null
  } = snapshot;

  const pending = outboxStats.pending ?? 0;
  const failed  = outboxStats.failed  ?? 0;
  const {
    runs = 0,
    lastRunAt = null,
    lastResult = null,
    lastError = null
  } = maintenanceStats || {};
  const {
    outboxTtlMs = null,
    seenRetentionMs = null,
    chunkMaxAgeMs = null
  } = retention || {};

  // ── Links section ──────────────────────────────────────────────────────────
  const linkChips = links.length > 0
    ? links.map(id => `<span class="lm-op-link-chip" title="${esc(id)}">${esc(shortId(id))}</span>`).join("")
    : `<span class="lm-op-empty">no active links</span>`;

  // ── Route table ────────────────────────────────────────────────────────────
  let routeTableHtml = "";
  if (!routingEnabled || routeTable.length === 0) {
    routeTableHtml = `<span class="lm-op-empty">${routingEnabled ? "no routes" : "routing disabled (< 2 links)"}</span>`;
  } else {
    const rows = routeTable.map(r =>
      `<tr>
        <td title="${esc(r.dst)}">${esc(shortId(r.dst))}</td>
        <td title="${esc(r.via)}">${esc(shortId(r.via))}</td>
        <td>${esc(r.hops)}</td>
        <td>${esc(r.seq)}</td>
        <td>${esc(formatMs(r.ttlRemaining))}</td>
      </tr>`
    ).join("");

    routeTableHtml = `
      <table class="lm-op-route-table">
        <thead>
          <tr>
            <th>dst</th><th>via</th><th>hops</th><th>seq</th><th>ttl</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Last relay ─────────────────────────────────────────────────────────────
  let lastRelayHtml = `<span class="lm-op-empty">no relay yet</span>`;
  if (lastRelay) {
    const ago = lastRelay.at ? `${Math.round((Date.now() - lastRelay.at) / 1000)}s ago` : "";
    const details = lastRelay.action === "forwarded"
      ? `→ [${(lastRelay.forwardedTo ?? []).map(shortId).join(", ")}]`
      : lastRelay.reason ?? "";
    lastRelayHtml = `
      <div class="lm-op-last-relay">
        <span>${esc(lastRelay.action)}</span>
        ${details ? `<span style="margin-left:8px;color:#8b949e">${esc(details)}</span>` : ""}
        ${lastRelay.msgId ? `<span style="margin-left:8px;color:#484f58">msg:${esc(shortId(lastRelay.msgId))}</span>` : ""}
        ${ago ? `<span style="margin-left:8px;color:#484f58">${esc(ago)}</span>` : ""}
      </div>`;
  }

  const linkCountColor = linkCount >= 2 ? "green" : linkCount === 1 ? "yellow" : "red";
  const outboxPendingColor = pending === 0 ? "green" : pending < 5 ? "yellow" : "red";
  const failedColor = failed === 0 ? "green" : "red";

  return `
    <div class="lm-op-section">
      <div class="lm-op-section-title">Node</div>
      <div class="lm-op-kv">
        <div class="lm-op-stat">
          <span class="lm-op-key">id</span>
          <span class="lm-op-val blue">${esc(shortId(localPeerId))}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">links</span>
          <span class="lm-op-val ${linkCountColor}">${esc(linkCount)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">neighbors</span>
          <span class="lm-op-val">${esc(neighborCount)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">routing</span>
          <span class="lm-op-val ${routingEnabled ? "green" : "yellow"}">${routingEnabled ? "on" : "off"}</span>
        </div>
      </div>
      <div class="lm-op-links">${linkChips}</div>
    </div>

    <div class="lm-op-section">
      <div class="lm-op-section-title">Relay</div>
      <div class="lm-op-kv">
        <div class="lm-op-stat">
          <span class="lm-op-key">attempts</span>
          <span class="lm-op-val">${esc(relayAttempts)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">relayed</span>
          <span class="lm-op-val green">${esc(relayedCount)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">skipped</span>
          <span class="lm-op-val ${skipped > 0 ? "yellow" : ""}">${esc(skipped)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">seen</span>
          <span class="lm-op-val">${esc(seenMessages)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">adv-tx</span>
          <span class="lm-op-val">${esc(routeAdvBroadcasts)}</span>
        </div>
      </div>
      ${lastRelayHtml}
    </div>

    <div class="lm-op-section">
      <div class="lm-op-section-title">Outbox</div>
      <div class="lm-op-kv">
        <div class="lm-op-stat">
          <span class="lm-op-key">pending</span>
          <span class="lm-op-val ${outboxPendingColor}">${esc(pending)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">failed</span>
          <span class="lm-op-val ${failedColor}">${esc(failed)}</span>
        </div>
      </div>
    </div>

    <div class="lm-op-section">
      <div class="lm-op-section-title">Maintenance</div>
      <div class="lm-op-kv">
        <div class="lm-op-stat">
          <span class="lm-op-key">runs</span>
          <span class="lm-op-val">${esc(runs)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">last</span>
          <span class="lm-op-val ${lastError ? "red" : "green"}">${esc(formatAgo(lastRunAt))}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">outbox-purged</span>
          <span class="lm-op-val">${esc(lastResult?.outboxPurged ?? 0)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">seen-removed</span>
          <span class="lm-op-val">${esc(lastResult?.seenRemoved ?? 0)}</span>
        </div>
        <div class="lm-op-stat">
          <span class="lm-op-key">chunks-removed</span>
          <span class="lm-op-val">${esc(lastResult?.chunksRemoved ?? 0)}</span>
        </div>
      </div>
      <div class="lm-op-last-relay">
        <span>retention(outbox/seen/chunks): ${esc(formatMs(outboxTtlMs))} / ${esc(formatMs(seenRetentionMs))} / ${esc(formatMs(chunkMaxAgeMs))}</span>
      </div>
      ${lastError ? `<div class="lm-op-last-relay"><span>last-error: ${esc(lastError)}</span></div>` : ""}
    </div>

    <div class="lm-op-section">
      <div class="lm-op-section-title">Route table (${esc(routeTable.length)})</div>
      ${routeTableHtml}
    </div>

    <div class="lm-op-updated">Updated: ${new Date().toLocaleTimeString()}</div>
  `;
}

// ─── Mount / unmount ─────────────────────────────────────────────────────────

/**
 * Inject the operator panel into a container element.
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {function(): object} options.getSnapshot - Returns meshRuntime.getSnapshot()
 * @param {function(): object} [options.getOutboxStats] - Returns { pending, failed }
 * @param {function(): object} [options.getMaintenanceStats]
 * @param {object} [options.retention]
 * @param {number} [options.pollIntervalMs=2000] - Refresh interval in ms
 * @returns {{ update: function, destroy: function }} Panel handle
 */
export function mountOperatorPanel(container, options) {
  const {
    getSnapshot,
    getOutboxStats = () => ({}),
    getMaintenanceStats = () => ({}),
    retention = {},
    pollIntervalMs = 2000
  } = options || {};

  if (!container || typeof getSnapshot !== "function") {
    throw new Error("mountOperatorPanel: container and options.getSnapshot are required");
  }

  // Inject scoped CSS once per document
  const STYLE_ID = "lm-op-panel-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
  }

  // Ensure container has the panel class
  container.classList.add("lm-op-panel");
  if (!container.querySelector("h3")) {
    const heading = document.createElement("h3");
    heading.textContent = "Mesh Operator Panel";
    container.prepend(heading);
  }

  // Inner render target (below the heading)
  let inner = container.querySelector(".lm-op-inner");
  if (!inner) {
    inner = document.createElement("div");
    inner.className = "lm-op-inner";
    container.appendChild(inner);
  }

  function update() {
    try {
      const snapshot = getSnapshot();
      const outboxStats = getOutboxStats();
      const maintenanceStats = getMaintenanceStats();
      inner.innerHTML = renderPanel(snapshot, outboxStats, maintenanceStats, retention);
    } catch (err) {
      inner.innerHTML = `<div class="lm-op-empty">Error rendering panel: ${esc(err instanceof Error ? err.message : String(err))}</div>`;
    }
  }

  update();
  const timer = setInterval(update, pollIntervalMs);

  return {
    /** Force an immediate refresh. */
    update,
    /** Stop polling and remove event listeners. */
    destroy() {
      clearInterval(timer);
    }
  };
}

/**
 * Create a detached panel element that is not yet inserted into the DOM.
 * Useful for rendering in a shadow DOM or custom container.
 *
 * @param {object} options - Same as mountOperatorPanel options
 * @returns {{ element: HTMLElement, update: function, destroy: function }}
 */
export function createOperatorPanel(options) {
  const container = document.createElement("div");
  const handle = mountOperatorPanel(container, options);
  return { element: container, ...handle };
}
