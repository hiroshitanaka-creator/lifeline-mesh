import { createMeshRuntime } from "../../app/src/runtime-mesh.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ─── Legacy single-link API (backward compatibility) ──────────────────────────

test("runtime mesh: connection updates neighbor state (legacy onConnectionChange)", () => {
  const runtime = createMeshRuntime("node-local");

  runtime.onConnectionChange(true, { id: "peer-b" });
  let snapshot = runtime.getSnapshot();
  assert(snapshot.connectedPeerId === "peer-b", "connected peer ID tracked");
  assert(snapshot.neighborCount === 1, "neighbor added to router");

  runtime.onConnectionChange(false, { id: "peer-b" });
  snapshot = runtime.getSnapshot();
  assert(snapshot.connectedPeerId === null, "connected peer cleared on disconnect");
  assert(snapshot.neighborCount === 0, "neighbor removed on disconnect");
});

test("runtime mesh: relay callback is ingress-only in single-link runtime", async () => {
  const runtime = createMeshRuntime("node-b");

  const mgr = { sendMessage: () => Promise.resolve() };
  runtime.addLink("peer-c", mgr);

  const result = await runtime.onForward({
    message: { msgId: "relay-1", rcpt: "peer-c" },
    ingressPeerId: "peer-c"
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "single-link runtime skips relay");
  assert(result.reason === "ingress-only-link", "skip reason captures single-link ingress reality");
  assert(snapshot.skipped === 1, "skipped counter increments");
});

test("runtime mesh: relay callback marks no-connected-peer before any BLE link", async () => {
  const runtime = createMeshRuntime("node-cold-start");

  const result = await runtime.onForward({
    message: { msgId: "relay-cold-start" },
    ingressPeerId: "peer-any"
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "relay should be skipped before connection");
  assert(result.reason === "no-connected-peer", "reason reflects startup/offline condition");
  assert(snapshot.relayAttempts === 1, "relay attempts counter increments");
  assert(snapshot.skipped === 1, "skipped counter increments");
  assert(snapshot.lastRelay?.msgId === "relay-cold-start", "last relay stores msg id");
});

test("runtime mesh: relay callback skips ingress-only links", async () => {
  const runtime = createMeshRuntime("node-b");
  const mgr = { sendMessage: () => Promise.resolve() };
  runtime.addLink("peer-a", mgr);

  const result = await runtime.onForward({
    message: { msgId: "relay-2" },
    ingressPeerId: "peer-a"
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "skip action recorded");
  assert(result.reason === "ingress-only-link", "skip reason identifies ingress-only path");
  assert(snapshot.skipped === 1, "skipped counter increments");
});

// ─── Multi-link API ───────────────────────────────────────────────────────────

test("runtime mesh multi-link: addLink registers both peers, routing enabled", () => {
  const runtime = createMeshRuntime("relay-node");
  const mgrA = { sendMessage: () => Promise.resolve() };
  const mgrB = { sendMessage: () => Promise.resolve() };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);

  const snapshot = runtime.getSnapshot();
  assert(snapshot.linkCount === 2, "both links registered");
  assert(snapshot.links.includes("peer-a"), "link-a present");
  assert(snapshot.links.includes("peer-b"), "link-b present");
  assert(snapshot.neighborCount === 2, "both neighbors added to router");
  assert(snapshot.routingEnabled === true, "Phase 2 routing enabled with 2+ links");

  runtime.destroy();
});

test("runtime mesh multi-link: message from link-A forwarded to link-B only", async () => {
  const runtime = createMeshRuntime("relay-node");

  const sentByA = [];
  const sentByB = [];
  const mgrA = { sendMessage: (m) => { sentByA.push(m); return Promise.resolve(); } };
  const mgrB = { sendMessage: (m) => { sentByB.push(m); return Promise.resolve(); } };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);

  const msg = { kind: "dmesh-msg", msgId: "multi-fwd-1", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };

  // Stamp relay metadata (as BLEManager would after shouldForward)
  const shouldFwd = runtime.router.shouldForward(msg, "peer-a");
  assert(shouldFwd, "router should forward");

  const result = await runtime.onForward({ message: msg, ingressPeerId: "peer-a" });

  assert(result.action === "forwarded", "action is forwarded");
  assert(Array.isArray(result.forwardedTo), "forwardedTo is array");
  assert(result.forwardedTo.includes("peer-b"), "forwarded to peer-b");
  assert(!result.forwardedTo.includes("peer-a"), "not sent back to ingress peer-a");
  assert(sentByB.length === 1, "link-B received exactly one message");
  assert(sentByA.length === 0, "link-A did not receive the forwarded message");

  const snapshot = runtime.getSnapshot();
  assert(snapshot.relayedCount === 1, "relayedCount incremented");

  runtime.destroy();
});

test("runtime mesh multi-link: known route prefers getNextHop over egress flood", async () => {
  const runtime = createMeshRuntime("relay-node");

  const sentByB = [];
  const sentByD = [];
  const mgrA = { sendMessage: () => Promise.resolve() };
  const mgrB = { sendMessage: (m) => { sentByB.push(m); return Promise.resolve(); } };
  const mgrD = { sendMessage: (m) => { sentByD.push(m); return Promise.resolve(); } };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);
  runtime.addLink("peer-d", mgrD);

  runtime.router.processRouteAdv(
    { kind: "dmesh-route-adv", src: "peer-c", seq: 1, ts: Date.now(), routes: [] },
    "peer-b"
  );

  const msg = { kind: "dmesh-msg", msgId: "route-known-1", rcpt: "peer-c", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };
  const shouldFwd = runtime.router.shouldForward(msg, "peer-a");
  assert(shouldFwd, "router should forward");

  const result = await runtime.onForward({ message: msg, ingressPeerId: "peer-a" });
  assert(result.routing === "known-route", "known route branch is used");
  assert(result.nextHop === "peer-b", "next hop selected from router");
  assert(result.forwardedTo.length === 1 && result.forwardedTo[0] === "peer-b", "forwarded only to preferred next-hop");
  assert(sentByB.length === 1, "preferred next-hop received message");
  assert(sentByD.length === 0, "other egress link not flooded");

  runtime.destroy();
});

test("runtime mesh multi-link: unknown route falls back to egress flood", async () => {
  const runtime = createMeshRuntime("relay-node");

  const sentByB = [];
  const sentByD = [];
  const mgrA = { sendMessage: () => Promise.resolve() };
  const mgrB = { sendMessage: (m) => { sentByB.push(m); return Promise.resolve(); } };
  const mgrD = { sendMessage: (m) => { sentByD.push(m); return Promise.resolve(); } };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);
  runtime.addLink("peer-d", mgrD);

  const msg = { kind: "dmesh-msg", msgId: "route-unknown-1", rcpt: "peer-z", ts: Date.now(), relay: { hops: 0, maxHops: 3 } };
  const shouldFwd = runtime.router.shouldForward(msg, "peer-a");
  assert(shouldFwd, "router should forward");

  const result = await runtime.onForward({ message: msg, ingressPeerId: "peer-a" });
  assert(result.routing === "unknown-route-fallback", "unknown route uses flood fallback");
  assert(result.nextHop === null, "next hop is unknown");
  assert(result.forwardedTo.includes("peer-b"), "fallback flood includes peer-b");
  assert(result.forwardedTo.includes("peer-d"), "fallback flood includes peer-d");
  assert(sentByB.length === 1, "peer-b got flooded message");
  assert(sentByD.length === 1, "peer-d got flooded message");

  runtime.destroy();
});

test("runtime mesh multi-link: removeLink reduces linkCount", () => {
  const runtime = createMeshRuntime("relay-node");
  const mgr = { sendMessage: () => Promise.resolve() };

  runtime.addLink("peer-a", mgr);
  runtime.addLink("peer-b", mgr);
  assert(runtime.getSnapshot().linkCount === 2, "two links active");

  runtime.removeLink("peer-a");
  const snapshot = runtime.getSnapshot();
  assert(snapshot.linkCount === 1, "one link after removal");
  assert(!snapshot.links.includes("peer-a"), "peer-a removed");
  assert(snapshot.links.includes("peer-b"), "peer-b remains");
  assert(snapshot.connectedPeerId === "peer-b", "connectedPeerId updated to remaining link");

  runtime.destroy();
});

test("runtime mesh multi-link: route adv broadcast reaches all links", async () => {
  const runtime = createMeshRuntime("relay-node");

  const sentByA = [];
  const sentByB = [];
  const mgrA = { sendMessage: (m) => { sentByA.push(m); return Promise.resolve(); } };
  const mgrB = { sendMessage: (m) => { sentByB.push(m); return Promise.resolve(); } };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);

  await runtime.broadcastRouteAdv();

  assert(sentByA.some(m => m.kind === "dmesh-route-adv"), "link-A received route adv");
  assert(sentByB.some(m => m.kind === "dmesh-route-adv"), "link-B received route adv");

  const snapshot = runtime.getSnapshot();
  assert(snapshot.routeAdvBroadcasts >= 1, "routeAdvBroadcasts counter incremented");

  runtime.destroy();
});

test("runtime mesh multi-link: incoming route adv re-broadcast to egress links", async () => {
  const runtime = createMeshRuntime("relay-node");

  const sentByA = [];
  const sentByB = [];
  const mgrA = { sendMessage: (m) => { sentByA.push(m); return Promise.resolve(); } };
  const mgrB = { sendMessage: (m) => { sentByB.push(m); return Promise.resolve(); } };

  runtime.addLink("peer-a", mgrA);
  runtime.addLink("peer-b", mgrB);

  const adv = { kind: "dmesh-route-adv", src: "far-away-node", seq: 7, ts: Date.now(), routes: [] };
  const result = await runtime.onForward({ message: adv, ingressPeerId: "peer-a" });

  assert(result.action === "rebroadcast-route-adv", "adv should be re-broadcast");
  assert(result.forwardedTo.includes("peer-b"), "adv forwarded to peer-b");
  assert(!result.forwardedTo.includes("peer-a"), "adv NOT sent back to ingress");
  assert(sentByB.some(m => m.kind === "dmesh-route-adv"), "link-B got the adv");

  runtime.destroy();
});

test("runtime mesh multi-link: getSnapshot includes all multi-link fields", () => {
  const runtime = createMeshRuntime("snap-node");
  const mgr = { sendMessage: () => Promise.resolve() };
  runtime.addLink("peer-x", mgr);
  runtime.addLink("peer-y", mgr);

  const snap = runtime.getSnapshot();
  assert("linkCount" in snap, "snapshot has linkCount");
  assert("links" in snap, "snapshot has links array");
  assert("relayedCount" in snap, "snapshot has relayedCount");
  assert("routeAdvBroadcasts" in snap, "snapshot has routeAdvBroadcasts");
  assert("routingEnabled" in snap, "snapshot has routingEnabled");
  assert("routeTable" in snap, "snapshot has routeTable");

  runtime.destroy();
});

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
    }
  }

  console.log(`\napp-runtime-mesh integration: ${passed}/${tests.length} passed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
