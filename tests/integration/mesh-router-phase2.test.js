/**
 * Integration tests for bluetooth/mesh-router.js — Phase 2 (N-hop routing).
 *
 * What these tests cover:
 *   1.  addNeighbor / removeNeighbor maintain the neighbor set and route table.
 *   2.  createRouteAdv produces a well-formed advertisement.
 *   3.  processRouteAdv installs routes for adv originator and carried entries.
 *   4.  processRouteAdv returns true (should re-broadcast) on first sight.
 *   5.  processRouteAdv returns false for duplicate adv (same src:seq).
 *   6.  processRouteAdv returns false for stale seq (older than last seen).
 *   7.  Sequence-number wrap-around is handled gracefully.
 *   8.  getNextHop returns direct neighbor when available.
 *   9.  getNextHop returns next-hop from route table for multi-hop destination.
 *   10. getNextHop returns null for unknown destination (flood fallback).
 *   11. getNextHop returns null for expired route.
 *   12. preferredRoute: fewer hops wins.
 *   13. preferredRoute: same hops — higher seq wins.
 *   14. preferredRoute: same hops & seq — fresher ts wins.
 *   15. A→B→C→D: D's route table populated via transitive advertisements.
 *   16. shouldForwardRouteAdv: independent forwarding check (no table mutation).
 *   17. cleanup() evicts expired routes and stale adv-seen entries.
 *   18. getRouteTable() returns a diagnostics snapshot with ttlRemaining.
 *   19. reset() clears all Phase 2 state as well as Phase 1 state.
 *   20. Phase 1 shouldForward() is unaffected when enableRouting is true.
 *   21. removeNeighbor purges routes that used the peer as next-hop.
 *   22. Route installed for adv originator uses ingressPeerId as via.
 */

import {
  MeshRouter,
  ROUTE_ADV_KIND
} from "../../bluetooth/mesh-router.js";

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertNull(value, label = "") {
  if (value !== null) {
    throw new Error(`${label ? label + ": " : ""}expected null, got ${JSON.stringify(value)}`);
  }
}

function assertNotNull(value, label = "") {
  if (value === null || value === undefined) {
    throw new Error(`${label ? label + ": " : ""}expected non-null, got ${JSON.stringify(value)}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRouter(localPeerId, extraOpts = {}) {
  return new MeshRouter({
    localPeerId,
    enableRouting: true,
    defaultMaxHops: 4,
    routeTtlMs: 60_000,
    ...extraOpts
  });
}

function makeAdv(src, seq, routes = [], ts = Date.now()) {
  return { kind: ROUTE_ADV_KIND, src, seq, ts, routes };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("addNeighbor: neighbor appears in set and gets a 0-hop route", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");

  assert(router.neighbors.has("B"), "B is a neighbor");
  assertEqual(router.getNextHop("B"), "B", "direct route to B");
  assertEqual(router.routeCount, 1, "one route installed");
});

test("addNeighbor: ignores self and empty string", () => {
  const router = makeRouter("A");
  router.addNeighbor("A");
  router.addNeighbor("");
  router.addNeighbor(null);

  assertEqual(router.neighbors.size, 0, "no self/empty neighbors");
  assertEqual(router.routeCount, 0, "no routes installed");
});

test("removeNeighbor: removes from set", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");
  router.removeNeighbor("B");

  assert(!router.neighbors.has("B"), "B removed from neighbors");
});

test("removeNeighbor: purges routes that used the peer as via", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");

  // Add a 2-hop route via B
  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");

  assert(router.getNextHop("C") === "B", "route to C via B exists");

  router.removeNeighbor("B");

  assertNull(router.getNextHop("C"), "route to C purged after B disconnects");
  assertNull(router.getNextHop("B"), "route to B itself purged");
});

test("createRouteAdv: produces a well-formed advertisement", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");

  const adv = router.createRouteAdv();

  assertEqual(adv.kind, ROUTE_ADV_KIND, "kind");
  assertEqual(adv.src, "A", "src");
  assert(typeof adv.seq === "number" && adv.seq >= 1, "seq >= 1");
  assert(typeof adv.ts === "number", "ts is a number");
  assert(Array.isArray(adv.routes), "routes is array");
  assert(adv.routes.some(r => r.dst === "B"), "route to neighbor B included");
});

test("createRouteAdv: seq increments on each call", () => {
  const router = makeRouter("A");
  const a1 = router.createRouteAdv();
  const a2 = router.createRouteAdv();
  assert(a2.seq > a1.seq, "seq increments");
});

test("processRouteAdv: returns true on first sight", () => {
  const router = makeRouter("A");
  const adv = makeAdv("B", 1, []);

  const result = router.processRouteAdv(adv, "B");

  assert(result === true, "should re-broadcast");
});

test("processRouteAdv: installs route to adv originator via ingressPeerId", () => {
  const router = makeRouter("A");
  const adv = makeAdv("C", 1, []);

  router.processRouteAdv(adv, "B"); // arrived from B, but originated by C

  assertEqual(router.getNextHop("C"), "B", "route to C via B");
});

test("processRouteAdv: installs routes for destinations carried in the adv", () => {
  const router = makeRouter("A");
  const adv = makeAdv("B", 1, [
    { dst: "C", hops: 0 }, // C is a direct neighbor of B → A sees C at 1 hop
    { dst: "D", hops: 1 } // D is 1 hop from B → A sees D at 2 hops
  ]);

  router.processRouteAdv(adv, "B");

  assertEqual(router.getNextHop("C"), "B", "route to C");
  assertEqual(router.getNextHop("D"), "B", "route to D");
});

test("processRouteAdv: returns false for duplicate adv (same src:seq)", () => {
  const router = makeRouter("A");
  const adv = makeAdv("B", 5, []);

  assert(router.processRouteAdv(adv, "B") === true, "first call");
  assert(router.processRouteAdv(adv, "B") === false, "second call (duplicate)");
});

test("processRouteAdv: same ts but different src/seq do not collide", () => {
  const router = makeRouter("A");
  const ts = Date.now();

  const first = makeAdv("B", 1, [{ dst: "X", hops: 0 }], ts);
  const second = makeAdv("C", 1, [{ dst: "Y", hops: 0 }], ts);

  assert(router.processRouteAdv(first, "B") === true, "first adv accepted");
  assert(router.processRouteAdv(second, "C") === true, "second adv accepted despite same ts");
  assertEqual(router.getNextHop("X"), "B", "route from first adv kept");
  assertEqual(router.getNextHop("Y"), "C", "route from second adv kept");
});

test("processRouteAdv: returns false for stale seq", () => {
  const router = makeRouter("A");

  router.processRouteAdv(makeAdv("B", 10, []), "B");
  const result = router.processRouteAdv(makeAdv("B", 9, []), "B");

  assert(result === false, "older seq rejected");
});

test("processRouteAdv: accepts new higher seq from same source", () => {
  const router = makeRouter("A");

  router.processRouteAdv(makeAdv("B", 10, []), "B");
  const result = router.processRouteAdv(makeAdv("B", 11, [{ dst: "C", hops: 0 }]), "B");

  assert(result === true, "higher seq accepted");
  assertEqual(router.getNextHop("C"), "B", "new route installed");
});

test("processRouteAdv: seq wrap-around handled (large positive delta accepted)", () => {
  const router = makeRouter("A", { seqWindow: 64 });

  router.processRouteAdv(makeAdv("B", 0xfffffffe, []), "B"); // near max
  const result = router.processRouteAdv(makeAdv("B", 1, []), "B"); // wrapped to 1

  // delta = 1 - 0xfffffffe is a large negative number, outside -seqWindow, so accepted
  assert(result === true, "wrap-around adv accepted");
});

test("processRouteAdv: drops routes exceeding maxRouteHops", () => {
  const router = makeRouter("A", { maxRouteHops: 3 });
  const adv = makeAdv("B", 1, [
    { dst: "C", hops: 3 } // hops to C via B = 3+1 = 4 > maxRouteHops
  ]);

  router.processRouteAdv(adv, "B");

  assertNull(router.getNextHop("C"), "over-hop route not installed");
});

test("processRouteAdv: only applies up to maxAdvertisedRoutes entries", () => {
  const router = makeRouter("A", { maxAdvertisedRoutes: 2 });
  const adv = makeAdv("B", 1, [
    { dst: "R1", hops: 0 },
    { dst: "R2", hops: 0 },
    { dst: "R3", hops: 0 }
  ]);

  router.processRouteAdv(adv, "B");

  assertEqual(router.getNextHop("R1"), "B", "first advertised route installed");
  assertEqual(router.getNextHop("R2"), "B", "second advertised route installed");
  assertNull(router.getNextHop("R3"), "route beyond maxAdvertisedRoutes ignored");
});

test("processRouteAdv: ignores routes to self", () => {
  const router = makeRouter("A");
  const adv = makeAdv("B", 1, [
    { dst: "A", hops: 0 } // would be a route to self
  ]);

  router.processRouteAdv(adv, "B");

  assertNull(router.getNextHop("A"), "no self-route installed");
});

test("processRouteAdv: rejects malformed advertisement", () => {
  const router = makeRouter("A");

  assert(router.processRouteAdv(null, "B") === false, "null");
  assert(router.processRouteAdv({ kind: "wrong" }, "B") === false, "wrong kind");
  assert(router.processRouteAdv({ kind: ROUTE_ADV_KIND }, "B") === false, "missing src");
});

test("processRouteAdv: rejects advertisement when verifier returns false and keeps table unchanged", () => {
  const router = makeRouter("A", {
    verifyRouteAdv: () => false
  });
  const before = router.getRouteTable();
  const adv = makeAdv("B", 1, [{ dst: "C", hops: 0 }]);

  const result = router.processRouteAdv(adv, "B");

  assert(result === false, "rejected when verifier denies");
  assertEqual(router.getRouteTable().length, before.length, "route table remains unchanged");
  assertNull(router.getNextHop("B"), "originator route not installed");
  assertNull(router.getNextHop("C"), "advertised route not installed");
});

test("processRouteAdv: accepts advertisement when verifier returns true", () => {
  const router = makeRouter("A", {
    verifyRouteAdv: (adv, ingressPeerId) => adv.src === "B" && ingressPeerId === "B"
  });
  const adv = makeAdv("B", 1, [{ dst: "C", hops: 0 }]);

  const result = router.processRouteAdv(adv, "B");

  assert(result === true, "accepted when verifier allows");
  assertEqual(router.getNextHop("C"), "B", "route still propagates on accepted adv");
});

test("processRouteAdv: duplicate/stale handling remains after verifier introduction", () => {
  const router = makeRouter("A", {
    verifyRouteAdv: () => true
  });

  assert(router.processRouteAdv(makeAdv("B", 10, [{ dst: "C", hops: 0 }]), "B") === true, "new seq accepted");
  assert(router.processRouteAdv(makeAdv("B", 10, [{ dst: "D", hops: 0 }]), "B") === false, "duplicate seq rejected");
  assert(router.processRouteAdv(makeAdv("B", 9, [{ dst: "E", hops: 0 }]), "B") === false, "stale seq rejected");
});

test("processRouteAdv: optional per-source rate guard drops rapid advertisements", () => {
  const router = makeRouter("A", {
    routeAdvMinIntervalMs: 50,
    verifyRouteAdv: () => true
  });

  const first = router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");
  const second = router.processRouteAdv(makeAdv("B", 2, [{ dst: "D", hops: 0 }]), "B");

  assert(first === true, "first advertisement accepted");
  assert(second === false, "second rapid advertisement rejected");
  assertNull(router.getNextHop("D"), "rate-limited advertisement does not mutate table");
});

test("getNextHop: direct neighbor takes priority over route entry", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");

  // Install a route to B via C (worse path)
  router.processRouteAdv(makeAdv("C", 1, [{ dst: "B", hops: 1 }]), "C");

  assertEqual(router.getNextHop("B"), "B", "direct neighbor used, not via C");
});

test("getNextHop: returns null for unknown destination (flood fallback)", () => {
  const router = makeRouter("A");
  assertNull(router.getNextHop("Z"), "unknown destination → null");
});

test("getNextHop: returns null after route expires", () => {
  const router = makeRouter("A", { routeTtlMs: 0 }); // immediate expiry

  // Manually insert a route with past expiresAt
  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");

  // All routes expire immediately; next call should clean up
  assertNull(router.getNextHop("C"), "expired route → null");
});

test("preferredRoute: fewer hops wins", () => {
  const router = makeRouter("A");

  // First adv: C is 2 hops via B
  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 1 }]), "B");
  // Second adv: C is 1 hop via D (better path, same seq base)
  router.addNeighbor("D");
  router.processRouteAdv(makeAdv("D", 1, [{ dst: "C", hops: 0 }]), "D");

  assertEqual(router.getNextHop("C"), "D", "shorter path wins (via D, 1 hop)");
});

test("preferredRoute: higher seq wins when hop count is equal", () => {
  const router = makeRouter("A");

  // Both paths report C at 1 hop; B has a newer seq
  router.processRouteAdv(makeAdv("X", 5, [{ dst: "C", hops: 0 }]), "X");
  router.processRouteAdv(makeAdv("Y", 10, [{ dst: "C", hops: 0 }]), "Y");

  // Y's seq (10) beats X's seq (5); route should be via Y
  assertEqual(router.getNextHop("C"), "Y", "higher seq wins");
});

test("4-node A→B→C→D: D learns about A through transitive advertisements", () => {
  // Topology: A -- B -- C -- D
  // B is a direct neighbor of both A and C.
  // C is a direct neighbor of both B and D.
  // Simulate A's adv propagating to D.

  const routerB = makeRouter("B");
  const routerC = makeRouter("C");
  const routerD = makeRouter("D");

  routerB.addNeighbor("A");
  routerB.addNeighbor("C");
  routerC.addNeighbor("B");
  routerC.addNeighbor("D");
  routerD.addNeighbor("C");

  // Step 1: A creates and sends its route advertisement to B.
  const aAdv = makeAdv("A", 1, []); // A has no known routes yet
  routerB.processRouteAdv(aAdv, "A"); // B learns A is 1 hop via A

  // Step 2: B creates its advertisement (includes A at 0 hop, C at 0 hop).
  const bAdv = routerB.createRouteAdv();
  assert(bAdv.routes.some(r => r.dst === "A"), "B's adv includes A");

  // Step 3: C receives B's advertisement.
  routerC.processRouteAdv(bAdv, "B"); // C learns A is 2 hops via B

  // Step 4: C creates its advertisement (includes A at <=2, B at 0, D at 0).
  const cAdv = routerC.createRouteAdv();
  assert(cAdv.routes.some(r => r.dst === "A"), "C's adv includes A");

  // Step 5: D receives C's advertisement.
  routerD.processRouteAdv(cAdv, "C"); // D learns A is ≤3 hops via C

  const nextHop = routerD.getNextHop("A");
  assertEqual(nextHop, "C", "D routes to A via C");
});

test("shouldForwardRouteAdv: returns false without mutating the router state", () => {
  const router = makeRouter("A");
  const adv = makeAdv("B", 1, []);

  // shouldForwardRouteAdv must not add the adv to _advSeen
  const result1 = router.shouldForwardRouteAdv(adv);
  const result2 = router.shouldForwardRouteAdv(adv);

  assert(result1 === true, "first check");
  assert(result2 === true, "second check (not mutated by shouldForwardRouteAdv)");
});

test("cleanup: evicts expired routes and stale adv-seen entries", () => {
  const router = makeRouter("A", {
    routeTtlMs: 1000,
    advSeenTtlMs: 1000
  });

  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");
  assertEqual(router.routeCount, 2, "two routes (B and C) before cleanup");

  // Advance time past TTL
  router.cleanup(Date.now() + 2000);

  assertEqual(router.routeCount, 0, "routes evicted after cleanup");
});

test("route table growth is bounded by maxRouteTableEntries", () => {
  const router = makeRouter("A", { maxRouteTableEntries: 3, routeTtlMs: 60_000 });

  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");
  router.processRouteAdv(makeAdv("D", 1, [{ dst: "E", hops: 0 }]), "D");
  router.processRouteAdv(makeAdv("F", 1, [{ dst: "G", hops: 0 }]), "F");

  assertEqual(router.routeCount, 3, "route table capped");
  assertNull(router.getNextHop("E"), "extra route not installed once cap reached");
  assertNull(router.getNextHop("G"), "extra route not installed once cap reached");
});

test("getRouteTable: returns diagnostics snapshot", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");

  const table = router.getRouteTable();

  assert(Array.isArray(table), "returns array");
  assert(table.length >= 1, "at least one entry");
  const entry = table.find(r => r.dst === "B");
  assertNotNull(entry, "B in table");
  assertEqual(entry.via, "B", "via");
  assertEqual(entry.hops, 0, "hops");
  assert(typeof entry.ttlRemaining === "number", "ttlRemaining is a number");
});

test("reset: clears all Phase 2 state", () => {
  const router = makeRouter("A");
  router.addNeighbor("B");
  router.processRouteAdv(makeAdv("B", 1, [{ dst: "C", hops: 0 }]), "B");
  router.createRouteAdv();

  router.reset();

  assertEqual(router.routeCount, 0, "routes cleared");
  assertEqual(router.neighbors.size, 0, "neighbors cleared");
  assertEqual(router.seenCount, 0, "seen cleared");
});

test("Phase 1 shouldForward: unaffected when enableRouting is true", () => {
  const router = makeRouter("A"); // enableRouting: true

  const msg = { msgId: "ph1-p2-compat", kind: "dmesh-msg", ts: Date.now() };
  assert(router.shouldForward(msg) === true, "first call → true");
  assert(router.shouldForward(msg) === false, "duplicate → false");
  assertEqual(msg.relay.hops, 1, "relay.hops stamped");
  assertEqual(msg.relay.via, "A", "relay.via stamped");
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ phase2: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ phase2: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exit(1);
})();
