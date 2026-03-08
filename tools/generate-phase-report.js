import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const phaseJsonPath = path.join(repoRoot, "tools", "phase-plan.json");
const outPath = path.join(repoRoot, "docs", "PHASE_PROGRESS.md");

const raw = fs.readFileSync(phaseJsonPath, "utf8");
const data = JSON.parse(raw);

const completed = data.phases.filter((p) => p.status === "completed").length;
const total = data.phases.length;
const percent = Math.round((completed / total) * 100);

const lines = [];
lines.push("# Phase Progress Report");
lines.push("");
lines.push(`- Updated: ${data.updatedAt}`);
lines.push(`- Goal: ${data.goal}`);
lines.push(`- Completion: ${completed}/${total} (${percent}%)`);
lines.push("");
lines.push("| Phase | Title | Status | Deliverable |");
lines.push("|---|---|---|---|");

for (const phase of data.phases) {
  const statusLabel = phase.status === "completed" ? "✅ completed" : "⏳ pending";
  lines.push(`| ${phase.id} | ${phase.title} | ${statusLabel} | ${phase.deliverable} |`);
}

lines.push("");
lines.push("## Immediate Next Focus");
const next = data.phases.find((p) => p.status !== "completed");
if (next) {
  lines.push(`- Start Phase ${next.id}: ${next.title}`);
  lines.push(`- Expected deliverable: ${next.deliverable}`);
} else {
  lines.push("- All phases completed.");
}

fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${path.relative(repoRoot, outPath)} (${completed}/${total}, ${percent}%)`);
