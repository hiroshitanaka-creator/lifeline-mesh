import {
  evaluateGroupActorVerification,
  summarizeGroupVerificationOutcomes
} from "../../app/src/group-verification-policy.js";
import { VERIFICATION_STATUS } from "../../app/src/db.js";

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

test("integration: group verification blocks compromised contact", () => {
  const result = evaluateGroupActorVerification({
    actorLabel: "member abcd",
    contact: { name: "Compromised Member", verified: VERIFICATION_STATUS.COMPROMISED }
  });
  if (!result.blocked) {
    throw new Error("Expected compromised actor to be blocked");
  }
  if (!result.details.includes("Blocked:")) {
    throw new Error("Expected blocked status details");
  }
});

test("integration: group verification warns for unverified contact", () => {
  const result = evaluateGroupActorVerification({
    actorLabel: "signer efgh",
    contact: { name: "TOFU Signer", verified: VERIFICATION_STATUS.UNVERIFIED }
  });
  if (result.blocked) {
    throw new Error("Expected unverified actor to be non-blocking");
  }
  if (!result.warning) {
    throw new Error("Expected unverified actor warning");
  }
});

test("integration: group verification warns when contact is unknown", () => {
  const result = evaluateGroupActorVerification({
    actorLabel: "member unknown",
    contact: null
  });
  if (result.status !== VERIFICATION_STATUS.UNVERIFIED) {
    throw new Error("Unknown actor should default to unverified");
  }
  if (!result.warning) {
    throw new Error("Unknown actor should produce warning");
  }
});

test("integration: group verification accepts verified contact", () => {
  const result = evaluateGroupActorVerification({
    actorLabel: "member ijkl",
    contact: { name: "Verified Member", verified: VERIFICATION_STATUS.VERIFIED }
  });
  if (result.blocked || result.warning) {
    throw new Error("Verified actor should be accepted");
  }
});

test("integration: summary prioritizes compromised block over warnings", () => {
  const summary = summarizeGroupVerificationOutcomes([
    { blocked: false, warning: true, details: "warning detail" },
    { blocked: true, warning: true, details: "blocked detail" }
  ]);
  if (summary.ok) {
    throw new Error("Summary should reject when a blocked actor exists");
  }
  if (!summary.message.includes("blocked detail")) {
    throw new Error("Blocked detail should be included in summary");
  }
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed += 1;
  }
}

console.log("\n" + "=".repeat(50));
console.log(`Tests: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
