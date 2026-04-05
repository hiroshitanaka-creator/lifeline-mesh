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

export function normalizeShareTargetText({ title, text }) {
  const cleanedTitle = (title || "").trim();
  const cleanedText = (text || "").trim();
  if (cleanedTitle && cleanedText) {
    return `${cleanedTitle}\n${cleanedText}`;
  }
  return cleanedText || cleanedTitle || "";
}

export function resolveShareTargetIntake({ title = "", text = "" } = {}) {
  const encryptedPayload = parseSharedEncryptedPayload(text);
  if (encryptedPayload) {
    return {
      route: "decrypt",
      encryptedPayload
    };
  }

  return {
    route: "encrypt",
    draftText: normalizeShareTargetText({ title, text })
  };
}
