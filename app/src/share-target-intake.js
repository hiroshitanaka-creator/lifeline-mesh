import { resolveIngestRoute, INGEST_CHANNEL, normalizeIngestText } from "./event-ingest.js";

export function parseSharedEncryptedPayload(text) {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.kind === "dmesh-msg" || parsed.kind === "dmesh-group-msg") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSharedContactPayload(text) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const hasSenderOnlyKeys =
      typeof parsed.signPK === "string" &&
      parsed.signPK.trim().length > 0 &&
      typeof parsed.boxPK === "string" &&
      parsed.boxPK.trim().length > 0;
    if (parsed.kind === "dmesh-id" || hasSenderOnlyKeys) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseSharedGroupPayload(text) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (parsed.type === "lifeline-signed-envelope-v1") {
      if (parsed.payloadType === "lifeline-sender-state-sync-v1" || parsed.payloadType === "lifeline-group-onboarding-v1") {
        return parsed;
      }
      return null;
    }

    if (parsed.type === "lifeline-sender-state-sync-v1" || parsed.type === "lifeline-group-onboarding-v1") {
      return parsed;
    }

    if (parsed.id && parsed.senderKey) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function normalizeShareTargetText({ title, text }) {
  return normalizeIngestText({ title, text });
}

export function resolveShareTargetIntake({ title = "", text = "" } = {}) {
  const resolved = resolveIngestRoute({ title, text, channel: INGEST_CHANNEL.SHARE_TARGET });
  if (resolved.route === "encrypt") {
    return { route: "encrypt", draftText: resolved.payload.draftText, source: "text" };
  }

  if (resolved.route === "decrypt") {
    return { route: "decrypt", encryptedPayload: resolved.payload, source: "text" };
  }

  if (resolved.route === "contact-import") {
    return { route: "contact-import", contactPayloadText: JSON.stringify(resolved.payload, null, 2), source: "text" };
  }

  return { route: "group-import", groupPayloadText: JSON.stringify(resolved.payload, null, 2), source: "text" };
}

export function resolveShareTargetFileIntake({ files = [] } = {}) {
  for (const file of files) {
    const fileText = typeof file?.text === "string" ? file.text : "";
    if (!fileText.trim()) {
      continue;
    }

    const encryptedPayload = parseSharedEncryptedPayload(fileText);
    if (encryptedPayload) {
      return {
        route: "decrypt",
        encryptedPayload,
        source: `file (${file.name || "unnamed"})`
      };
    }

    const groupPayload = parseSharedGroupPayload(fileText);
    if (groupPayload) {
      return {
        route: "group-import",
        groupPayloadText: JSON.stringify(groupPayload, null, 2),
        source: `file (${file.name || "unnamed"})`
      };
    }

    const contactPayload = parseSharedContactPayload(fileText);
    if (contactPayload) {
      return {
        route: "contact-import",
        contactPayloadText: JSON.stringify(contactPayload, null, 2),
        source: `file (${file.name || "unnamed"})`
      };
    }
  }

  return null;
}

export function resolveStartupShareTargetIntake({ title = "", text = "", files = [] } = {}) {
  const fileIntake = resolveShareTargetFileIntake({ files });
  if (fileIntake) {
    return fileIntake;
  }

  return resolveShareTargetIntake({ title, text });
}
