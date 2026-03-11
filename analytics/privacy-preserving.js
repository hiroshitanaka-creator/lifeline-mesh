/**
 * Lifeline Mesh - Privacy-Preserving Local Metrics
 *
 * Collects usage statistics entirely locally — nothing is ever sent to a
 * server. The data lives only in the user's browser (localStorage) and is
 * visible to the user on demand through getReport().
 *
 * Design principles:
 * - No personal data: counters and averages only, no message content or keys
 * - Local-only: no network calls, no beacons, no analytics SDK
 * - User-controlled: users can view and wipe their metrics at any time
 * - Lightweight: O(1) memory per category; no unbounded lists
 *
 * Tracked metrics:
 *   messagesEncrypted / messagesDecrypted  — operation counts
 *   bleConnections / bleDisconnections     — BLE events
 *   groupsCreated / groupMessagesEncrypted — group usage
 *   errors                                 — error code → count map
 *   avgEncryptMs / avgDecryptMs            — rolling average latency (ms)
 *   sessionStart / lastActivity            — timestamps (no content)
 *
 * @module analytics/privacy-preserving
 */

const STORAGE_KEY = "lifeline-mesh:metrics";

// ============================================================================
// LocalMetrics
// ============================================================================

export class LocalMetrics {
  constructor() {
    this._metrics = this._load();
    this._metrics.sessionStart = Date.now();
  }

  // ============================================================================
  // Tracking Methods
  // ============================================================================

  /**
   * Record a successful message encryption.
   * @param {number} durationMs - Wall-clock time for the operation.
   */
  trackEncrypt(durationMs) {
    this._metrics.messagesEncrypted++;
    this._metrics.avgEncryptMs = this._rollingAvg(
      this._metrics.avgEncryptMs,
      this._metrics.messagesEncrypted,
      durationMs
    );
    this._touch();
  }

  /**
   * Record a successful message decryption.
   * @param {number} durationMs - Wall-clock time for the operation.
   */
  trackDecrypt(durationMs) {
    this._metrics.messagesDecrypted++;
    this._metrics.avgDecryptMs = this._rollingAvg(
      this._metrics.avgDecryptMs,
      this._metrics.messagesDecrypted,
      durationMs
    );
    this._touch();
  }

  /**
   * Record a BLE connection event.
   * @param {"connected"|"disconnected"} event
   */
  trackBLE(event) {
    if (event === "connected") {
      this._metrics.bleConnections++;
    } else {
      this._metrics.bleDisconnections++;
    }
    this._touch();
  }

  /**
   * Record a group creation.
   */
  trackGroupCreated() {
    this._metrics.groupsCreated++;
    this._touch();
  }

  /**
   * Record a group message encryption.
   * @param {number} durationMs - Wall-clock time for the operation.
   */
  trackGroupEncrypt(durationMs) {
    this._metrics.groupMessagesEncrypted++;
    this._metrics.avgGroupEncryptMs = this._rollingAvg(
      this._metrics.avgGroupEncryptMs,
      this._metrics.groupMessagesEncrypted,
      durationMs
    );
    this._touch();
  }

  /**
   * Record an application error.
   * @param {string} code - Error code (e.g. "DECRYPTION_FAILED")
   */
  trackError(code) {
    if (!this._metrics.errors[code]) {
      this._metrics.errors[code] = 0;
    }
    this._metrics.errors[code]++;
    this._touch();
  }

  /**
   * Record a key generation event.
   * @param {number} durationMs - Wall-clock time for the operation.
   */
  trackKeyGeneration(durationMs) {
    this._metrics.keysGenerated++;
    this._metrics.avgKeyGenMs = this._rollingAvg(
      this._metrics.avgKeyGenMs,
      this._metrics.keysGenerated,
      durationMs
    );
    this._touch();
  }

  // ============================================================================
  // Reporting
  // ============================================================================

  /**
   * Get a human-readable report of all metrics.
   * Safe to display to the user — contains no personal information.
   *
   * @returns {object}
   */
  getReport() {
    const m = this._metrics;
    const uptimeSecs = Math.floor((Date.now() - (m.sessionStart || Date.now())) / 1000);

    return {
      generatedAt: new Date().toISOString(),
      session: {
        uptimeSecs,
        startedAt: m.sessionStart ? new Date(m.sessionStart).toISOString() : null,
        lastActivity: m.lastActivity ? new Date(m.lastActivity).toISOString() : null
      },
      messages: {
        encrypted: m.messagesEncrypted,
        decrypted: m.messagesDecrypted,
        avgEncryptMs: _round(m.avgEncryptMs),
        avgDecryptMs: _round(m.avgDecryptMs)
      },
      groups: {
        created: m.groupsCreated,
        messagesEncrypted: m.groupMessagesEncrypted,
        avgEncryptMs: _round(m.avgGroupEncryptMs)
      },
      keys: {
        generated: m.keysGenerated,
        avgGenMs: _round(m.avgKeyGenMs)
      },
      bluetooth: {
        connections: m.bleConnections,
        disconnections: m.bleDisconnections
      },
      errors: { ...m.errors },
      totalErrors: Object.values(m.errors).reduce((s, n) => s + n, 0)
    };
  }

  /**
   * Reset all metrics and persist the cleared state.
   */
  reset() {
    this._metrics = _emptyMetrics();
    this._persist();
  }

  /**
   * Persist the current metrics snapshot to localStorage.
   * Silently ignores errors (e.g. private browsing mode).
   */
  save() {
    this._persist();
  }

  // ============================================================================
  // Internal
  // ============================================================================

  /**
   * Update rolling average without storing all samples.
   * avg_n = avg_(n-1) + (newValue - avg_(n-1)) / n
   * @private
   */
  _rollingAvg(currentAvg, newCount, newValue) {
    if (newCount <= 1) return newValue;
    return currentAvg + (newValue - currentAvg) / newCount;
  }

  /**
   * Update lastActivity and auto-save (debounced in production; direct here).
   * @private
   */
  _touch() {
    this._metrics.lastActivity = Date.now();
    this._persist();
  }

  /**
   * Persist to localStorage.
   * @private
   */
  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._metrics));
    } catch (_e) {
      // Quota exceeded or private mode — metrics are still held in memory
    }
  }

  /**
   * Load persisted metrics from localStorage, falling back to empty metrics.
   * @private
   * @returns {object}
   */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with empty to ensure all fields exist after schema additions
        return { ..._emptyMetrics(), ...parsed };
      }
    } catch (_e) {
      // Corrupt storage or unavailable — start fresh
    }
    return _emptyMetrics();
  }
}

// ============================================================================
// Helpers
// ============================================================================

function _emptyMetrics() {
  return {
    messagesEncrypted: 0,
    messagesDecrypted: 0,
    avgEncryptMs: 0,
    avgDecryptMs: 0,
    groupsCreated: 0,
    groupMessagesEncrypted: 0,
    avgGroupEncryptMs: 0,
    keysGenerated: 0,
    avgKeyGenMs: 0,
    bleConnections: 0,
    bleDisconnections: 0,
    errors: {},
    sessionStart: null,
    lastActivity: null
  };
}

function _round(n) {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// Instrumentation Helpers
// ============================================================================

/**
 * Wrap an async crypto operation to automatically track its duration.
 *
 * Usage:
 *   const result = await timed(metrics, "encrypt", () => cryptoWorker.encryptMessage(payload));
 *
 * @template T
 * @param {LocalMetrics} metrics - Metrics instance
 * @param {"encrypt"|"decrypt"|"groupEncrypt"|"keyGen"} category - Which counter to update
 * @param {() => Promise<T>} fn - The async operation to time
 * @returns {Promise<T>}
 */
export async function timed(metrics, category, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = performance.now() - t0;
    switch (category) {
      case "encrypt": metrics.trackEncrypt(ms); break;
      case "decrypt": metrics.trackDecrypt(ms); break;
      case "groupEncrypt": metrics.trackGroupEncrypt(ms); break;
      case "keyGen": metrics.trackKeyGeneration(ms); break;
      default: break;
    }
    return result;
  } catch (err) {
    if (err instanceof Error) {
      // Extract error code if present (e.g. "DECRYPTION_FAILED: ...")
      const code = err.message.split(":")[0].trim().toUpperCase().replace(/\s+/g, "_");
      metrics.trackError(code);
    }
    throw err;
  }
}

// Application singleton
export const metrics = new LocalMetrics();
