import { readFileSync } from "node:fs";

const runtimeFiles = ["app/index.html", "app/main.js", "app/service-worker.js"];
const externalUrlPattern = /https?:\/\//gi;

let failed = false;

for (const file of runtimeFiles) {
  const content = readFileSync(file, "utf-8");
  const matches = [...content.matchAll(externalUrlPattern)].map((m) => m[0]);

  if (matches.length > 0) {
    failed = true;
    console.error(`❌ External runtime URL found in ${file}`);
    const unique = [...new Set(matches)];
    for (const url of unique) {
      console.error(`   - ${url}`);
    }
  } else {
    console.log(`✅ No external runtime URL in ${file}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("✅ Offline runtime dependency check passed");
