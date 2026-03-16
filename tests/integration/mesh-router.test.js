/**
 * Integration tests for bluetooth/mesh-router.js (Phase 1: 1-hop relay).
 */

import { MeshRouter, ROUTER_DEFAULTS } from "../../bluetooth/mesh-router.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(overrides = {}) {
  return {
    msgId: `msg-${Math.random().toString(36).slice(2)}`,
    kind: "dmesh-msg",
    ts: Date.now(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("shouldForward: returns true and stamps relay metadata on first sight", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const msg = makeMsg({ msgId: "first-msg" });

  const result = router.shouldForward(msg);

  assertTrue(result, "shouldForward should return true");
  assertEqual(msg.relay.via, "nodeA", "relay.via");
  assertEqual(msg.relay.hops, 1, "relay.hops");
  assertEqual(msg.relay.maxHops, ROUTER_DEFAULTS.DEFAULT_MAX_HOPS, "relay.maxHops");
});

test("shouldForward: returns false for duplicate transferId", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const msg = makeMsg({ msgId: "dup-msg" });

  assertTrue(router.shouldForward(msg), "first call");
  assertFalse(router.shouldForward(msg), "second call (duplicate)");
});

test("shouldForward: returns false when hop budget is exhausted (hops === maxHops)", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const msg = makeMsg({
    msgId: "hop-limit-msg",
    relay: { via: "nodeB", hops: 1, maxHops: 1 }
  });

  assertFalse(router.shouldForward(msg), "hop budget exhausted");
});

test("shouldForward: allows relay when hops < maxHops", () => {
  const router = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 3 });
  const msg = makeMsg({
    msgId: "multi-hop-msg",
    relay: { via: "nodeA", hops: 1, maxHops: 3 }
  });

  assertTrue(router.shouldForward(msg), "hop within budget");
  assertEqual(msg.relay.hops, 2, "hops incremented");
  assertEqual(msg.relay.via, "nodeB", "via updated to local node");
});

test("shouldForward: treats missing relay as hops=0 / maxHops=defaultMaxHops", () => {
  const router = new MeshRouter({ localPeerId: "nodeC", defaultMaxHops: 1 });
  const msg = makeMsg({ msgId: "no-relay-msg" }); // no relay field

  assertTrue(router.shouldForward(msg), "message without relay should forward");
  assertEqual(msg.relay.hops, 1, "hops set to 1");
  assertEqual(msg.relay.maxHops, 1, "maxHops taken from defaultMaxHops");
});

test("shouldForward: returns false for null / non-object message", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  assertFalse(router.shouldForward(null), "null message");
  assertFalse(router.shouldForward(undefined), "undefined message");
  assertFalse(router.shouldForward("string"), "string message");
});

test("shouldForward: two distinct messages are forwarded independently", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const msg1 = makeMsg({ msgId: "m1" });
  const msg2 = makeMsg({ msgId: "m2" });

  assertTrue(router.shouldForward(msg1), "first message");
  assertTrue(router.shouldForward(msg2), "second message");
  assertEqual(router.seenCount, 2, "seenCount");
});

test("hasSeen: reflects seen state correctly", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  const msg = makeMsg({ msgId: "seen-check" });

  assertFalse(router.hasSeen("seen-check"), "not yet seen");
  router.shouldForward(msg);
  assertTrue(router.hasSeen("seen-check"), "now seen");
});

test("seenCount: increments on each new forward", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });
  assertEqual(router.seenCount, 0, "initial");

  router.shouldForward(makeMsg({ msgId: "sc-1" }));
  assertEqual(router.seenCount, 1, "after first");

  router.shouldForward(makeMsg({ msgId: "sc-2" }));
  assertEqual(router.seenCount, 2, "after second");
});

test("cleanup: removes entries older than seenTtlMs", () => {
  const router = new MeshRouter({ localPeerId: "nodeA", seenTtlMs: 1000 });

  const msgA = makeMsg({ msgId: "cleanup-a" });
  const msgB = makeMsg({ msgId: "cleanup-b" });

  router.shouldForward(msgA);
  router.shouldForward(msgB);
  assertEqual(router.seenCount, 2, "before cleanup");

  // Call cleanup with a future timestamp to expire both entries.
  router.cleanup(Date.now() + 2000);
  assertEqual(router.seenCount, 0, "after cleanup");
});

test("cleanup: retains entries younger than seenTtlMs", () => {
  const router = new MeshRouter({ localPeerId: "nodeA", seenTtlMs: 5000 });

  router.shouldForward(makeMsg({ msgId: "retain-a" }));
  router.shouldForward(makeMsg({ msgId: "retain-b" }));

  // Only 1 second has passed — nothing should be evicted.
  router.cleanup(Date.now() + 1000);
  assertEqual(router.seenCount, 2, "entries retained");
});

test("reset: clears all seen entries", () => {
  const router = new MeshRouter({ localPeerId: "nodeA" });

  router.shouldForward(makeMsg({ msgId: "reset-1" }));
  router.shouldForward(makeMsg({ msgId: "reset-2" }));
  assertEqual(router.seenCount, 2, "before reset");

  router.reset();
  assertEqual(router.seenCount, 0, "after reset");
});

test("3-node A↔B↔C relay scenario: message from A reaches C via B", () => {
  // Simulate: A sends msg, B relays to C.
  const routerB = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 1 });
  const routerC = new MeshRouter({ localPeerId: "nodeC", defaultMaxHops: 1 });

  // A originates a message (no relay field yet).
  const origMsg = { msgId: "relay-test", kind: "dmesh-msg", ts: Date.now() };

  // B receives from A and decides whether to relay.
  // Clone so mutations on B's copy don't affect original.
  const msgAtB = { ...origMsg };
  const bForwards = routerB.shouldForward(msgAtB, "nodeA");
  assertTrue(bForwards, "B should forward message from A");
  assertEqual(msgAtB.relay.hops, 1);
  assertEqual(msgAtB.relay.via, "nodeB");

  // C receives the relayed copy from B.
  const msgAtC = { ...msgAtB };
  const cForwards = routerC.shouldForward(msgAtC, "nodeB");
  // C's hop budget is maxHops=1, hops=1 — already at limit, should NOT forward further.
  assertFalse(cForwards, "C should not forward beyond maxHops");

  // Message delivery to C is handled by the caller (BLEManager inbox).
  // shouldForward only controls whether C re-relays; it does not track delivery.
  assertFalse(routerC.hasSeen("relay-test"), "hop-exhausted msg is not added to seen map");
});

test("duplicate suppression across relay chain: B never forwards the same msg twice", () => {
  const routerB = new MeshRouter({ localPeerId: "nodeB", defaultMaxHops: 2 });

  const msg1 = makeMsg({ msgId: "dup-relay-1" });
  const msg2 = { ...msg1 }; // same msgId, simulates retransmit from A

  assertTrue(routerB.shouldForward(msg1, "nodeA"), "first arrival");
  assertFalse(routerB.shouldForward(msg2, "nodeA"), "retransmit suppressed");
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ mesh-router: ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ mesh-router: ${name}`);
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
