import { createRuntimeMeshWiring } from "../../app/src/runtime-mesh.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

class MockRouter {
  constructor(options = {}) {
    this.localPeerId = options.localPeerId || "unknown";
    this.seenCount = 0;
  }
}

class MockBleManager {
  constructor(options = {}) {
    this.transportManager = options.transportManager || null;
    this.router = options.router || null;
    this.device = null;
    this.sent = [];
    this.onForward = null;
  }

  sendMessage(message) {
    this.sent.push(message);
    return Promise.resolve();
  }
}

test("runtime wiring: createBleManager injects transportManager + router", () => {
  const transportManager = { sendWithFallback: () => Promise.resolve() };
  const wiring = createRuntimeMeshWiring({
    BLEManagerCtor: MockBleManager,
    MeshRouterCtor: MockRouter,
    transportManager,
    localPeerId: "node-b"
  });

  const manager = wiring.createBleManager();

  assert(manager.transportManager === transportManager, "transportManager injected");
  assert(manager.router instanceof MockRouter, "router injected");
  assert(typeof manager.onForward === "function", "onForward handler wired");
  assert(manager.router.localPeerId === "node-b", "router localPeerId initialized");
});

test("runtime relay path: no-egress is tracked when ingress is only connected peer", async () => {
  const wiring = createRuntimeMeshWiring({
    BLEManagerCtor: MockBleManager,
    MeshRouterCtor: MockRouter,
    localPeerId: "node-b",
    now: () => 1700000000000
  });
  const manager = wiring.createBleManager();
  manager.device = { id: "peer-a", name: "Peer A" };

  wiring.registerConnection(manager, true, manager.device);
  await manager.onForward({ msgId: "relay-001" }, "peer-a");

  assert(wiring.relayState.droppedNoEgressCount === 1, "drop counter increments");
  assert(wiring.relayState.lastRelayEvent === "no-egress-peer", "state records no-egress event");
  assert(wiring.relayState.lastForwardedMsgId === "relay-001", "state records forwarded msgId");
  assert(wiring.relayState.lastIngressPeerId === "peer-a", "state records ingress peer");
  assert(wiring.relayState.lastRelayAt === 1700000000000, "state records relay timestamp");
});

test("runtime relay path: forwards to non-ingress connected peers", async () => {
  const wiring = createRuntimeMeshWiring({
    BLEManagerCtor: MockBleManager,
    MeshRouterCtor: MockRouter,
    localPeerId: "node-b"
  });

  const ingressManager = wiring.createBleManager();
  ingressManager.device = { id: "peer-a", name: "Peer A" };
  wiring.registerConnection(ingressManager, true, ingressManager.device);

  const egressManager = wiring.createBleManager();
  egressManager.device = { id: "peer-c", name: "Peer C" };
  wiring.registerConnection(egressManager, true, egressManager.device);

  const relayed = { msgId: "relay-002" };
  await ingressManager.onForward(relayed, "peer-a");

  assert(egressManager.sent.length === 1, "egress peer receives one forwarded message");
  assert(egressManager.sent[0] === relayed, "forwarded object preserved");
  assert(wiring.relayState.forwardedCount === 1, "forward counter increments");
  assert(wiring.relayState.lastRelayEvent === "forwarded", "state records forwarded event");
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ runtime-mesh: ${name}`);
      passed += 1;
    } catch (error) {
      console.error(`✗ runtime-mesh: ${name}`);
      console.error(`  ${error.message}`);
      failed += 1;
    }
  }

  console.log("\n" + "=".repeat(40));
  console.log(`Tests: ${tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
})();
