import * as GroupMesh from "../../crypto/group.js";
import { legacyUnsignedPolicy } from "../../crypto/protocol-vnext.js";
import nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";

export function normalizeImportedGroupPayload(rawPayload, options = {}) {
  if (!rawPayload || typeof rawPayload !== "object") {
    throw new Error("Invalid group payload");
  }
  const nowMs = options.nowMs;
  const acceptsLegacyUnsignedOnboarding = legacyUnsignedPolicy(nowMs).acceptsLegacyUnsignedOnboarding;

  if (rawPayload.type === "lifeline-signed-envelope-v1") {
    GroupMesh.verifySignedGroupPayloadEnvelope(rawPayload, nacl, naclUtil);
    const payloadType = rawPayload.payloadType;
    if (payloadType === "lifeline-sender-state-sync-v1") {
      if (!rawPayload.payload?.groupId || !rawPayload.payload?.senderSignPK || !rawPayload.payload?.senderKeyState) {
        throw new Error("Invalid signed sender-state sync payload");
      }
      return {
        mode: "sender-sync",
        payload: rawPayload.payload,
        authenticity: {
          envelopeVersion: rawPayload.type,
          signed: true,
          signerSignPK: rawPayload.exportedBySignPK,
          warning: null
        }
      };
    }

    if (payloadType === "lifeline-group-onboarding-v1") {
      if (!rawPayload.payload?.group?.id || !rawPayload.payload?.group?.senderKey) {
        throw new Error("Invalid signed onboarding payload");
      }
      return {
        mode: "onboarding",
        payload: rawPayload.payload,
        authenticity: {
          envelopeVersion: rawPayload.type,
          signed: true,
          signerSignPK: rawPayload.exportedBySignPK,
          warning: null
        }
      };
    }

    throw new Error(`Unsupported signed payload type: ${String(payloadType)}`);
  }

  if (rawPayload.type === "lifeline-sender-state-sync-v1") {
    if (!acceptsLegacyUnsignedOnboarding) {
      throw new Error("Unsigned legacy sender-state sync payload support expired");
    }
    if (!rawPayload.groupId || !rawPayload.senderSignPK || !rawPayload.senderKeyState) {
      throw new Error("Invalid sender-state sync payload");
    }
    return {
      mode: "sender-sync",
      payload: rawPayload,
      authenticity: {
        envelopeVersion: "legacy-unsigned",
        signed: false,
        signerSignPK: rawPayload.senderSignPK || null,
        warning: "Unsigned legacy sender-state sync payload accepted"
      }
    };
  }

  if (rawPayload.type === "lifeline-group-onboarding-v1") {
    if (!acceptsLegacyUnsignedOnboarding) {
      throw new Error("Unsigned legacy onboarding payload support expired");
    }
    if (!rawPayload.group?.id || !rawPayload.group?.senderKey) {
      throw new Error("Invalid onboarding payload");
    }
    return {
      mode: "onboarding",
      payload: rawPayload,
      authenticity: {
        envelopeVersion: "legacy-unsigned",
        signed: false,
        signerSignPK: null,
        warning: "Unsigned legacy onboarding payload accepted"
      }
    };
  }

  if (!rawPayload.id || !rawPayload.senderKey) {
    throw new Error("Invalid group JSON");
  }
  if (!acceptsLegacyUnsignedOnboarding) {
    throw new Error("Unsigned legacy onboarding payload support expired");
  }

  return {
    mode: "legacy",
    payload: rawPayload,
    authenticity: {
      envelopeVersion: "legacy-group-json",
      signed: false,
      signerSignPK: null,
      warning: "Legacy raw group JSON accepted without authenticity proof"
    }
  };
}
