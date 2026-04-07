#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const seriesGate = [
  {
    name: "implementation-series-status",
    command: "node -e \"import fs from 'node:fs'; const t=fs.readFileSync('docs/IMPLEMENTATION_SERIES_STATUS.md','utf8'); if(!t.includes('Phase 1 is **complete**')||!t.includes('Phase 5 is **complete**')) process.exit(1);\""
  },
  { name: "lint", command: "npm run lint" },
  { name: "typecheck", command: "npm run typecheck" },
  { name: "unit", command: "npm run test:unit" },
  { name: "integration", command: "npm run test:integration" }
];

console.log("\n[Series Gate] Verifying implementation-series maintenance truth (Phases 1-5 complete)\n");

for (const step of seriesGate) {
  console.log(`▶ ${step.name}: ${step.command}`);
  const result = spawnSync(step.command, {
    shell: true,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    console.error(`✗ Failed: ${step.name}`);
    process.exit(1);
  }

  console.log(`✓ Passed: ${step.name}\n`);
}

console.log("[Series Gate] PASSED");
