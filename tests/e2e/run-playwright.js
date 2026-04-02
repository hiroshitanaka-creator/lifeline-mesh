#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit", shell: false });
}

const args = ["test", ...process.argv.slice(2)];

const direct = run("playwright", args);
if (direct.status === 0) {
  process.exit(0);
}
// Non-zero but not ENOENT means Playwright ran and tests failed — propagate.
if (direct.status !== null && direct.status !== 127 && !direct.error) {
  process.exit(direct.status);
}

const npxRun = run("npx", ["--no", "playwright", ...args]);
if (npxRun.status === 0) {
  process.exit(0);
}
if (npxRun.status !== null && npxRun.status !== 127 && !npxRun.error) {
  process.exit(npxRun.status);
}

console.error(
  "[error] Playwright is not installed. Run `npm run test:e2e:install` first.\n" +
  "        For file-presence smoke checks only, use `npm run test:e2e:smoke`."
);
process.exit(1);
