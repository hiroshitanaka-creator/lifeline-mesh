export interface DMeshMessage {
  kind: "dmesh-msg";
  msgId?: string;
  ts?: number;
  [key: string]: unknown;
}

export interface DMeshIdMessage {
  kind: "dmesh-id";
  fp?: string;
  [key: string]: unknown;
}

export interface DMeshChunk {
  kind: "dmesh-chunk";
  msgId: string;
  seq: number;
  total: number;
  [key: string]: unknown;
}

export type TransportPayload = DMeshMessage | DMeshIdMessage | DMeshChunk;

export interface TransportCapabilities {
  name: string;
  maxPayloadSize: number;
  supportsChunking: boolean;
  bidirectional: boolean;
  realtime: boolean;
  offline: boolean;
  peerDiscovery: boolean;
}

export interface TransportEventCallbacks {
  onMessage: ((message: TransportPayload) => void) | null;
  onChunk: ((chunk: DMeshChunk | Record<string, unknown>) => void) | null;
  onError: ((error: Error | unknown) => void) | null;
  onPeerDiscovered: ((peer: Record<string, unknown>) => void) | null;
}

export interface TransportManagerSendResult {
  transport: string;
  result: string[];
}
