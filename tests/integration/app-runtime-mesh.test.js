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

test("runtime mesh: relay callback is ingress-only in single-link runtime", async () => {
  const runtime = createMeshRuntime("node-b");
  runtime.onConnectionChange(true, { id: "peer-c" });

  const result = await runtime.onForward({
    message: { msgId: "relay-1", rcpt: "peer-c" },
    ingressPeerId: "peer-c"
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "single-link runtime skips relay");
  assert(result.reason === "ingress-only-link", "skip reason captures single-link ingress reality");
  assert(snapshot.skipped === 1, "skipped counter increments");
});

test("runtime mesh: relay callback skips ingress-only links", async () => {
  const runtime = createMeshRuntime("node-b");
  runtime.onConnectionChange(true, { id: "peer-a" });

  const result = await runtime.onForward({
    message: { msgId: "relay-2" },
    ingressPeerId: "peer-a"
  });

  const snapshot = runtime.getSnapshot();
  assert(result.action === "skipped", "skip action recorded");
  assert(result.reason === "ingress-only-link", "skip reason identifies ingress-only path");
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
