import fs from "fs";

const required = [
  "playwright.config.js",
  "tests/e2e/main-flow.spec.js",
  "app/index.html"
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing E2E baseline file: ${file}`);
  }
}

const spec = fs.readFileSync("tests/e2e/main-flow.spec.js", "utf8");
if (!spec.includes("Generate / Load Keys") || !spec.includes("Scan for Devices")) {
  throw new Error("E2E spec does not cover primary user flow controls");
}

console.log("✓ E2E minimal set is present (Playwright config + main flow spec)");
