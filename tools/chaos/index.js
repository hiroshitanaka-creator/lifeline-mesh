/**
 * Lifeline Mesh - Chaos Engineering Framework
 *
 * Simulates adversarial network conditions to validate the resilience of
 * the Lifeline Mesh protocol and implementation.
 *
 * Three chaos scenarios:
 *   1. NetworkChaos   — random disconnects, latency injection, packet loss
 *   2. BatteryChaos   — simulates low-battery / power-constrained nodes
 *   3. DisasterChaos  — 50% message loss rate, extreme conditions
 *
 * Usage:
 *   node tools/chaos/index.js --scenario network --nodes 10 --duration 60
 *   node tools/chaos/index.js --scenario battery --nodes 5 --duration 30
 *   node tools/chaos/index.js --scenario disaster --nodes 20 --duration 120
 *
 * Can also be imported and driven programmatically in Playwright tests.
 *
 * @module tools/chaos
 */

export { NetworkChaos } from "./network-chaos.js";
export { BatteryChaos } from "./battery-chaos.js";
export { DisasterChaos } from "./disaster-chaos.js";
export { ChaosOrchestrator } from "./orchestrator.js";
