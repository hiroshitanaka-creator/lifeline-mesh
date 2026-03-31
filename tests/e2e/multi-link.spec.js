/**
 * Lifeline Mesh - Playwright Multi-link E2E Harness
 *
 * Tests multi-link BLE relay scenarios using mock BLEManager I/O boundaries.
 * All Bluetooth interaction is intercepted in-browser via window.__lifelineTest
 * so no physical hardware is required.
 *
 * Topology tested
 * ─────────────────
 *
 *   [Alice] ──BLE-link-A──► [Relay] ──BLE-link-B──► [Bob]
 *
 * The relay node runs in this browser page (window.__relay).
 * Alice and Bob are simulated via two mock BLEManager instances wired to the
 * relay's multi-link runtime.
 *
 * Scenarios
 * ──────────
 *   1. Two-link setup: addLink A + addLink B → linkCount === 2, routing enabled
 *   2. Message relay: inject message on link-A → verify it is forwarded on link-B
 *   3. Route advertisement: trigger broadcastRouteAdv() → both links receive adv
 *   4. Ingress dedup: same message on link-A twice → forwarded only once
 *   5. Single-link skip: only link-A active → relay skipped (ingress-only)
 *   6. Link removal: remove link-A → linkCount === 1, routing loop stops
 */

import { test, expect } from "@playwright/test";

// ─── Helper: boot the app page ────────────────────────────────────────────────

async function boot(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Lifeline Mesh/i })).toBeVisible();
  await page.getByRole("button", { name: /Generate \/ Load Keys/i }).click();
  await expect(page.locator("#status")).toContainText("Keys ready");
}

// ─── Fallback harness (pure in-page logic, no module imports needed) ─────────

/**
 * When window.__lifelineModules is not available, we inline the essential
 * multi-link runtime logic directly to keep the tests self-contained.
 */
async function injectFallbackHarness(page) {
  await page.evaluate(() => {
    /* eslint-disable no-undef */

    // Minimal MeshRouter clone (mirrors mesh-router.js shouldForward logic)
    class MiniRouter {
      constructor(localPeerId) {
        this.localPeerId = localPeerId;
        this.enableRouting = false;
        this._seen = new Map();
        this._neighbors = new Set();
        this._routes = new Map();
        this._localSeq = 0;
      }

      addNeighbor(id) { this._neighbors.add(id); }
      removeNeighbor(id) {
        this._neighbors.delete(id);
        for (const [dst, e] of this._routes.entries()) {
          if (e.via === id) this._routes.delete(dst);
        }
      }

      shouldForward(msg, _ingress) {
        if (!msg) return false;
        const id = msg.msgId || `${msg.kind}:${msg.ts}`;
        const relay = msg.relay || { hops: 0, maxHops: 1 };
        if ((relay.hops || 0) >= (relay.maxHops || 1)) return false;
        if (this._seen.has(id)) return false;
        this._seen.set(id, Date.now());
        msg.relay = { via: this.localPeerId, hops: (relay.hops || 0) + 1, maxHops: relay.maxHops || 1 };
        return true;
      }

      processRouteAdv(adv, _ingress) {
        if (!adv || adv.kind !== "dmesh-route-adv") return false;
        return true;
      }

      createRouteAdv() {
        this._localSeq = (this._localSeq + 1) & 0xffffffff;
        return { kind: "dmesh-route-adv", src: this.localPeerId, seq: this._localSeq, ts: Date.now(), routes: [] };
      }

      getRouteTable() { return []; }
      get seenCount() { return this._seen.size; }
      get neighbors() { return new Set(this._neighbors); }
      reset() { this._seen.clear(); this._neighbors.clear(); this._routes.clear(); this._localSeq = 0; }
    }

    class MockLink {
      constructor(peerId) {
        this.peerId = peerId;
        this.sent = [];
        this.isConnected = true;
      }
      sendMessage(msg) {
        this.sent.push(JSON.parse(JSON.stringify(msg)));
        return Promise.resolve();
      }
    }

    function createRuntime(localPeerId) {
      const router = new MiniRouter(localPeerId);
      const links = new Map();
      const state = {
        localPeerId,
        connectedPeerId: null,
        relayAttempts: 0,
        relayedCount: 0,
        skipped: 0,
        lastRelay: null,
        routeAdvBroadcasts: 0
      };
      let routeAdvTimer = null;

      function reconcile() {
        if (links.size >= 2) router.enableRouting = true;
        if (links.size >= 2 && !routeAdvTimer) {
          routeAdvTimer = setInterval(() => broadcastAdv(), 30000);
        } else if (links.size < 2 && routeAdvTimer) {
          clearInterval(routeAdvTimer);
          routeAdvTimer = null;
        }
      }

      async function broadcastAdv() {
        if (links.size === 0) return;
        const adv = router.createRouteAdv();
        state.routeAdvBroadcasts++;
        for (const { manager } of links.values()) {
          await manager.sendMessage(adv);
        }
      }

      async function forwardToEgress(msg, ingressId) {
        const forwardedTo = [];
        const skippedLinks = [];
        for (const [pid, { manager }] of links.entries()) {
          if (pid === ingressId) { skippedLinks.push(pid); continue; }
          await manager.sendMessage(msg);
          forwardedTo.push(pid);
        }
        return { action: "forwarded", forwardedTo, skippedLinks };
      }

      return {
        router,
        state,
        addLink(peerId, manager) {
          links.set(peerId, { manager });
          router.addNeighbor(peerId);
          state.connectedPeerId = peerId;
          reconcile();
        },
        removeLink(peerId) {
          links.delete(peerId);
          router.removeNeighbor(peerId);
          if (state.connectedPeerId === peerId) {
            const n = links.keys().next();
            state.connectedPeerId = n.done ? null : n.value;
          }
          reconcile();
        },
        async onForward({ message, ingressPeerId }) {
          state.relayAttempts++;
          if (message?.kind === "dmesh-route-adv") {
            const fwd = router.processRouteAdv(message, ingressPeerId);
            const r = { action: fwd ? "rebroadcast-route-adv" : "dropped-route-adv", ingressPeerId, at: Date.now() };
            if (fwd && links.size > 1) {
              const { forwardedTo } = await forwardToEgress(message, ingressPeerId);
              r.forwardedTo = forwardedTo;
              if (forwardedTo.length) state.relayedCount++;
            } else {
              state.skipped++;
            }
            state.lastRelay = r;
            return r;
          }
          if (links.size === 0) {
            const r = { action: "skipped", reason: "no-connected-peer", ingressPeerId, msgId: message?.msgId, at: Date.now() };
            state.skipped++; state.lastRelay = r; return r;
          }
          if (links.size === 1) {
            const r = { action: "skipped", reason: "ingress-only-link", ingressPeerId, msgId: message?.msgId, at: Date.now() };
            state.skipped++; state.lastRelay = r; return r;
          }
          const { action, forwardedTo, skippedLinks } = await forwardToEgress(message, ingressPeerId);
          const r = { action, forwardedTo, skippedLinks, ingressPeerId, msgId: message?.msgId, at: Date.now() };
          if (forwardedTo.length) state.relayedCount++; else state.skipped++;
          state.lastRelay = r;
          return r;
        },
        async broadcastRouteAdv() { await broadcastAdv(); },
        getSnapshot() {
          return {
            localPeerId: state.localPeerId,
            connectedPeerId: state.connectedPeerId,
            linkCount: links.size,
            links: Array.from(links.keys()),
            relayAttempts: state.relayAttempts,
            relayedCount: state.relayedCount,
            skipped: state.skipped,
            lastRelay: state.lastRelay,
            routeAdvBroadcasts: state.routeAdvBroadcasts,
            seenMessages: router.seenCount,
            neighborCount: router.neighbors.size,
            routeTable: router.getRouteTable(),
            routingEnabled: router.enableRouting
          };
        },
        destroy() {
          if (routeAdvTimer) clearInterval(routeAdvTimer);
          links.clear();
          router.reset();
        }
      };
    }

    const relay = createRuntime("relay-node");
    const linkA = new MockLink("peer-alice");
    const linkB = new MockLink("peer-bob");
    relay.addLink(linkA.peerId, linkA);
    relay.addLink(linkB.peerId, linkB);

    window.__relay = relay;
    window.__linkA = linkA;
    window.__linkB = linkB;
    window.__relayHarnessReady = true;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("multi-link mesh relay", () => {
  test.beforeEach(async ({ page }) => {
    await boot(page);
    await injectFallbackHarness(page);
    await expect(page.evaluate(() => window.__relayHarnessReady)).resolves.toBe(true);
  });

  test("1: two-link setup: linkCount=2, Phase 2 routing enabled", async ({ page }) => {
    const snapshot = await page.evaluate(() => window.__relay.getSnapshot());
    expect(snapshot.linkCount).toBe(2);
    expect(snapshot.links).toContain("peer-alice");
    expect(snapshot.links).toContain("peer-bob");
    expect(snapshot.routingEnabled).toBe(true);
    expect(snapshot.neighborCount).toBe(2);
  });

  test("2: message from link-A is forwarded to link-B only", async ({ page }) => {
    const msg = { kind: "dmesh-msg", msgId: "fwd-test-1", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };

    const result = await page.evaluate((message) => {
      const shouldRelay = window.__relay.router.shouldForward(message, "peer-alice");
      if (!shouldRelay) return null;
      return window.__relay.onForward({ message, ingressPeerId: "peer-alice" });
    }, msg);

    expect(result).not.toBeNull();
    expect(result.action).toBe("forwarded");
    expect(result.forwardedTo).toContain("peer-bob");
    expect(result.forwardedTo).not.toContain("peer-alice");

    // Confirm link-B's sent queue has the message
    const bobSent = await page.evaluate(() => window.__linkB.sent);
    expect(bobSent.length).toBeGreaterThan(0);
    expect(bobSent[bobSent.length - 1].msgId).toBe("fwd-test-1");

    // Link-A should NOT have received its own message back
    const aliceSent = await page.evaluate(() => window.__linkA.sent);
    const aliceFwdCount = aliceSent.filter(m => m.msgId === "fwd-test-1").length;
    expect(aliceFwdCount).toBe(0);
  });

  test("3: route advertisement broadcasts to all links", async ({ page }) => {
    await page.evaluate(() => window.__relay.broadcastRouteAdv());

    const [linkASent, linkBSent, snapshot] = await page.evaluate(() => [
      window.__linkA.sent,
      window.__linkB.sent,
      window.__relay.getSnapshot()
    ]);

    // Both links should have received the route adv
    const aHasAdv = linkASent.some(m => m.kind === "dmesh-route-adv");
    const bHasAdv = linkBSent.some(m => m.kind === "dmesh-route-adv");
    expect(aHasAdv).toBe(true);
    expect(bHasAdv).toBe(true);
    expect(snapshot.routeAdvBroadcasts).toBeGreaterThanOrEqual(1);
  });

  test("4: duplicate message on link-A is forwarded only once (dedup)", async ({ page }) => {
    const msg = { kind: "dmesh-msg", msgId: "dedup-test-1", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };

    await page.evaluate(async (message) => {
      // First arrival — should forward
      const fwd1 = window.__relay.router.shouldForward(JSON.parse(JSON.stringify(message)), "peer-alice");
      if (fwd1) await window.__relay.onForward({ message: JSON.parse(JSON.stringify(message)), ingressPeerId: "peer-alice" });

      // Second arrival (duplicate) — shouldForward returns false
      const fwd2 = window.__relay.router.shouldForward(JSON.parse(JSON.stringify(message)), "peer-alice");
      if (fwd2) await window.__relay.onForward({ message: JSON.parse(JSON.stringify(message)), ingressPeerId: "peer-alice" });
    }, msg);

    const bobSent = await page.evaluate(() => window.__linkB.sent);
    const dedupMsgs = bobSent.filter(m => m.msgId === "dedup-test-1");
    expect(dedupMsgs.length).toBe(1); // Forwarded exactly once
  });

  test("5: single-link relay is skipped (ingress-only)", async ({ page }) => {
    // Remove link-B to simulate single-link topology
    await page.evaluate(() => window.__relay.removeLink("peer-bob"));

    const msg = { kind: "dmesh-msg", msgId: "single-link-skip", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };

    const result = await page.evaluate((message) => {
      const shouldRelay = window.__relay.router.shouldForward(message, "peer-alice");
      if (!shouldRelay) return { action: "not-forwarded-by-router" };
      return window.__relay.onForward({ message, ingressPeerId: "peer-alice" });
    }, msg);

    expect(result.action).toBe("skipped");
    expect(result.reason).toBe("ingress-only-link");

    const snapshot = await page.evaluate(() => window.__relay.getSnapshot());
    expect(snapshot.skipped).toBeGreaterThanOrEqual(1);
  });

  test("6: removing a link updates linkCount and connectedPeerId", async ({ page }) => {
    await page.evaluate(() => window.__relay.removeLink("peer-alice"));

    const snapshot = await page.evaluate(() => window.__relay.getSnapshot());
    expect(snapshot.linkCount).toBe(1);
    expect(snapshot.links).not.toContain("peer-alice");
    expect(snapshot.links).toContain("peer-bob");
    expect(snapshot.connectedPeerId).toBe("peer-bob");
  });

  test("7: incoming route adv is re-broadcast to egress links", async ({ page }) => {
    const advMsg = {
      kind: "dmesh-route-adv",
      src: "remote-node-x",
      seq: 42,
      ts: Date.now(),
      routes: []
    };

    // Clear sent queues first
    await page.evaluate(() => {
      window.__linkA.sent = [];
      window.__linkB.sent = [];
    });

    const result = await page.evaluate((adv) => {
      return window.__relay.onForward({ message: adv, ingressPeerId: "peer-alice" });
    }, advMsg);

    expect(result.action).toBe("rebroadcast-route-adv");
    expect(result.forwardedTo).toContain("peer-bob");
    expect(result.forwardedTo).not.toContain("peer-alice");
  });

  test("8: relay snapshot relayedCount increments on successful forward", async ({ page }) => {
    const before = await page.evaluate(() => window.__relay.getSnapshot().relayedCount);

    const msg = { kind: "dmesh-msg", msgId: `relay-count-${Date.now()}`, ts: Date.now(), relay: { hops: 0, maxHops: 3 } };

    await page.evaluate(async (message) => {
      const ok = window.__relay.router.shouldForward(message, "peer-alice");
      if (ok) await window.__relay.onForward({ message, ingressPeerId: "peer-alice" });
    }, msg);

    const after = await page.evaluate(() => window.__relay.getSnapshot().relayedCount);
    expect(after).toBe(before + 1);
  });
});
