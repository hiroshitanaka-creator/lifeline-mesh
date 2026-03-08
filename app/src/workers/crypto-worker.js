import * as DMesh from '../../../crypto/core.js';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

self.onmessage = (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type === 'encrypt') {
      const result = DMesh.encryptMessage(payload, nacl, naclUtil);
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'decrypt') {
      const result = DMesh.decryptMessage(payload, nacl, naclUtil);
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (type === 'reassemble') {
      const result = DMesh.reassembleChunks(payload.chunks, naclUtil);
      self.postMessage({ id, ok: true, result });
      return;
    }

    self.postMessage({ id, ok: false, error: `Unknown worker action: ${type}` });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error) });
  }
};
