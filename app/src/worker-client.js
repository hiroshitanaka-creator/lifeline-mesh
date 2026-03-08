const cryptoWorker = new Worker(new URL('./workers/crypto-worker.js', import.meta.url), { type: 'module' });

let requestId = 0;
const pending = new Map();

cryptoWorker.onmessage = (event) => {
  const { id, ok, result, error } = event.data;
  const resolver = pending.get(id);
  if (!resolver) return;
  pending.delete(id);
  if (ok) resolver.resolve(result);
  else resolver.reject(new Error(error));
};

function callWorker(type, payload) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    cryptoWorker.postMessage({ id, type, payload });
  });
}

export function encryptInWorker(payload) {
  return callWorker('encrypt', payload);
}

export function decryptInWorker(payload) {
  return callWorker('decrypt', payload);
}
