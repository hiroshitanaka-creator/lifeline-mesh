import { VERIFICATION_STATUS } from "./db.js";

export function getContactVerificationStatus(contact) {
  return contact?.verified || VERIFICATION_STATUS.UNVERIFIED;
}

export function buildDecryptVerificationOutcome(contact, senderFpB64) {
  const senderLabel = `${contact.name} (fp: ${senderFpB64.slice(0, 16)}...)`;
  const status = getContactVerificationStatus(contact);

  if (status === VERIFICATION_STATUS.COMPROMISED) {
    return {
      level: "compromised",
      statusOk: false,
      message: `⚠️ Compromised sender: ${senderLabel}. Decrypted with high-risk warning. Re-verify identity immediately.`,
      details: [
        "sender verification: compromised",
        `sender: ${contact.name}`,
        `fp: ${contact.fp}`,
        contact.compromisedReason ? `reason: ${contact.compromisedReason}` : null,
        contact.compromisedAt ? `compromisedAt: ${new Date(contact.compromisedAt).toISOString()}` : null
      ].filter(Boolean).join("\n")
    };
  }

  if (status !== VERIFICATION_STATUS.VERIFIED) {
    return {
      level: "unverified",
      statusOk: false,
      message: `⚠️ Decrypted from unverified sender: ${senderLabel}. TOFU accepted this sender; verify safety number.`,
      details: [
        "sender verification: unverified (TOFU)",
        `sender: ${contact.name}`,
        `fp: ${contact.fp}`
      ].join("\n")
    };
  }

  return {
    level: "verified",
    statusOk: true,
    message: `✓ Decrypted from verified sender: ${senderLabel}`,
    details: [
      "sender verification: verified",
      `sender: ${contact.name}`,
      `fp: ${contact.fp}`,
      contact.verifiedAt ? `verifiedAt: ${new Date(contact.verifiedAt).toISOString()}` : null
    ].filter(Boolean).join("\n")
  };
}
