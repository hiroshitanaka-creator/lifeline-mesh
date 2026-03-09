#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const reportPath = path.join(repoRoot, "docs", "SECURITY_AUDIT_REPORT.md");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: process.env,
    stdio: "pipe"
  });
  return {
    command: [command, ...args].join(" "),
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function summarizeCommand(result, allowNonZero = false) {
  if (result.code === 0) {
    return { status: "PASS", details: "completed successfully" };
  }
  if (allowNonZero) {
    return { status: "WARN", details: `non-zero exit (${result.code})` };
  }
  return { status: "FAIL", details: `non-zero exit (${result.code})` };
}

const checks = [];

const auditRoot = run("npm", ["audit", "--audit-level=high", "--json"]);
checks.push({
  name: "Dependency audit (root)",
  ...summarizeCommand(auditRoot, true),
  command: auditRoot.command
});

const auditCrypto = run("npm", ["audit", "--prefix", "crypto", "--audit-level=high", "--json"]);
checks.push({
  name: "Dependency audit (crypto)",
  ...summarizeCommand(auditCrypto, true),
  command: auditCrypto.command
});

const auditTools = run("npm", ["audit", "--prefix", "tools", "--audit-level=high", "--json"]);
checks.push({
  name: "Dependency audit (tools)",
  ...summarizeCommand(auditTools, true),
  command: auditTools.command
});

const lintRun = run("npm", ["run", "lint"]);
checks.push({
  name: "Lint baseline",
  ...summarizeCommand(lintRun, false),
  command: lintRun.command
});

const validateRun = run("npm", ["run", "check:compat"]);
checks.push({
  name: "Compatibility policy gate",
  ...summarizeCommand(validateRun, false),
  command: validateRun.command
});

const sinkScan = run("rg", ["-n", "innerHTML\\s*=|outerHTML\\s*=|insertAdjacentHTML\\(|eval\\(", "app/src", "crypto", "bluetooth"]);
checks.push({
  name: "Unsafe sink scan (innerHTML/eval)",
  status: sinkScan.code === 1 ? "PASS" : sinkScan.code === 0 ? "WARN" : "FAIL",
  details: sinkScan.code === 1
    ? "no direct unsafe sink pattern detected"
    : sinkScan.code === 0
      ? "potential unsafe sink usage found; review matches"
      : `scan failed (${sinkScan.code})`,
  command: sinkScan.command
});

const now = new Date().toISOString();
const lines = [];
lines.push("# Security Audit Report");
lines.push("");
lines.push(`- Generated: ${now}`);
lines.push("- Scope: Phase 15 security audit preparation");
lines.push("");
lines.push("| Check | Status | Details | Command |");
lines.push("|---|---|---|---|");
for (const check of checks) {
  const status = check.status === "PASS" ? "✅ PASS" : check.status === "WARN" ? "⚠️ WARN" : "❌ FAIL";
  lines.push(`| ${check.name} | ${status} | ${check.details} | \`${check.command}\` |`);
}

if (sinkScan.code === 0) {
  lines.push("");
  lines.push("## Unsafe sink scan matches");
  lines.push("```text");
  lines.push((sinkScan.stdout || "").trim());
  lines.push("```");
}

fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

const hardFail = checks.some((c) => c.status === "FAIL");
if (hardFail) {
  console.error(`[security-audit] FAIL: see ${path.relative(repoRoot, reportPath)}`);
  process.exit(1);
}

const warnCount = checks.filter((c) => c.status === "WARN").length;
console.log(`[security-audit] completed with ${warnCount} warning(s): ${path.relative(repoRoot, reportPath)}`);
