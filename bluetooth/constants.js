/**
 * Lifeline Mesh - Bluetooth BLE Constants
 *
 * Defines the GATT service and characteristics for peer-to-peer
 * message exchange over Bluetooth Low Energy.
 */

// Lifeline Mesh Service UUID (randomly generated, unique to this project)
export const SERVICE_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// GATT Characteristics
export const CHARACTERISTICS = {
  // Write characteristic - send messages to peer
  MESSAGE_TX: "a1b2c3d4-e5f6-7890-abcd-ef1234567891",

  // Notify characteristic - receive messages from peer
  MESSAGE_RX: "a1b2c3d4-e5f6-7890-abcd-ef1234567892",

  // Read characteristic - peer's public identity
  IDENTITY: "a1b2c3d4-e5f6-7890-abcd-ef1234567893",

  // Read/Notify characteristic - connection status
  STATUS: "a1b2c3d4-e5f6-7890-abcd-ef1234567894"
};

// Message types for the protocol
export const MSG_TYPE = {
  DIRECT: 0x01, // Direct message to specific recipient
  BROADCAST: 0x02, // Broadcast to all nearby peers
  ACK: 0x03, // Acknowledgment
  DISCOVERY: 0x04, // Peer discovery
  IDENTITY: 0x05 // Identity exchange
};

// Configuration
export const CONFIG = {
  // Maximum Transfer Unit (bytes)
  MTU: 512,

  // Chunk size for large messages (leave room for header)
  CHUNK_SIZE: 500,

  // Scan duration in milliseconds
  SCAN_DURATION_MS: 10000,

  // Connection timeout in milliseconds
  CONNECT_TIMEOUT_MS: 5000,

  // Number of retry attempts
  RETRY_COUNT: 3,

  // Delay between retries in milliseconds
  RETRY_DELAY_MS: 1000,

  // Delay between chunks in milliseconds
  CHUNK_DELAY_MS: 50
};

// Error codes
export const BLE_ERROR = {
  NOT_SUPPORTED: "BLE_NOT_SUPPORTED",
  PERMISSION_DENIED: "BLE_PERMISSION_DENIED",
  DEVICE_NOT_FOUND: "BLE_DEVICE_NOT_FOUND",
  CONNECTION_FAILED: "BLE_CONNECTION_FAILED",
  DISCONNECTED: "BLE_DISCONNECTED",
  SEND_FAILED: "BLE_SEND_FAILED",
  RECEIVE_FAILED: "BLE_RECEIVE_FAILED"
};
