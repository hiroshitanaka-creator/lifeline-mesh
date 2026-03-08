#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const phaseArg = process.argv.find((arg) => arg.startsWith("--phase="));
const phase = phaseArg ? phaseArg.split("=")[1].toUpperCase() : "A";

const phaseCommands = {
  A: ["npm run test:integration", "npm run test:e2e"],
  B: ["npm run test:unit", "npm run lint"],
  C: ["npm run test:vectors", "npm run test:integration"],
  D: ["npm run lint", "npm run typecheck"],
  E: ["npm run validate"]
};

if (!phaseCommands[phase]) {
  console.error(`Unsupported phase: ${phase}. Use A, B, C, D, or E.`);
  process.exit(2);
}

console.log(`\n[Phase Gate] Checking phase ${phase}\n`);

let failed = false;
for (const cmd of phaseCommands[phase]) {
  console.log(`▶ ${cmd}`);
  const result = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: process.env
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`✗ Failed: ${cmd}`);
    break;
  }

  console.log(`✓ Passed: ${cmd}\n`);
}

if (failed) {
  process.exit(1);
}

console.log(`[Phase Gate] Phase ${phase} PASSED`);
