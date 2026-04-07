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
  const cleanedTitle = (title || "").trim();
  const cleanedText = (text || "").trim();
  if (cleanedTitle && cleanedText) {
    return `${cleanedTitle}\n${cleanedText}`;
  }
  return cleanedText || cleanedTitle || "";
}

export function resolveShareTargetIntake({ title = "", text = "" } = {}) {
  const encryptedFromText = parseSharedEncryptedPayload(text);
  if (encryptedFromText) {
    return {
      route: "decrypt",
      encryptedPayload: encryptedFromText,
      source: "text"
    };
  }

  const contactFromText = parseSharedContactPayload(text);
  if (contactFromText) {
    return {
      route: "contact-import",
      contactPayloadText: JSON.stringify(contactFromText, null, 2),
      source: "text"
    };
  }

  const groupFromText = parseSharedGroupPayload(text);
  if (groupFromText) {
    return {
      route: "group-import",
      groupPayloadText: JSON.stringify(groupFromText, null, 2),
      source: "text"
    };
  }

  return {
    route: "encrypt",
    draftText: normalizeShareTargetText({ title, text }),
    source: "text"
  };
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

  const encryptedPayload = parseSharedEncryptedPayload(text);
  if (encryptedPayload) {
    return {
      route: "decrypt",
      encryptedPayload,
      source: "text"
    };
  }

  const contactPayload = parseSharedContactPayload(text);
  if (contactPayload) {
    return {
      route: "contact-import",
      contactPayloadText: JSON.stringify(contactPayload, null, 2),
      source: "text"
    };
  }

  const groupPayload = parseSharedGroupPayload(text);
  if (groupPayload) {
    return {
      route: "group-import",
      groupPayloadText: JSON.stringify(groupPayload, null, 2),
      source: "text"
    };
  }

  return {
    route: "encrypt",
    draftText: normalizeShareTargetText({ title, text }),
    source: "text"
  };
}
