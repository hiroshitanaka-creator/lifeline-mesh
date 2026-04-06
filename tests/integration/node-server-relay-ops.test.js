import { parseRelayAdminArgs, formatRelayStatus } from "../../node-server/relay-ops.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

test("relay ops: default mode serves and signals are enabled", () => {
  const parsed = parseRelayAdminArgs([]);
  assert(parsed.mode === "serve", "default mode should be serve");
  assert(parsed.signalsEnabled === true, "signals should be enabled by default");
});

test("relay ops: cleanup mode is selected by cli flag", () => {
  const parsed = parseRelayAdminArgs(["--relay-cleanup"]);
  assert(parsed.mode === "cleanup", "cleanup mode should be selected");
});

test("relay ops: status mode can disable signal handlers", () => {
  const parsed = parseRelayAdminArgs(["--relay-status", "--no-relay-signals"]);
  assert(parsed.mode === "status", "status mode should be selected");
  assert(parsed.signalsEnabled === false, "signals should be disabled");
});

test("relay ops: status output includes source and timestamp context", () => {
  const formatted = formatRelayStatus({ store: { pendingCount: 1 } }, { source: "test" });
  assert(formatted.mode === "single-client-relay", "relay mode should be included");
  assert(formatted.context.source === "test", "source should be propagated");
  assert(typeof formatted.context.generatedAt === "string", "timestamp should be included");
  assert(formatted.status.store.pendingCount === 1, "status payload should remain intact");
});


test("relay ops: diagnostics flag parses true values", () => {
  const parsed = parseRelayAdminArgs(["--relay-diag=true"]);
  assert(parsed.diagnosticsEnabled === true, "diagnostics should be enabled");
});

test("relay ops: diagnostics flag parses false values", () => {
  const parsed = parseRelayAdminArgs(["--diag", "off"]);
  assert(parsed.diagnosticsEnabled === false, "diagnostics should be disabled");
});

test("relay ops: manual smoke mode flag is exposed", () => {
  const parsed = parseRelayAdminArgs(["--manual-smoke"]);
  assert(parsed.manualSmoke === true, "manual smoke flag should be true");
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

  console.log(`\nnode-server-relay-ops integration: ${passed}/${tests.length} passed`);
  if (failed > 0) {
    process.exit(1);
  }
})();
