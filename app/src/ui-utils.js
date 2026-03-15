export function setStatus(ok, msg) {
  const statusEl = document.getElementById("status");
  if (!statusEl) {
    return;
  }

  const labelEl = document.createElement("span");
  labelEl.className = ok ? "ok" : "ng";
  labelEl.textContent = ok ? "✓ OK" : "✗ ERROR";

  statusEl.replaceChildren(labelEl, document.createTextNode(` ${String(msg)}`));
  statusEl.textContent = "";

  const label = document.createElement("span");
  label.className = ok ? "ok" : "ng";
  label.textContent = ok ? "✓ OK" : "✗ ERROR";

  statusEl.append(label, " ", String(msg));
}

export function formatErrorMessage(prefix, error) {
  const message = error?.message || String(error);
  return `${prefix}: ${message}`;
}

export function formatLocalTime(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleTimeString();
}

export function appendBleMessage(container, message, timestamp = Date.now()) {
  if (!container) {
    return;
  }
  const current = container.textContent === "(none)" ? "" : `${container.textContent}\n---\n`;
  container.textContent = `${current}[${formatLocalTime(timestamp)}] Received:\n${JSON.stringify(message, null, 2)}`;
}
