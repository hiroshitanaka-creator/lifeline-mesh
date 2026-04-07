import {
  parseRelayAdminArgs,
  parseManualSmokeArgs,
  formatRelayStatus,
  resolveDiagnosticsEnabled,
  createSmokeOutput
} from "../../node-server/relay-ops.js";

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
  assert(parsed.diagnosticsSpecified === true, "diagnostics should be marked as specified");
  assert(parsed.diagnosticsEnabled === true, "diagnostics should be enabled");
});

test("relay ops: diagnostics flag parses false values", () => {
  const parsed = parseRelayAdminArgs(["--diag", "off"]);
  assert(parsed.diagnosticsSpecified === true, "diagnostics should be marked as specified");
  assert(parsed.diagnosticsEnabled === false, "diagnostics should be disabled");
});

test("relay ops: diagnostics is unspecified without cli flag", () => {
  const parsed = parseRelayAdminArgs([]);
  assert(parsed.diagnosticsSpecified === false, "diagnostics should be unspecified");
  assert(parsed.diagnosticsEnabled === false, "diagnostics defaults to false");
});

test("relay ops: manual smoke mode flag is exposed", () => {
  const parsed = parseRelayAdminArgs(["--manual-smoke"]);
  assert(parsed.manualSmoke === true, "manual smoke flag should be true");
});

test("relay ops: resolve diagnostics false when cli/env are unspecified", () => {
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: false,
    cliEnabled: false,
    envValue: undefined
  });
  assert(enabled === false, "unspecified diagnostics should default to false");
});

test("relay ops: resolve diagnostics true for cli --diag", () => {
  const parsed = parseRelayAdminArgs(["--diag"]);
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: parsed.diagnosticsSpecified,
    cliEnabled: parsed.diagnosticsEnabled,
    envValue: undefined
  });
  assert(enabled === true, "--diag should resolve true");
});

test("relay ops: cli false wins over env true", () => {
  const parsed = parseRelayAdminArgs(["--diag", "off"]);
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: parsed.diagnosticsSpecified,
    cliEnabled: parsed.diagnosticsEnabled,
    envValue: "1"
  });
  assert(enabled === false, "cli false must override env true");
});

test("relay ops: cli true wins over env false", () => {
  const parsed = parseRelayAdminArgs(["--relay-diag=true"]);
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: parsed.diagnosticsSpecified,
    cliEnabled: parsed.diagnosticsEnabled,
    envValue: "false"
  });
  assert(enabled === true, "cli true must override env false");
});

test("relay ops: env true applies when cli is unspecified", () => {
  const parsed = parseRelayAdminArgs([]);
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: parsed.diagnosticsSpecified,
    cliEnabled: parsed.diagnosticsEnabled,
    envValue: "true"
  });
  assert(enabled === true, "env true should enable diagnostics when cli is unspecified");
});

test("relay ops: env false applies when cli is unspecified", () => {
  const parsed = parseRelayAdminArgs([]);
  const enabled = resolveDiagnosticsEnabled({
    cliSpecified: parsed.diagnosticsSpecified,
    cliEnabled: parsed.diagnosticsEnabled,
    envValue: "off"
  });
  assert(enabled === false, "env false should disable diagnostics when cli is unspecified");
});


test("relay ops: manual smoke non-interactive defaults are stable", () => {
  const parsed = parseManualSmokeArgs([]);
  assert(parsed.nonInteractive === false, "manual smoke defaults to interactive");
  assert(parsed.timeoutMs === 15000, "default non-interactive timeout is stable");
  assert(parsed.expectClient === false, "client expectation defaults to false");
  assert(parsed.cleanup === false, "cleanup defaults to false");
  assert(parsed.jsonOutput === false, "json stdout defaults to false");
  assert(parsed.statusFile === null, "status file defaults to null");
});

test("relay ops: manual smoke parses non-interactive machine options", () => {
  const parsed = parseManualSmokeArgs([
    "--non-interactive",
    "--expect-client=true",
    "--timeout-ms",
    "22000",
    "--cleanup",
    "--json",
    "--status-file",
    "artifacts/real-bleno-smoke.json"
  ]);

  assert(parsed.nonInteractive === true, "non-interactive mode should be enabled");
  assert(parsed.expectClient === true, "expect client should parse from key=value");
  assert(parsed.timeoutMs === 22000, "timeout override should parse");
  assert(parsed.cleanup === true, "cleanup should be enabled");
  assert(parsed.jsonOutput === true, "json output should be enabled");
  assert(parsed.statusFile === "artifacts/real-bleno-smoke.json", "status output path should parse");
});


test("relay ops: smoke output routes human logs to stderr in json mode", () => {
  let stdoutText = "";
  let stderrText = "";

  const output = createSmokeOutput({
    jsonOutput: true,
    stdout: { write: (chunk) => { stdoutText += chunk; } },
    stderr: { write: (chunk) => { stderrText += chunk; } }
  });

  output.info("[Smoke] hello");
  output.warn("[Smoke] warn");
  output.jsonResult({ ok: true });

  assert(stdoutText.trim() === '{"ok":true}', "stdout should include only json result");
  assert(stderrText.includes("[Smoke] hello"), "info should be redirected to stderr in json mode");
  assert(stderrText.includes("[Smoke] warn"), "warn should be in stderr");
});

test("relay ops: smoke output keeps info logs on stdout when json mode is disabled", () => {
  let stdoutText = "";
  let stderrText = "";

  const output = createSmokeOutput({
    jsonOutput: false,
    stdout: { write: (chunk) => { stdoutText += chunk; } },
    stderr: { write: (chunk) => { stderrText += chunk; } }
  });

  output.info("[Smoke] hello");
  output.error("[Smoke] err");

  assert(stdoutText.includes("[Smoke] hello"), "info should remain on stdout outside json mode");
  assert(stderrText.includes("[Smoke] err"), "error should remain on stderr");
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
