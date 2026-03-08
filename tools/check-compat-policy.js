#!/usr/bin/env node
import fs from "node:fs";

const policyPath = "docs/COMPATIBILITY_POLICY.md";
if (!fs.existsSync(policyPath)) {
  console.error(`Missing ${policyPath}`);
  process.exit(1);
}

const text = fs.readFileSync(policyPath, "utf8");
const requiredMarkers = [
  "## Export/Import互換ルール",
  "## 破壊的変更（Breaking Change）の条件",
  "## CI互換ゲート",
  "Protocol Version:"
];

const missing = requiredMarkers.filter((marker) => !text.includes(marker));
if (missing.length > 0) {
  console.error("Compatibility policy is missing required sections:");
  for (const marker of missing) {
    console.error(`- ${marker}`);
  }
  process.exit(1);
}

console.log("Compatibility policy gate passed.");
