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

test("runtime mesh: connection updates neighbor state", () => {
  const runtime = createMeshRuntime("node-local");

  runtime.onConnectionChange(true, { id: "peer-b" });
  let snapshot = runtime.getSnapshot();
  assert(snapshot.connectedPeerId === "peer-b", "connected peer ID tracked");
  assert(snapshot.neighborCount === 1, "neighbor added to router");

  runtime.onConnectionChange(false, null);
  snapshot = runtime.getSnapshot();
  assert(snapshot.connectedPeerId === null, "connected peer cleared on disconnect");
  assert(snapshot.neighborCount === 0, "neighbor removed on disconnect");
});

test("runtime mesh: relay callback forwards when egress differs from ingress", async () => {
  const runtime = createMeshRuntime("node-b");
  runtime.onConnectionChange(true, { id: "peer-c" });

  const forwarded = [];
  const result = await runtime.onForward({
    message: { msgId: "relay-1", rcpt: "peer-c" },
    ingressPeerId: "peer-a",
    sendRelay: (message) => {
      forwarded.push(message.msgId);
    }
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "relayed", "relay action recorded");
  assert(forwarded.length === 1, "message forwarded once");
  assert(snapshot.relayed === 1, "relayed counter increments");
});

test("runtime mesh: relay callback skips ingress-only links", async () => {
  const runtime = createMeshRuntime("node-b");
  runtime.onConnectionChange(true, { id: "peer-a" });

  let sendCount = 0;
  const result = await runtime.onForward({
    message: { msgId: "relay-2" },
    ingressPeerId: "peer-a",
    sendRelay: () => {
      sendCount += 1;
    }
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "skip action recorded");
  assert(result.reason === "ingress-only-link", "skip reason identifies ingress-only path");
  assert(sendCount === 0, "no relay send is attempted");
  assert(snapshot.skipped === 1, "skipped counter increments");
});

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
