import type { DmeshChunk, DmeshMessage } from './message-schema.js';

export interface TransportEnvelope {
  raw: string;
  parsed: DmeshMessage | DmeshChunk | null;
}

export function parseTransportPayload(raw: string): TransportEnvelope {
  try {
    const parsed = JSON.parse(raw) as DmeshMessage | DmeshChunk;
    if (!parsed || typeof parsed !== 'object') {
      return { raw, parsed: null };
    }
    if (parsed.kind !== 'dmesh-msg' && parsed.kind !== 'dmesh-chunk') {
      return { raw, parsed: null };
    }
    return { raw, parsed };
  } catch {
    return { raw, parsed: null };
  }
}

export function encodeTransportPayload(payload: DmeshMessage | DmeshChunk): string {
  return JSON.stringify(payload);
}
