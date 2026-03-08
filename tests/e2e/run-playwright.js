#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit", shell: false });
}

const direct = run("playwright", ["test"]);
if (direct.status === 0) {
  process.exit(0);
}

const npxRun = run("npx", ["--yes", "playwright", "test"]);
if (npxRun.status === 0) {
  process.exit(0);
}

console.warn("[warn] Playwright unavailable. Falling back to smoke check.");
const smoke = run("node", ["tests/e2e/smoke-check.js"]);
process.exit(smoke.status ?? 1);
