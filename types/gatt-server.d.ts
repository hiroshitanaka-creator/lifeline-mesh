/**
 * Type definitions for bluetooth/gatt-server.js
 */

// ─── Error codes ─────────────────────────────────────────────────────────────

export declare const GATT_SERVER_ERROR: {
  readonly BACKEND_NOT_SET: "GATT_BACKEND_NOT_SET";
  readonly ALREADY_ADVERTISING: "GATT_ALREADY_ADVERTISING";
  readonly NOT_ADVERTISING: "GATT_NOT_ADVERTISING";
  readonly CLIENT_NOT_FOUND: "GATT_CLIENT_NOT_FOUND";
  readonly SEND_FAILED: "GATT_SEND_FAILED";
};

// ─── IGATTBackend interface ───────────────────────────────────────────────────

/**
 * Interface that native BLE peripheral backend adapters must implement.
 * Concrete implementations: MockGATTBackend (tests), Capacitor plugin, noble, etc.
 */
export interface IGATTBackend {
  /** Begin BLE advertisement so centrals can discover and connect. */
  startAdvertising(serviceUuid: string, localName: string): Promise<void>;

  /** Stop advertisement and disconnect all clients. */
  stopAdvertising(): Promise<void>;

  /**
   * Send data to a specific connected central via NOTIFY.
   * @param clientId  The client identifier provided to onClientConnected.
   * @param charUuid  Characteristic UUID to notify on.
   * @param data      Raw packet bytes.
   */
  notifyCharacteristic(clientId: string, charUuid: string, data: Uint8Array): Promise<void>;

  /** Assigned by GATTServer._wireBackendCallbacks(). */
  onWriteRequest: ((clientId: string, charUuid: string, data: Uint8Array) => void) | null;

  /** Assigned by GATTServer._wireBackendCallbacks(). */
  onClientConnected: ((clientId: string) => void) | null;

  /** Assigned by GATTServer._wireBackendCallbacks(). */
  onClientDisconnected: ((clientId: string) => void) | null;
}

// ─── GATTServer constructor options ──────────────────────────────────────────

export interface GATTServerOptions {
  backend?: IGATTBackend | null;
  localName?: string;
  protocolConfig?: {
    mtu?: number;
    packetHeaderSize?: number;
    chunkSize?: number;
    chunkDelayMs?: number;
    reassemblyTimeoutMs?: number;
  };
}

// ─── GATTServer snapshot ─────────────────────────────────────────────────────

export interface GATTServerSnapshot {
  advertising: boolean;
  localName: string;
  clientCount: number;
  clients: string[];
}

// ─── GATTServer class ────────────────────────────────────────────────────────

export declare class GATTServer {
  constructor(options?: GATTServerOptions);

  /** Called when a complete message is received from a central client. */
  onMessageReceived: ((message: Record<string, unknown>, clientId: string) => void) | null;

  /** Called when a central client connects. */
  onClientConnected: ((clientId: string) => void) | null;

  /** Called when a central client disconnects. */
  onClientDisconnected: ((clientId: string) => void) | null;

  /** Called on any error. */
  onError: ((errorCode: string, error: Error) => void) | null;

  /** Whether the server is currently advertising. */
  readonly isAdvertising: boolean;

  /** Number of currently connected central clients. */
  readonly clientCount: number;

  /** Snapshot of connected client IDs. */
  readonly connectedClients: string[];

  /**
   * Attach or replace the native backend adapter.
   * Must be called before startAdvertising() if no backend was passed to constructor.
   */
  setBackend(backend: IGATTBackend): void;

  /** Start advertising the Lifeline Mesh GATT service. */
  startAdvertising(): Promise<void>;

  /** Stop advertising and disconnect all clients. */
  stopAdvertising(): Promise<void>;

  /**
   * Send a message to a specific connected central client.
   * @param message  Lifeline Mesh message object.
   * @param clientId Target client ID (from onClientConnected).
   */
  sendMessage(message: Record<string, unknown>, clientId: string): Promise<void>;

  /**
   * Broadcast a message to all connected central clients.
   * @param message  Lifeline Mesh message object.
   */
  broadcast(message: Record<string, unknown>): Promise<void>;

  /**
   * Send an identity packet to a specific connected central.
   * @param identity  Public identity object.
   * @param clientId  Target client ID.
   */
  sendIdentity(identity: Record<string, unknown>, clientId: string): Promise<void>;

  /** Return a diagnostic snapshot. */
  getSnapshot(): GATTServerSnapshot;
}

// ─── MockGATTBackend ─────────────────────────────────────────────────────────

/** Notification record captured by MockGATTBackend. */
export interface MockNotification {
  clientId: string;
  charUuid: string;
  data: Uint8Array;
}

/**
 * In-process mock backend for unit testing GATTServer without hardware.
 */
export declare class MockGATTBackend implements IGATTBackend {
  advertising: boolean;
  serviceUuid: string | null;
  localName: string | null;
  notifications: MockNotification[];

  onWriteRequest: ((clientId: string, charUuid: string, data: Uint8Array) => void) | null;
  onClientConnected: ((clientId: string) => void) | null;
  onClientDisconnected: ((clientId: string) => void) | null;

  startAdvertising(serviceUuid: string, localName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  notifyCharacteristic(clientId: string, charUuid: string, data: Uint8Array): Promise<void>;

  /** Trigger onClientConnected as if a central just connected. */
  simulateClientConnect(clientId: string): void;

  /** Trigger onClientDisconnected as if a central just dropped. */
  simulateClientDisconnect(clientId: string): void;

  /**
   * Simulate a GATT write from a central to a characteristic.
   * @param clientId  The writing client's ID.
   * @param charUuid  Target characteristic UUID.
   * @param data      Raw packet bytes.
   */
  simulateWrite(clientId: string, charUuid: string, data: Uint8Array): void;
}
