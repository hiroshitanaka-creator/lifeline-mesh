#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function parseArgs(argv) {
  const args = { input: "", output: "", pretty: true };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") args.input = argv[++i] || "";
    else if (token === "--output") args.output = argv[++i] || "";
    else if (token === "--compact") args.pretty = false;
  }
  return args;
}

function sortStrings(items) {
  if (!Array.isArray(items)) return [];
  return items.map((v) => String(v)).sort((a, b) => a.localeCompare(b));
}

function normalize(input) {
  const sent = Number(input?.results?.messagesSent ?? input?.messagesSent ?? 0);
  const delivered = Number(input?.results?.messagesDelivered ?? input?.messagesDelivered ?? 0);
  const ratioRaw = sent > 0 ? delivered / sent : 0;
  const ratio = Number(ratioRaw.toFixed(4));
  const duplicateSurfacedCount = Number(input?.results?.duplicateSurfacedCount ?? input?.duplicateSurfacedCount ?? 0);
  const replaySuppressionPassed = Boolean(input?.results?.replaySuppressionPassed ?? input?.replaySuppressionPassed);
  const pass = ratio >= 0.95 && duplicateSurfacedCount === 0 && replaySuppressionPassed;
  const capturedAt = input?.capturedAt || new Date().toISOString();

  const stableHashInput = JSON.stringify({
    capturedAt: capturedAt.slice(0, 10),
    sent,
    delivered,
    duplicateSurfacedCount,
    replaySuppressionPassed,
    operatorId: input?.operator?.id || input?.operatorId || "unknown"
  });

  return {
    schemaVersion: "1.0.0",
    recordType: "phase5-hardware-smoke",
    runId: `hw-${crypto.createHash("sha256").update(stableHashInput).digest("hex").slice(0, 12)}`,
    capturedAt,
    operator: {
      id: input?.operator?.id || input?.operatorId || "unknown",
      site: input?.operator?.site || input?.site || "unknown"
    },
    scenario: {
      stepsVersion: String(input?.scenario?.stepsVersion || "hardware-smoke-v1"),
      messageBurstCount: Number(input?.scenario?.messageBurstCount ?? input?.messageBurstCount ?? sent),
      forcedReplayAttempted: Boolean(input?.scenario?.forcedReplayAttempted ?? input?.forcedReplayAttempted ?? true),
      topology: String(input?.scenario?.topology || "A->B->C")
    },
    results: {
      messagesSent: sent,
      messagesDelivered: delivered,
      deliveryRatio: ratio,
      duplicateSurfacedCount,
      replaySuppressionPassed,
      status: pass ? "pass" : "fail",
      notes: String(input?.results?.notes || input?.notes || "")
    },
    evidence: {
      logs: sortStrings(input?.evidence?.logs || input?.logs),
      artifacts: sortStrings(input?.evidence?.artifacts || input?.artifacts)
    },
    truthFlags: {
      manualRun: true,
      ciBacked: false,
      batteryTelemetry: "not_measured"
    }
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error("usage: node tools/hardware-smoke-record.js --input <raw.json> [--output <normalized.json>] [--compact]");
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const normalized = normalize(raw);
  const payload = JSON.stringify(normalized, null, args.pretty ? 2 : 0);

  if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${payload}\n`, "utf8");
    console.log(outputPath);
    return;
  }

  console.log(payload);
}

main();
