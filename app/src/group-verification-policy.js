import { VERIFICATION_STATUS } from "./db.js";
import { getContactVerificationStatus } from "./decrypt-verification-policy.js";

export function evaluateGroupActorVerification({ actorLabel, contact }) {
  const status = contact ? getContactVerificationStatus(contact) : VERIFICATION_STATUS.UNVERIFIED;
  const label = actorLabel || contact?.name || "unknown actor";

  if (status === VERIFICATION_STATUS.COMPROMISED) {
    return {
      status,
      level: "compromised",
      blocked: true,
      warning: true,
      details: `Blocked: ${label} is marked compromised. Re-verify identity before trusting this group action.`
    };
  }

  if (status !== VERIFICATION_STATUS.VERIFIED) {
    return {
      status,
      level: "unverified",
      blocked: false,
      warning: true,
      details: `Warning: ${label} is unverified (TOFU). Verify safety number before trusting this group action.`
    };
  }

  return {
    status,
    level: "verified",
    blocked: false,
    warning: false,
    details: `Verified: ${label} is verified.`
  };
}

export function summarizeGroupVerificationOutcomes(outcomes) {
  const blocked = outcomes.filter((entry) => entry?.blocked);
  if (blocked.length) {
    return {
      ok: false,
      level: "compromised",
      message: blocked.map((entry) => entry.details).join(" ")
    };
  }

  const warnings = outcomes.filter((entry) => entry?.warning);
  if (warnings.length) {
    return {
      ok: true,
      level: "unverified",
      message: warnings.map((entry) => entry.details).join(" ")
    };
  }

  return {
    ok: true,
    level: "verified",
    message: ""
  };
}
