/**
 * Route advertisement jitter/suppression controller.
 *
 * - suppression: if we broadcast too recently, skip duplicates
 * - jitter: randomize next broadcast window to reduce synchronization bursts
 */
export class RouteAdvScheduler {
  constructor(options = {}) {
    this.baseIntervalMs = options.baseIntervalMs ?? 30_000;
    this.jitterMs = options.jitterMs ?? 5_000;
    this.suppressWindowMs = options.suppressWindowMs ?? 8_000;
    this._lastBroadcastAt = 0;
    this._lastDigest = null;
    this._rng = options.rng ?? Math.random;
  }

  shouldBroadcast(routeDigest, now = Date.now()) {
    const elapsed = now - this._lastBroadcastAt;
    const digestUnchanged = routeDigest === this._lastDigest;

    if (digestUnchanged && elapsed < this.suppressWindowMs) {
      return false;
    }

    this._lastBroadcastAt = now;
    this._lastDigest = routeDigest;
    return true;
  }

  nextDelayMs() {
    const offset = Math.floor((this._rng() * (this.jitterMs * 2 + 1)) - this.jitterMs);
    return Math.max(1_000, this.baseIntervalMs + offset);
  }
}
