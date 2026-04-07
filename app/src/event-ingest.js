function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function classifyPayload(parsed) {
  if (!parsed) return null;
  if (parsed.kind === "dmesh-msg" || parsed.kind === "dmesh-group-msg") return "decrypt";
  if (parsed.kind === "dmesh-id" || (parsed.signPK && parsed.boxPK)) return "contact-import";
  if (
    parsed.type === "lifeline-signed-envelope-v1" ||
    parsed.type === "lifeline-sender-state-sync-v1" ||
    parsed.type === "lifeline-group-onboarding-v1" ||
    (parsed.id && parsed.senderKey)
  ) {
    return "group-import";
  }
  return null;
}

export const INGEST_CHANNEL = {
  BLE: "ble",
  QR: "qr",
  FILE: "file",
  SHARE_TARGET: "share-target"
};

export function normalizeIngestText({ title = "", text = "" } = {}) {
  const cleanedTitle = (title || "").trim();
  const cleanedText = (text || "").trim();
  if (cleanedTitle && cleanedText) {
    return `${cleanedTitle}\n${cleanedText}`;
  }
  return cleanedText || cleanedTitle || "";
}

export function resolveIngestRoute({ title = "", text = "", channel = INGEST_CHANNEL.SHARE_TARGET } = {}) {
  const parsed = parseJsonObject(text);
  const route = classifyPayload(parsed);
  if (route) {
    return { route, payload: parsed, channel };
  }

  return {
    route: "encrypt",
    payload: { draftText: normalizeIngestText({ title, text }) },
    channel
  };
}
