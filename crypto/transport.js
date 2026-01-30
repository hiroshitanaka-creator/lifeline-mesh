/**
 * Lifeline Mesh - Transport Layer Interface (v1.1)
 *
 * Abstract transport layer for relay-agnostic message delivery.
 * Supports multiple transport mechanisms:
 * - QR Code (camera-based)
 * - Clipboard (copy/paste)
 * - File (AirDrop, Nearby Share, USB)
 * - Bluetooth (via BLE GATT)
 * - Audio (future: ultrasonic/audio encoding)
 *
 * Each transport implements the same interface for seamless switching.
 */

/* global setTimeout, FileReader */

import {
  chunkMessage,
  reassembleChunks,
  QR_MAX_CHUNK_SIZE
} from "./core.js";

// ============================================================================
// Transport Interface
// ============================================================================

/**
 * Base transport interface
 * All transports must implement these methods
 */
export class BaseTransport {
  constructor(options = {}) {
    this.name = "base";
    this.options = options;
    this.nacl = options.nacl;
    this.naclUtil = options.naclUtil;
    this.onMessage = null; // Callback: (message) => void
    this.onChunk = null; // Callback: (chunk) => void
    this.onError = null; // Callback: (error) => void
    this.onPeerDiscovered = null; // Callback: (peer) => void
  }

  /**
   * Get transport capabilities
   * @returns {object}
   */
  getCapabilities() {
    return {
      name: this.name,
      maxPayloadSize: Infinity, // Maximum single message size
      supportsChunking: false, // Whether chunking is needed/supported
      bidirectional: false, // Can both send and receive
      realtime: false, // Supports real-time delivery
      offline: true, // Works without internet
      peerDiscovery: false // Can discover nearby peers
    };
  }

  /**
   * Send a message (or chunks if needed)
   * @param {object} _message - dmesh-msg object
   * @returns {Promise<object[]>} - Array of sent items (message or chunks)
   */
  send(_message) {
    return Promise.reject(new Error("send() must be implemented by transport"));
  }

  /**
   * Receive messages (poll or callback-based)
   * @returns {Promise<object[]>} - Array of received messages
   */
  receive() {
    return Promise.reject(new Error("receive() must be implemented by transport"));
  }

  /**
   * Start listening for incoming messages
   * @returns {Promise<void>}
   */
  startListening() {
    return Promise.reject(new Error("startListening() must be implemented by transport"));
  }

  /**
   * Stop listening for incoming messages
   * @returns {Promise<void>}
   */
  stopListening() {
    return Promise.reject(new Error("stopListening() must be implemented by transport"));
  }

  /**
   * Discover nearby peers (if supported)
   * @returns {Promise<object[]>} - Array of discovered peers
   */
  discoverPeers() {
    return Promise.resolve([]);
  }

  /**
   * Check if transport is available
   * @returns {Promise<boolean>}
   */
  isAvailable() {
    return Promise.resolve(false);
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.onMessage = null;
    this.onChunk = null;
    this.onError = null;
    this.onPeerDiscovered = null;
    return Promise.resolve();
  }
}

// ============================================================================
// QR Code Transport
// ============================================================================

/**
 * QR Code transport for face-to-face message exchange
 * Uses camera scanning and QR generation
 */
export class QRTransport extends BaseTransport {
  constructor(options = {}) {
    super(options);
    this.name = "qr";
    this.maxChunkSize = options.maxChunkSize || QR_MAX_CHUNK_SIZE;
    this.qrScanner = null;
    this.receivedChunks = new Map(); // msgId -> chunks[]
  }

  getCapabilities() {
    return {
      name: this.name,
      maxPayloadSize: this.maxChunkSize,
      supportsChunking: true,
      bidirectional: false, // Asymmetric: show QR or scan, not both
      realtime: false,
      offline: true,
      peerDiscovery: false
    };
  }

  async isAvailable() {
    // Check for camera access
    if (typeof navigator === "undefined") return false;
    if (!navigator.mediaDevices) return false;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(d => d.kind === "videoinput");
    } catch {
      return false;
    }
  }

  /**
   * Generate QR code data for a message
   * Returns array of QR code data strings (chunked if needed)
   *
   * @param {object} message - dmesh-msg object
   * @returns {Promise<string[]>} - Array of JSON strings for QR codes
   */
  send(message) {
    const msgJson = JSON.stringify(message);
    const msgSize = new Blob([msgJson]).size;

    // If small enough, return single QR
    if (msgSize <= this.maxChunkSize - 100) { // 100 byte margin
      return Promise.resolve([msgJson]);
    }

    // Chunk the message
    if (!this.nacl || !this.naclUtil) {
      return Promise.reject(new Error("nacl and naclUtil required for chunking"));
    }

    const chunks = chunkMessage(message, this.maxChunkSize, this.nacl, this.naclUtil);
    return Promise.resolve(chunks.map(c => JSON.stringify(c)));
  }

  /**
   * Process scanned QR code data
   * @param {string} data - Scanned QR code content
   * @returns {object|null} - Complete message if available, null if waiting for chunks
   */
  processScanned(data) {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      if (this.onError) this.onError(new Error("Invalid QR code data"));
      return null;
    }

    // Direct message
    if (parsed.kind === "dmesh-msg") {
      if (this.onMessage) this.onMessage(parsed);
      return parsed;
    }

    // Chunk
    if (parsed.kind === "dmesh-chunk") {
      return this._processChunk(parsed);
    }

    // Identity
    if (parsed.kind === "dmesh-id") {
      // Not a message, but useful for contact exchange
      return parsed;
    }

    return null;
  }

  _processChunk(chunk) {
    const { msgId, seq, total } = chunk;

    if (!this.receivedChunks.has(msgId)) {
      this.receivedChunks.set(msgId, new Array(total).fill(null));
    }

    const chunks = this.receivedChunks.get(msgId);
    chunks[seq] = chunk;

    // Notify chunk received
    if (this.onChunk) {
      this.onChunk({
        msgId,
        seq,
        total,
        received: chunks.filter(c => c !== null).length
      });
    }

    // Check if complete
    if (chunks.every(c => c !== null)) {
      this.receivedChunks.delete(msgId);

      if (!this.naclUtil) {
        if (this.onError) this.onError(new Error("naclUtil required for reassembly"));
        return null;
      }

      try {
        const message = reassembleChunks(chunks, this.naclUtil);
        if (this.onMessage) this.onMessage(message);
        return message;
      } catch (e) {
        if (this.onError) this.onError(e);
        return null;
      }
    }

    return null; // Still waiting for more chunks
  }

  /**
   * Get chunk progress for a message
   * @param {string} msgId - Message ID
   * @returns {object|null}
   */
  getChunkProgress(msgId) {
    const chunks = this.receivedChunks.get(msgId);
    if (!chunks) return null;
    return {
      msgId,
      total: chunks.length,
      received: chunks.filter(c => c !== null).length,
      missing: chunks.map((c, i) => c === null ? i : -1).filter(i => i >= 0)
    };
  }

  /**
   * Clear incomplete chunk buffers
   */
  clearChunks() {
    this.receivedChunks.clear();
  }
}

// ============================================================================
// Clipboard Transport
// ============================================================================

/**
 * Clipboard transport for copy/paste message exchange
 * Works across applications and devices (via shared clipboard)
 */
export class ClipboardTransport extends BaseTransport {
  constructor(options = {}) {
    super(options);
    this.name = "clipboard";
  }

  getCapabilities() {
    return {
      name: this.name,
      maxPayloadSize: Infinity, // Clipboard has no practical limit
      supportsChunking: false, // Usually not needed
      bidirectional: true, // Can copy and paste
      realtime: false,
      offline: true,
      peerDiscovery: false
    };
  }

  isAvailable() {
    if (typeof navigator === "undefined") return Promise.resolve(false);
    return Promise.resolve(Boolean(navigator.clipboard));
  }

  /**
   * Copy message to clipboard
   * @param {object} message - dmesh-msg object
   * @returns {Promise<string[]>}
   */
  async send(message) {
    const text = JSON.stringify(message, null, 2);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      this._fallbackCopy(text);
    }

    return [text];
  }

  _fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  /**
   * Read message from clipboard
   * @returns {Promise<object[]>}
   */
  async receive() {
    let text;

    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        // Permission denied or not available
        if (this.onError) this.onError(e);
        return [];
      }
    } else {
      // Fallback not available for reading
      return [];
    }

    if (!text) return [];

    // Try to parse as dmesh message
    try {
      const parsed = JSON.parse(text);
      if (parsed.kind === "dmesh-msg" || parsed.kind === "dmesh-id") {
        if (this.onMessage) this.onMessage(parsed);
        return [parsed];
      }
    } catch {
      // Not a valid message
    }

    return [];
  }
}

// ============================================================================
// File Transport
// ============================================================================

/**
 * File transport for message exchange via files
 * Works with AirDrop, Nearby Share, USB, email attachments
 */
export class FileTransport extends BaseTransport {
  constructor(options = {}) {
    super(options);
    this.name = "file";
    this.fileExtension = options.fileExtension || ".dmesh";
    this.mimeType = options.mimeType || "application/json";
  }

  getCapabilities() {
    return {
      name: this.name,
      maxPayloadSize: Infinity,
      supportsChunking: false,
      bidirectional: true,
      realtime: false,
      offline: true,
      peerDiscovery: false
    };
  }

  isAvailable() {
    if (typeof document === "undefined") return Promise.resolve(false);
    // Check for File API
    return Promise.resolve(Boolean(window.File) && Boolean(window.FileReader) && Boolean(window.Blob));
  }

  /**
   * Download message as file
   * @param {object} message - dmesh-msg object
   * @param {string} [filename] - Optional filename
   * @returns {Promise<string[]>}
   */
  send(message, filename) {
    const text = JSON.stringify(message, null, 2);
    const blob = new Blob([text], { type: this.mimeType });

    const defaultName = message.kind === "dmesh-id"
      ? `identity-${message.fp?.slice(0, 8) || "unknown"}${this.fileExtension}`
      : `message-${message.msgId?.slice(0, 8) || Date.now()}${this.fileExtension}`;

    const name = filename || defaultName;

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    return Promise.resolve([text]);
  }

  /**
   * Read message from file
   * @param {File} file - File object
   * @returns {Promise<object[]>}
   */
  receive(file) {
    if (!file) return Promise.resolve([]);

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed.kind === "dmesh-msg" || parsed.kind === "dmesh-id") {
            if (this.onMessage) this.onMessage(parsed);
            resolve([parsed]);
          } else {
            resolve([]);
          }
        } catch (err) {
          if (this.onError) this.onError(err);
          resolve([]);
        }
      };

      reader.onerror = () => {
        if (this.onError) this.onError(reader.error);
        resolve([]);
      };

      reader.readAsText(file);
    });
  }

  /**
   * Create a file input element for receiving files
   * @param {function} onFileSelected - Callback when file is selected
   * @returns {HTMLInputElement}
   */
  createFileInput(onFileSelected) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${this.fileExtension},.json,application/json`;
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const messages = await this.receive(file);
        if (onFileSelected) onFileSelected(messages);
      }
    };

    return input;
  }
}

// ============================================================================
// Transport Manager
// ============================================================================

/**
 * Manages multiple transports and provides unified interface
 */
export class TransportManager {
  constructor(options = {}) {
    this.transports = new Map();
    this.nacl = options.nacl;
    this.naclUtil = options.naclUtil;
    this.onMessage = null;
    this.onError = null;

    // Initialize default transports
    if (options.autoInit !== false) {
      this.registerTransport(new QRTransport({
        nacl: this.nacl,
        naclUtil: this.naclUtil
      }));
      this.registerTransport(new ClipboardTransport({
        nacl: this.nacl,
        naclUtil: this.naclUtil
      }));
      this.registerTransport(new FileTransport({
        nacl: this.nacl,
        naclUtil: this.naclUtil
      }));
    }
  }

  /**
   * Register a transport
   * @param {BaseTransport} transport
   */
  registerTransport(transport) {
    transport.onMessage = (msg) => {
      if (this.onMessage) this.onMessage(msg, transport.name);
    };
    transport.onError = (err) => {
      if (this.onError) this.onError(err, transport.name);
    };
    this.transports.set(transport.name, transport);
  }

  /**
   * Get a specific transport
   * @param {string} name - Transport name
   * @returns {BaseTransport|undefined}
   */
  getTransport(name) {
    return this.transports.get(name);
  }

  /**
   * Get all available transports
   * @returns {Promise<object[]>}
   */
  async getAvailableTransports() {
    const results = [];
    for (const [name, transport] of this.transports) {
      const available = await transport.isAvailable();
      if (available) {
        results.push({
          name,
          capabilities: transport.getCapabilities()
        });
      }
    }
    return results;
  }

  /**
   * Send message via specific transport
   * @param {string} transportName - Transport to use
   * @param {object} message - Message to send
   * @returns {Promise<string[]>}
   */
  send(transportName, message) {
    const transport = this.transports.get(transportName);
    if (!transport) {
      return Promise.reject(new Error(`Transport not found: ${transportName}`));
    }
    return transport.send(message);
  }

  /**
   * Receive from specific transport
   * @param {string} transportName - Transport to use
   * @param {*} [arg] - Transport-specific argument (e.g., File for FileTransport)
   * @returns {Promise<object[]>}
   */
  receive(transportName, arg) {
    const transport = this.transports.get(transportName);
    if (!transport) {
      return Promise.reject(new Error(`Transport not found: ${transportName}`));
    }
    return transport.receive(arg);
  }

  /**
   * Clean up all transports
   */
  async dispose() {
    for (const transport of this.transports.values()) {
      await transport.dispose();
    }
    this.transports.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a transport manager with all available transports
 * @param {object} options - nacl, naclUtil
 * @returns {TransportManager}
 */
export function createTransportManager(options) {
  return new TransportManager(options);
}

/**
 * Get best available transport for sending
 * Prefers: Clipboard > QR > File
 * @param {TransportManager} manager
 * @returns {Promise<string|null>}
 */
export async function getBestTransport(manager) {
  const available = await manager.getAvailableTransports();

  // Prefer clipboard for quick text sharing
  if (available.some(t => t.name === "clipboard")) {
    return "clipboard";
  }

  // QR for face-to-face
  if (available.some(t => t.name === "qr")) {
    return "qr";
  }

  // File as fallback
  if (available.some(t => t.name === "file")) {
    return "file";
  }

  return null;
}
