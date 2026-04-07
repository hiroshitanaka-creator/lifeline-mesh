import assert from "node:assert/strict";
import { normalizeImportedGroupPayload } from "../../app/src/group-import-normalization.js";

const rawLegacyGroupPayload = {
  id: "legacy-group",
  name: "Legacy Group",
  senderKey: {
    version: 1,
    chainKey: "AAAAAAAAAAAAAAAAAAAAAA=="
  }
};

function testRawLegacyFallbackAcceptedBeforeCutoff() {
  const beforeCutoff = Date.parse("2026-12-31T23:59:59.000Z");
  const normalized = normalizeImportedGroupPayload(rawLegacyGroupPayload, { nowMs: beforeCutoff });

  assert.equal(normalized.mode, "legacy");
  assert.equal(normalized.authenticity.envelopeVersion, "legacy-group-json");
  assert.equal(normalized.authenticity.signed, false);
}

function testRawLegacyFallbackRejectedAfterCutoff() {
  const afterCutoff = Date.parse("2027-01-01T00:00:00.000Z");

  assert.throws(
    () => normalizeImportedGroupPayload(rawLegacyGroupPayload, { nowMs: afterCutoff }),
    /Unsigned legacy onboarding payload support expired/
  );
}

testRawLegacyFallbackAcceptedBeforeCutoff();
testRawLegacyFallbackRejectedAfterCutoff();

console.log("group import normalization tests passed");
