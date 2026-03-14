let requestId = 0;
const pending = new Map();
const WORKER_TIMEOUT_MS = 15000;

let cryptoWorker = null;

function ensureWorker() {
  if (cryptoWorker) {
    return cryptoWorker;
  }

  cryptoWorker = new Worker(new URL('./workers/crypto-worker.js', import.meta.url), { type: 'module' });
  cryptoWorker.onmessage = (event) => {
    const { id, ok, result, error } = event.data;
    const resolver = pending.get(id);
    if (!resolver) return;
    pending.delete(id);
    clearTimeout(resolver.timeoutId);
    if (ok) resolver.resolve(result);
    else resolver.reject(new Error(error));
  };

  cryptoWorker.onerror = (event) => {
    const reason = event?.message || 'Worker execution error';
    for (const [, resolver] of pending) {
      clearTimeout(resolver.timeoutId);
      resolver.reject(new Error(reason));
    }
    pending.clear();
    cryptoWorker?.terminate();
    cryptoWorker = null;
  };

  return cryptoWorker;
}

function callWorker(type, payload, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = ensureWorker();
    const id = ++requestId;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : WORKER_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      const resolver = pending.get(id);
      if (!resolver) {
        return;
      }

      pending.delete(id);
      resolver.reject(new Error(`${type} worker request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeoutId });
    worker.postMessage({ id, type, payload });
  });
}

export function encryptInWorker(payload) {
  return callWorker('encrypt', payload);
}

export function decryptInWorker(payload) {
  return callWorker('decrypt', payload);
}
