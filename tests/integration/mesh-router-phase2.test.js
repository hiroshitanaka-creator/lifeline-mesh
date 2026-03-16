/**
 * Integration tests for bluetooth/mesh-router.js — Phase 2: N-hop routing.
 *
 * Covers:
 *   - RouteTable: update, getBestRoute, expiry, getAll, cleanup, reset
 *   - MeshRouter.processRouteAdvert(): table updates from advertisements
 *   - MeshRouter.createRouteAdvert(): correct advertisement structure
 *   - MeshRouter.selectOutboundPeers(): unicast vs flood selection
 *   - End-to-end N-hop relay scenario (A↔B↔C↔D, maxHops=3)
 *   - Loop prevention with seen-map across multi-hop relay
 */

import { MeshRouter, RouteTable, ROUTER_DEFAULTS } from "../../bluetooth/mesh-router.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value, label = "") {
  if (!value) {
    throw new Error(`${label ? label + ": " : ""}expected truthy, got ${JSON.stringify(value)}`);
  }
}

function assertFalse(value, label = "") {
  if (value) {
    throw new Error(`${label ? label + ": " : ""}expected falsy, got ${JSON.stringify(value)}`);
  }
}

function assertNull(value, label = "") {
  if (value !== null) {
    throw new Error(`${label ? label + ": " : ""}expected null, got ${JSON.stringify(value)}`);
  }
}

function assertDeepEqual(actual, expected, label = "") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${label ? label + ": " : ""}expected ${b}, got ${a}`);
  }
}

function makeMsg(overrides = {}) {
  return {
    msgId: `msg-${Math.random().toString(36).slice(2)}`,
    kind: "dmesh-msg",
    ts: Date.now(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// RouteTable tests
// ---------------------------------------------------------------------------

test("RouteTable: update stores a new route", () => {
  const table = new RouteTable();
  const changed = table.update("peerC", "peerB", 2);
  assertTrue(changed, "update should return true for new entry");
  assertEqual(table.size, 1, "size");
});

test("RouteTable: getBestRoute returns stored route", () => {
  const table = new RouteTable();
  table.update("peerC", "peerB", 2);
  const route = table.getBestRoute("peerC");
  assertEqual(route.via, "peerB", "via");
  assertEqual(route.hops, 2, "hops");
});

test("RouteTable: getBestRoute returns null for unknown destination", () => {
  const table = new RouteTable();
  assertNull(table.getBestRoute("unknown"), "unknown destination");
});

test("RouteTable: update replaces with fewer-hop route", () => {
  const table = new RouteTable();
  table.update("peerD", "peerB", 3);
  const changed = table.update("peerD", "peerC", 2); // better route
  assertTrue(changed, "shorter route should update");
  const route = table.getBestRoute("peerD");
  assertEqual(route.via, "peerC", "best via");
  assertEqual(route.hops, 2, "best hops");
});

test("RouteTable: update does NOT replace with worse-hop route", () => {
  const table = new RouteTable();
  table.update("peerD", "peerB", 2);
  const changed = table.update("peerD", "peerC", 4); // worse route
  assertFalse(changed, "worse route should not update");
  const route = table.getBestRoute("peerD");
  assertEqual(route.via, "peerB", "original via retained");
  assertEqual(route.hops, 2, "original hops retained");
});

test("RouteTable: getBestRoute returns null for expired entry", () => {
  const table = new RouteTable({ routeTtlMs: 1000 });
  const past = Date.now() - 2000;
  // Manually insert a stale entry by using a past timestamp via update() with future now.
  table.update("peerX", "peerY", 1, past);
  const route = table.getBestRoute("peerX", Date.now());
  assertNull(route, "expired route should return null");
});

test("RouteTable: getAll excludes expired entries", () => {
  const table = new RouteTable({ routeTtlMs: 1000 });
  const past = Date.now() - 2000;
  table.update("staleP", "peerZ", 1, past);
  table.update("freshP", "peerA", 1); // fresh
  const routes = table.getAll();
  assertEqual(routes.length, 1, "only fresh entry");
  assertEqual(routes[0].destination, "freshP", "correct destination");
});

test("RouteTable: cleanup removes expired entries", () => {
  const table = new RouteTable({ routeTtlMs: 1000 });
  const past = Date.now() - 2000;
  table.update("oldP", "peerA", 1, past);
  table.update("newP", "peerB", 2); // fresh
  assertEqual(table.size, 2, "before cleanup");
  table.cleanup(Date.now());
  assertEqual(table.size, 1, "after cleanup");
});

test("RouteTable: reset clears all entries", () => {
  const table = new RouteTable();
  table.update("p1", "via1", 1);
  table.update("p2", "via2", 2);
  table.reset();
  assertEqual(table.size, 0, "after reset");
});

// ---------------------------------------------------------------------------
// MeshRouter.processRouteAdvert() tests
// ---------------------------------------------------------------------------

test("processRouteAdvert: records ingress peer as 1-hop neighbour", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const advert = {
    kind: "dmesh-route",
    from: "nodeA",
    ts: Date.now(),
    routes: []
  };

  router.processRouteAdvert(advert, "nodeA");
  const route = router.routeTable.getBestRoute("nodeA");
  assertEqual(route.via, "nodeA", "via");
  assertEqual(route.hops, 1, "hops");
});

test("processRouteAdvert: adds remote routes with +1 hop", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const advert = {
    kind: "dmesh-route",
    from: "nodeA",
    ts: Date.now(),
    routes: [
      { dst: "nodeA", hops: 0 }, // nodeA itself
      { dst: "nodeC", hops: 1 } // nodeC is 1 hop from nodeA
    ]
  };

  router.processRouteAdvert(advert, "nodeA");

  // nodeC should be reachable via nodeA with 2 hops
  const routeToC = router.routeTable.getBestRoute("nodeC");
  assertEqual(routeToC.via, "nodeA", "route to nodeC via");
  assertEqual(routeToC.hops, 2, "route to nodeC hops");
});

test("processRouteAdvert: ignores routes beyond routeAdvertMaxHops", () => {
  const router = new MeshRouter({ localPeerId: "nodeB", routeAdvertMaxHops: 3 });
  const advert = {
    kind: "dmesh-route",
    from: "nodeA",
    ts: Date.now(),
    routes: [
      { dst: "nodeZ", hops: 3 } // 3+1=4, exceeds max of 3
    ]
  };

  router.processRouteAdvert(advert, "nodeA");
  assertNull(router.routeTable.getBestRoute("nodeZ"), "distant route ignored");
});

test("processRouteAdvert: ignores entries for self", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const advert = {
    kind: "dmesh-route",
    from: "nodeA",
    ts: Date.now(),
    routes: [{ dst: "nodeB", hops: 1 }] // self-entry
  };

  router.processRouteAdvert(advert, "nodeA");
  assertNull(router.routeTable.getBestRoute("nodeB"), "self not added to table");
});

test("processRouteAdvert: ignores non-route messages", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const regularMsg = makeMsg();
  router.processRouteAdvert(regularMsg, "nodeA");
  assertEqual(router.routeTable.size, 0, "non-route message ignored");
});

// ---------------------------------------------------------------------------
// MeshRouter.createRouteAdvert() tests
// ---------------------------------------------------------------------------

test("createRouteAdvert: always includes self at hops=0", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const advert = router.createRouteAdvert();
  assertEqual(advert.kind, "dmesh-route", "kind");
  assertEqual(advert.from, "nodeA", "from");
  assertTrue(Array.isArray(advert.routes), "routes is array");
  const selfEntry = advert.routes.find(r => r.dst === "nodeA" && r.hops === 0);
  assertTrue(Boolean(selfEntry), "self-entry present");
});

test("createRouteAdvert: includes known routes under max hops", () => {
  const router = new MeshRouter({ localPeerId: "nodeB", routeAdvertMaxHops: 5 });
  router.routeTable.update("nodeC", "nodeA", 2);
  router.routeTable.update("nodeD", "nodeA", 4); // hops < 5, included
  router.routeTable.update("nodeE", "nodeA", 5); // hops === 5, excluded

  const advert = router.createRouteAdvert();
  const dsts = advert.routes.map(r => r.dst);
  assertTrue(dsts.includes("nodeC"), "nodeC included");
  assertTrue(dsts.includes("nodeD"), "nodeD included");
  assertFalse(dsts.includes("nodeE"), "nodeE excluded (at max hops)");
});

test("createRouteAdvert: relay field is set correctly", () => {
  const router = new MeshRouter({ localPeerId: "nodeA", routeAdvertMaxHops: 4 });
  const advert = router.createRouteAdvert();
  assertEqual(advert.relay.via, "nodeA", "relay.via");
  assertEqual(advert.relay.hops, 0, "relay.hops");
  assertEqual(advert.relay.maxHops, 4, "relay.maxHops");
});

// ---------------------------------------------------------------------------
// MeshRouter.selectOutboundPeers() tests
// ---------------------------------------------------------------------------

test("selectOutboundPeers: floods to all peers except ingress when route unknown", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const msg = makeMsg();
  const peers = router.selectOutboundPeers(["nodeA", "nodeC", "nodeD"], "nodeA", msg);
  // nodeA excluded (ingress)
  assertDeepEqual(peers.sort(), ["nodeC", "nodeD"].sort(), "flood peers");
});

test("selectOutboundPeers: unicasts to known-route peer for addressed message", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  // nodeB knows: nodeD is reachable via nodeC (2 hops)
  router.routeTable.update("nodeD", "nodeC", 2);

  const msg = makeMsg({ rcpt: "nodeD" });
  const peers = router.selectOutboundPeers(["nodeA", "nodeC"], "nodeA", msg, Date.now());
  assertDeepEqual(peers, ["nodeC"], "unicast to nodeC");
});

test("selectOutboundPeers: falls back to flood if best-route peer not connected", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  router.routeTable.update("nodeD", "nodeX", 2); // nodeX not in connected list

  const msg = makeMsg({ rcpt: "nodeD" });
  const peers = router.selectOutboundPeers(["nodeA", "nodeC"], "nodeA", msg, Date.now());
  assertDeepEqual(peers.sort(), ["nodeC"].sort(), "flood since route peer disconnected");
});

test("selectOutboundPeers: excludes local peer from candidates", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const msg = makeMsg();
  const peers = router.selectOutboundPeers(["nodeB", "nodeA", "nodeC"], "nodeA", msg);
  assertFalse(peers.includes("nodeB"), "local peer excluded");
  assertFalse(peers.includes("nodeA"), "ingress excluded");
});

test("selectOutboundPeers: returns empty array when no candidates remain", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const msg = makeMsg();
  const peers = router.selectOutboundPeers(["nodeA"], "nodeA", msg); // only ingress
  assertDeepEqual(peers, [], "no candidates");
});

// ---------------------------------------------------------------------------
// End-to-end N-hop scenario: A↔B↔C↔D (maxHops=3)
// ---------------------------------------------------------------------------

test("N-hop: message from A reaches D through B and C (3 hops, maxHops=3)", () => {
  const routerB = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 3 });
  const routerC = new MeshRouter({ localPeerId: "nodeC", defaultMaxHops: 3 });
  const routerD = new MeshRouter({ localPeerId: "nodeD", defaultMaxHops: 3 });

  // A originates a message (no relay field).
  const origMsg = { msgId: "n-hop-test", kind: "dmesh-msg", ts: Date.now() };

  // B receives from A.
  const msgAtB = { ...origMsg };
  assertTrue(routerB.shouldForward(msgAtB, "nodeA"), "B forwards");
  assertEqual(msgAtB.relay.hops, 1, "hops at B");

  // C receives the copy from B.
  const msgAtC = { ...msgAtB };
  assertTrue(routerC.shouldForward(msgAtC, "nodeB"), "C forwards");
  assertEqual(msgAtC.relay.hops, 2, "hops at C");

  // D receives the copy from C.
  const msgAtD = { ...msgAtC };
  // D is at hops=2, maxHops=3 → budget not exhausted, but D is the recipient.
  // shouldForward controls re-relaying; delivery is always accepted by the caller.
  // Whether D forwards further: hops=2 < maxHops=3, but D has no more peers.
  assertTrue(routerD.shouldForward(msgAtD, "nodeC"), "D can still forward (budget not yet exhausted)");
  assertEqual(msgAtD.relay.hops, 3, "hops at D");
});

test("N-hop: route-advert propagation enables unicast routing", () => {
  // Topology: A — B — C — D
  // We simulate B and C exchanging route advertisements so B knows about D.
  const routerB = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 3 });
  const routerC = new MeshRouter({ localPeerId: "nodeC", defaultMaxHops: 3 });

  // C knows D directly (1 hop).
  routerC.routeTable.update("nodeD", "nodeD", 1);

  // C broadcasts a route advertisement; B processes it.
  const advertFromC = routerC.createRouteAdvert();
  routerB.processRouteAdvert(advertFromC, "nodeC");

  // B should now know nodeD via nodeC (2 hops).
  const route = routerB.routeTable.getBestRoute("nodeD");
  assertEqual(route.via, "nodeC", "B routes to D via C");
  assertEqual(route.hops, 2, "B sees D at 2 hops");

  // When B needs to forward a message for D, it should unicast to nodeC.
  const msg = makeMsg({ rcpt: "nodeD" });
  routerB.shouldForward({ ...msg }, "nodeA"); // consume from seen-map
  const peers = routerB.selectOutboundPeers(["nodeA", "nodeC"], "nodeA", msg);
  assertDeepEqual(peers, ["nodeC"], "unicast to nodeC");
});

test("N-hop: seen-map prevents re-relay loop across mesh", () => {
  // A — B — C; C is also connected back to A (triangle).
  // Message originated by A should not be re-forwarded by C back to A/B.
  const routerB = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 3 });
  const routerC = new MeshRouter({ localPeerId: "nodeC", defaultMaxHops: 3 });

  const origMsg = { msgId: "loop-test", kind: "dmesh-msg", ts: Date.now() };

  // B receives from A and forwards to C.
  const msgAtB = { ...origMsg };
  assertTrue(routerB.shouldForward(msgAtB, "nodeA"), "B forwards");

  // C receives from B.
  const msgAtC = { ...msgAtB };
  assertTrue(routerC.shouldForward(msgAtC, "nodeB"), "C forwards first time");

  // Now imagine C also receives the same message from A (via the triangle path).
  const msgAtCDuplicate = { ...origMsg, relay: { via: "nodeA", hops: 1, maxHops: 3 } };
  assertFalse(routerC.shouldForward(msgAtCDuplicate, "nodeA"), "C suppresses duplicate");
});

// ---------------------------------------------------------------------------
// cleanup() also cleans route table
// ---------------------------------------------------------------------------

test("cleanup: removes expired routes from route table", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  const past = Date.now() - (ROUTER_DEFAULTS.ROUTE_TTL_MS + 1000);
  router.routeTable.update("nodeX", "nodeA", 1, past);
  assertEqual(router.routeTable.size, 1, "before cleanup");
  router.cleanup(Date.now());
  assertEqual(router.routeTable.size, 0, "after cleanup");
});

test("reset: clears both seen-map and route table", () => {
  const router = new MeshRouter({ localPeerId: "nodeB" });
  router.shouldForward(makeMsg({ msgId: "r1" }));
  router.routeTable.update("nodeX", "nodeA", 1);
  router.reset();
  assertEqual(router.seenCount, 0, "seen cleared");
  assertEqual(router.routeTable.size, 0, "routes cleared");
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ mesh-router-phase2: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ mesh-router-phase2: ${name}`);
      console.error(`  ${err.message}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
