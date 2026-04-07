export function parseRelayAdminArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const wantsStatus = args.includes("--relay-status");
  const wantsCleanup = args.includes("--relay-cleanup");
  const signalsDisabled = args.includes("--no-relay-signals");

  const mode = wantsCleanup ? "cleanup" : wantsStatus ? "status" : "serve";

  const diagSource = readOptionValue(args, "--relay-diag")
    ?? readOptionValue(args, "--diag");

  const manualSmoke = args.includes("--manual-smoke");
  const diagnosticsSpecified = diagSource !== null;

  return {
    mode,
    signalsEnabled: !signalsDisabled,
    diagnosticsSpecified,
    diagnosticsEnabled: parseBooleanFlag(diagSource, false),
    manualSmoke
  };
}

export function parseManualSmokeArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const timeoutMs = parseIntegerOption(args, "--timeout-ms", 15000);
  const expectClient = parseBooleanOption(args, "--expect-client", args.includes("--expect-client"));
  const cleanup = parseBooleanOption(args, "--cleanup", args.includes("--cleanup"));
  const jsonOutput = parseBooleanOption(args, "--json", args.includes("--json"));
  const statusFile = readOptionValue(args, "--status-file");
  const nonInteractive = args.includes("--non-interactive") || args.includes("--once");

  return {
    timeoutMs,
    expectClient,
    cleanup,
    jsonOutput,
    statusFile,
    nonInteractive
  };
}

export function createSmokeOutput({ jsonOutput = false, stdout = process.stdout, stderr = process.stderr } = {}) {
  function normalisePart(part) {
    if (typeof part === "string") return part;
    if (part instanceof Error) return part.message;
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  }

  function writeLine(stream, parts) {
    stream.write(`${parts.map(normalisePart).join(" ")}
`);
  }

  return {
    info: (...parts) => writeLine(jsonOutput ? stderr : stdout, parts),
    warn: (...parts) => writeLine(stderr, parts),
    error: (...parts) => writeLine(stderr, parts),
    jsonResult: (value) => writeLine(stdout, [JSON.stringify(value)])
  };
}

export function formatRelayStatus(snapshot, context = {}) {
  return {
    mode: "single-client-relay",
    context: {
      generatedAt: new Date().toISOString(),
      ...context
    },
    status: snapshot
  };
}

export function resolveDiagnosticsEnabled({ cliSpecified = false, cliEnabled = false, envValue = null } = {}) {
  if (cliSpecified) {
    return cliEnabled;
  }

  const envEnabled = parseBooleanFlag(envValue, null);
  if (envEnabled === null) {
    return false;
  }
  return envEnabled;
}

function readOptionValue(args, key) {
  const directPrefix = `${key}=`;
  const direct = args.find((arg) => typeof arg === "string" && arg.startsWith(directPrefix));
  if (direct) {
    return direct.slice(directPrefix.length);
  }

  const index = args.indexOf(key);
  if (index === -1) {
    return null;
  }

  const nextValue = args[index + 1];
  if (typeof nextValue !== "string" || nextValue.startsWith("--")) {
    return "true";
  }
  return nextValue;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === null || value === undefined) return fallback;

  const normalised = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on", "debug", "verbose"].includes(normalised)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalised)) {
    return false;
  }
  return fallback;
}

function parseBooleanOption(args, key, fallback = false) {
  const raw = readOptionValue(args, key);
  if (raw === null) {
    return fallback;
  }
  return parseBooleanFlag(raw, fallback);
}

function parseIntegerOption(args, key, fallback) {
  const raw = readOptionValue(args, key);
  if (raw === null || raw === "true") {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
