import { simulateThreeNodeRelay } from "../sim/deterministic-simulator.js";

function classifyEnergy(sentCount) {
  if (sentCount <= 4) return "low";
  if (sentCount <= 8) return "medium";
  return "high";
}

const seeds = Array.from({ length: 30 }, (_v, idx) => idx + 1);
const runs = seeds.map((seed) => simulateThreeNodeRelay({ seed, rounds: 120, dropRate: 0.06, replayRate: 0.16 }));

const summary = {
  generatedAt: new Date().toISOString(),
  sampleSize: runs.length,
  avgUniqueDelivered: Number((runs.reduce((acc, run) => acc + run.uniqueDelivered, 0) / runs.length).toFixed(2)),
  avgQueueRemaining: Number((runs.reduce((acc, run) => acc + run.queueRemaining, 0) / runs.length).toFixed(2)),
  nodeEnergyProfile: {
    A: classifyEnergy(Math.round(runs.reduce((acc, run) => acc + run.nodes.A.sent, 0) / runs.length)),
    B: classifyEnergy(Math.round(runs.reduce((acc, run) => acc + run.nodes.B.sent, 0) / runs.length)),
    C: classifyEnergy(Math.round(runs.reduce((acc, run) => acc + run.nodes.C.sent, 0) / runs.length))
  }
};

console.log(JSON.stringify(summary, null, 2));
