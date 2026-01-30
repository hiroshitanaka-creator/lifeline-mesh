# Technical Roadmap - Implementation Details

> *[日本語版はこちら / Japanese version](docs/TECHNICAL_ROADMAP_JA.md)*

This document provides detailed technical implementation guidance for Lifeline Mesh.

---

## Table of Contents

1. [Immediate Issues to Address](#1-immediate-issues-to-address)
2. [Bluetooth BLE Mesh Implementation](#2-bluetooth-ble-mesh-implementation)
3. [Group Messaging Design](#3-group-messaging-design)
4. [TypeScript Migration Plan](#4-typescript-migration-plan)
5. [Testing Strategy](#5-testing-strategy)
6. [Performance Optimization](#6-performance-optimization)
7. [Security Audit Checklist](#7-security-audit-checklist)
8. [Continuous Improvement](#8-continuous-improvement)

---

## 1. Immediate Issues to Address

### 1.1 Key Export Vulnerability Fix

**Current code (DANGEROUS)**:
```javascript
// app/index.html:328-339 - XOR encryption is NOT encryption
const passwordHash = nacl.hash(nacl.util.decodeUTF8(password));
encrypted[i] = dataBytes[i] ^ passwordHash[i % passwordHash.length];
```

**Recommended implementation (Argon2id + NaCl secretbox)**:

```javascript
// New file: crypto/key-backup.js

import argon2 from 'argon2-browser';

const ARGON2_CONFIG = {
  type: argon2.ArgonType.Argon2id,
  time: 3,        // iterations
  mem: 65536,     // 64 MB
  parallelism: 4,
  hashLen: 32     // 256 bits for secretbox key
};

/**
 * Derive encryption key from password (secure)
 */
export async function deriveKey(password, salt) {
  const result = await argon2.hash({
    pass: password,
    salt: salt || nacl.randomBytes(16),
    ...ARGON2_CONFIG
  });
  return {
    key: result.hash,
    salt: result.salt
  };
}

/**
 * Encrypt keys with password (secure)
 */
export async function encryptKeys(keys, password) {
  const salt = nacl.randomBytes(16);
  const { key } = await deriveKey(password, salt);

  const plaintext = nacl.util.decodeUTF8(JSON.stringify(keys));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  return {
    version: 2,
    kdf: 'argon2id',
    salt: nacl.util.encodeBase64(salt),
    nonce: nacl.util.encodeBase64(nonce),
    ciphertext: nacl.util.encodeBase64(ciphertext)
  };
}

/**
 * Decrypt encrypted keys (secure)
 */
export async function decryptKeys(encrypted, password) {
  if (encrypted.version !== 2 || encrypted.kdf !== 'argon2id') {
    throw new Error('Unsupported backup format');
  }

  const salt = nacl.util.decodeBase64(encrypted.salt);
  const nonce = nacl.util.decodeBase64(encrypted.nonce);
  const ciphertext = nacl.util.decodeBase64(encrypted.ciphertext);

  const { key } = await deriveKey(password, salt);
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);

  if (!plaintext) {
    throw new Error('Decryption failed - wrong password');
  }

  return JSON.parse(nacl.util.encodeUTF8(plaintext));
}
```

---

## 2. Bluetooth BLE Mesh Implementation

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Lifeline Mesh BLE Layer                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Device A   │←──→│   Device B   │←──→│   Device C   │  │
│  │  (GATT Server│    │(GATT Client/ │    │ (GATT Client)│  │
│  │   + Client)  │    │   Server)    │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                               │
│                    ┌────────┴────────┐                     │
│                    │  Message Queue  │                     │
│                    │  (IndexedDB)    │                     │
│                    └─────────────────┘                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 BLE GATT Service Design

```javascript
// bluetooth/constants.js

export const BLE_SERVICE = {
  // Lifeline Mesh Service UUID (v4 random)
  SERVICE_UUID: '12345678-1234-5678-1234-56789abcdef0',

  // Characteristics
  CHAR_MESSAGE_TX: '12345678-1234-5678-1234-56789abcdef1',  // Write
  CHAR_MESSAGE_RX: '12345678-1234-5678-1234-56789abcdef2',  // Notify
  CHAR_IDENTITY: '12345678-1234-5678-1234-56789abcdef3',    // Read
  CHAR_STATUS: '12345678-1234-5678-1234-56789abcdef4',      // Read/Notify

  // Message types
  MSG_TYPE_DIRECT: 0x01,
  MSG_TYPE_BROADCAST: 0x02,
  MSG_TYPE_ACK: 0x03,
  MSG_TYPE_DISCOVERY: 0x04,
};

export const BLE_CONFIG = {
  MTU: 512,                    // Maximum Transfer Unit
  CHUNK_SIZE: 500,             // Message chunk size
  SCAN_DURATION: 10000,        // 10 seconds
  CONNECT_TIMEOUT: 5000,       // 5 seconds
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
};
```

### 2.3 Web Bluetooth Implementation

```javascript
// bluetooth/ble-manager.js

export class BLEManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.peers = new Map();
    this.messageQueue = [];
    this.onMessageReceived = null;
  }

  /**
   * Check if Web Bluetooth is supported
   */
  static isSupported() {
    return 'bluetooth' in navigator;
  }

  /**
   * Scan for devices
   */
  async scan() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not supported');
    }

    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE.SERVICE_UUID] }],
        optionalServices: [BLE_SERVICE.SERVICE_UUID]
      });

      this.device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      return this.device;
    } catch (error) {
      if (error.name === 'NotFoundError') {
        throw new Error('No Lifeline Mesh devices found nearby');
      }
      throw error;
    }
  }

  /**
   * Connect to device
   */
  async connect(device = this.device) {
    if (!device) {
      throw new Error('No device to connect');
    }

    this.server = await device.gatt.connect();
    this.service = await this.server.getPrimaryService(BLE_SERVICE.SERVICE_UUID);

    // Subscribe to notifications
    const rxChar = await this.service.getCharacteristic(BLE_SERVICE.CHAR_MESSAGE_RX);
    await rxChar.startNotifications();
    rxChar.addEventListener('characteristicvaluechanged', (event) => {
      this.handleIncomingMessage(event.target.value);
    });

    return this.service;
  }

  /**
   * Send message (with chunking support)
   */
  async sendMessage(message, recipientId = null) {
    if (!this.service) {
      throw new Error('Not connected');
    }

    const txChar = await this.service.getCharacteristic(BLE_SERVICE.CHAR_MESSAGE_TX);
    const messageBytes = new TextEncoder().encode(JSON.stringify(message));

    // Chunk if necessary
    const chunks = this.chunkMessage(messageBytes);

    for (let i = 0; i < chunks.length; i++) {
      const header = new Uint8Array([
        BLE_SERVICE.MSG_TYPE_DIRECT,
        i,                    // chunk index
        chunks.length,        // total chunks
        0                     // reserved
      ]);

      const packet = new Uint8Array([...header, ...chunks[i]]);
      await txChar.writeValue(packet);

      // Small delay between chunks
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }

  /**
   * Chunk message into smaller pieces
   */
  chunkMessage(data) {
    const chunks = [];
    for (let i = 0; i < data.length; i += BLE_CONFIG.CHUNK_SIZE) {
      chunks.push(data.slice(i, i + BLE_CONFIG.CHUNK_SIZE));
    }
    return chunks;
  }

  /**
   * Handle incoming message
   */
  handleIncomingMessage(dataView) {
    const type = dataView.getUint8(0);
    const chunkIndex = dataView.getUint8(1);
    const totalChunks = dataView.getUint8(2);
    const payload = new Uint8Array(dataView.buffer.slice(4));

    // Reassemble chunks
    if (!this.reassemblyBuffer) {
      this.reassemblyBuffer = new Array(totalChunks);
    }
    this.reassemblyBuffer[chunkIndex] = payload;

    // Check if complete
    if (this.reassemblyBuffer.filter(Boolean).length === totalChunks) {
      const complete = new Uint8Array(
        this.reassemblyBuffer.reduce((acc, chunk) => [...acc, ...chunk], [])
      );
      this.reassemblyBuffer = null;

      const messageText = new TextDecoder().decode(complete);
      const message = JSON.parse(messageText);

      if (this.onMessageReceived) {
        this.onMessageReceived(message);
      }
    }
  }

  /**
   * Handle disconnection
   */
  handleDisconnect() {
    console.log('BLE disconnected');
    this.server = null;
    this.service = null;
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
  }
}
```

### 2.4 Mesh Routing (Future)

```javascript
// bluetooth/mesh-router.js

export class MeshRouter {
  constructor() {
    this.routingTable = new Map();  // peerId -> [nextHop, hopCount, timestamp]
    this.messageCache = new Map();  // messageId -> [timestamp, delivered]
    this.TTL_DEFAULT = 5;
    this.CACHE_DURATION = 60000;    // 1 minute
  }

  /**
   * Update route
   */
  updateRoute(destination, nextHop, hopCount) {
    const existing = this.routingTable.get(destination);

    if (!existing || hopCount < existing[1]) {
      this.routingTable.set(destination, [nextHop, hopCount, Date.now()]);
    }
  }

  /**
   * Determine if message should be forwarded
   */
  shouldForward(messageId, ttl) {
    // Already seen?
    if (this.messageCache.has(messageId)) {
      return false;
    }

    // TTL expired?
    if (ttl <= 0) {
      return false;
    }

    this.messageCache.set(messageId, [Date.now(), false]);
    return true;
  }

  /**
   * Get next hop for destination
   */
  getNextHop(destination) {
    const route = this.routingTable.get(destination);
    return route ? route[0] : null;
  }

  /**
   * Cleanup old cache entries
   */
  cleanup() {
    const now = Date.now();

    for (const [id, [timestamp]] of this.messageCache) {
      if (now - timestamp > this.CACHE_DURATION) {
        this.messageCache.delete(id);
      }
    }
  }
}
```

---

## 3. Group Messaging Design

### 3.1 Sender Keys Protocol (Signal-style)

```
Group message encryption flow:

1. Group creation:
   - Generate group ID (random UUID)
   - Creator generates group key pair
   - Distribute keys to each member individually (1-to-1 encryption)

2. Sending message:
   - Encrypt with sender's Sender Key (symmetric key)
   - All members can decrypt with same key
   - Ratchet: advance key after each message

3. Adding member:
   - Distribute current Sender Key to new member
   - Past messages cannot be decrypted (forward secrecy)

4. Removing member:
   - Generate & distribute new Sender Key
   - Removed member cannot decrypt future messages
```

### 3.2 Data Structures

```javascript
// crypto/group.js

/**
 * Group information
 */
export const GroupSchema = {
  id: 'string',           // UUID
  name: 'string',
  createdAt: 'number',
  createdBy: 'string',    // creator's fingerprint
  members: [{
    fp: 'string',         // fingerprint
    signPK: 'string',
    boxPK: 'string',
    role: 'admin|member',
    addedAt: 'number'
  }],
  senderKey: {
    version: 'number',
    key: 'string',        // encrypted for each member
    chainKey: 'string'
  }
};

/**
 * Group message
 */
export const GroupMessageSchema = {
  v: 1,
  kind: 'dmesh-group-msg',
  groupId: 'string',
  ts: 'number',
  senderSignPK: 'string',
  senderKeyVersion: 'number',
  nonce: 'string',
  ciphertext: 'string',
  signature: 'string'
};
```

### 3.3 Group Encryption Implementation

```javascript
// crypto/group-crypto.js

export class GroupCrypto {
  /**
   * Generate new Sender Key
   */
  generateSenderKey(nacl) {
    return {
      version: 1,
      signatureKey: nacl.sign.keyPair(),
      chainKey: nacl.randomBytes(32)
    };
  }

  /**
   * Ratchet chain key
   */
  ratchetChainKey(chainKey, nacl) {
    return nacl.hash(chainKey).slice(0, 32);
  }

  /**
   * Derive message key
   */
  deriveMessageKey(chainKey, nacl) {
    const info = nacl.util.decodeUTF8('DMESH_GROUP_MSG_KEY');
    return nacl.hash(new Uint8Array([...chainKey, ...info])).slice(0, 32);
  }

  /**
   * Encrypt group message
   */
  encryptGroupMessage({ content, groupId, senderKey, senderSignSK }, nacl, naclUtil) {
    const messageKey = this.deriveMessageKey(senderKey.chainKey, nacl);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    const payload = {
      v: 1,
      ts: Date.now(),
      content
    };

    const plaintext = naclUtil.decodeUTF8(JSON.stringify(payload));
    const ciphertext = nacl.secretbox(plaintext, nonce, messageKey);

    const signBytes = this.buildGroupSignBytes({
      groupId,
      senderKeyVersion: senderKey.version,
      nonce,
      ciphertext
    }, naclUtil);

    const signature = nacl.sign.detached(signBytes, senderSignSK);

    return {
      v: 1,
      kind: 'dmesh-group-msg',
      groupId,
      ts: Date.now(),
      senderSignPK: naclUtil.encodeBase64(senderSignSK.slice(32)),
      senderKeyVersion: senderKey.version,
      nonce: naclUtil.encodeBase64(nonce),
      ciphertext: naclUtil.encodeBase64(ciphertext),
      signature: naclUtil.encodeBase64(signature)
    };
  }

  /**
   * Decrypt group message
   */
  decryptGroupMessage({ message, senderKey, expectedSenderSignPK }, nacl, naclUtil) {
    // Verify signature
    const senderSignPK = naclUtil.decodeBase64(message.senderSignPK);
    const signBytes = this.buildGroupSignBytes({
      groupId: message.groupId,
      senderKeyVersion: message.senderKeyVersion,
      nonce: naclUtil.decodeBase64(message.nonce),
      ciphertext: naclUtil.decodeBase64(message.ciphertext)
    }, naclUtil);

    const signature = naclUtil.decodeBase64(message.signature);
    if (!nacl.sign.detached.verify(signBytes, signature, senderSignPK)) {
      throw new Error('Invalid group message signature');
    }

    // Decrypt
    const messageKey = this.deriveMessageKey(senderKey.chainKey, nacl);
    const plaintext = nacl.secretbox.open(
      naclUtil.decodeBase64(message.ciphertext),
      naclUtil.decodeBase64(message.nonce),
      messageKey
    );

    if (!plaintext) {
      throw new Error('Group message decryption failed');
    }

    const payload = JSON.parse(naclUtil.encodeUTF8(plaintext));
    return payload;
  }

  buildGroupSignBytes({ groupId, senderKeyVersion, nonce, ciphertext }, naclUtil) {
    const domain = naclUtil.decodeUTF8('DMESH_GROUP_V1');
    const groupIdBytes = naclUtil.decodeUTF8(groupId);
    const versionBytes = new Uint8Array([senderKeyVersion]);

    return new Uint8Array([
      ...domain,
      ...groupIdBytes,
      ...versionBytes,
      ...nonce,
      ...ciphertext
    ]);
  }
}
```

---

## 4. TypeScript Migration Plan

### 4.1 Type Definitions

```typescript
// types/index.ts

export interface PublicIdentity {
  v: 1;
  kind: 'dmesh-id';
  name: string;
  fp: string;
  signPK: string;
  boxPK: string;
}

export interface EncryptedMessage {
  v: 1;
  kind: 'dmesh-msg';
  ts: number;
  senderSignPK: string;
  senderBoxPK: string;
  recipientBoxPK: string;
  ephPK: string;
  nonce: string;
  ciphertext: string;
  signature: string;
}

export interface Contact {
  fp: string;
  name: string;
  signPK: string;
  boxPK: string;
  addedAt: number;
  lastSeen?: number;
}

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface DecryptResult {
  content: string;
  senderSignPK: Uint8Array;
  senderBoxPK: Uint8Array;
  senderFp: Uint8Array;
  ts: number;
}

export type ErrorCategory =
  | 'CRYPTO'
  | 'VALIDATION'
  | 'STORAGE'
  | 'NETWORK'
  | 'FORMAT'
  | 'SECURITY';

export type ErrorCode =
  | 'DECRYPTION_FAILED'
  | 'SIGNATURE_INVALID'
  | 'KEY_GENERATION_FAILED'
  | 'TIMESTAMP_SKEW'
  | 'RECIPIENT_MISMATCH'
  | 'REPLAY_DETECTED'
  | 'INVALID_MESSAGE_FORMAT'
  | 'BASE64_DECODE_FAILED'
  | 'JSON_PARSE_FAILED'
  | 'KEY_LENGTH_INVALID'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'
  | 'SENDER_KEY_MISMATCH';
```

### 4.2 Migration Steps

```
1. tsconfig.json setup (already done)
2. Create type definition files
3. crypto/core.js → crypto/core.ts
4. crypto/errors.js → crypto/errors.ts
5. Write new features in TypeScript
6. Migrate tests to TypeScript
7. Extract app/index.html scripts
8. Introduce Vite build system
```

---

## 5. Testing Strategy

### 5.1 Test Pyramid

```
           /\
          /  \  E2E Tests (Playwright)
         /----\  - Real Bluetooth communication
        /      \ - Encrypt → Decrypt flow
       /--------\
      /          \  Integration Tests
     /------------\  - BLE + Crypto
    /              \ - IndexedDB + UI
   /----------------\
  /                  \  Unit Tests (current)
 /--------------------\  - crypto/core
/______________________\ - crypto/errors
```

### 5.2 Tests to Add

```javascript
// tests/integration/ble.test.js

describe('BLE Integration', () => {
  test('two devices can exchange messages', async () => {
    // Mock Web Bluetooth
    const device1 = new MockBLEDevice('device1');
    const device2 = new MockBLEDevice('device2');

    const manager1 = new BLEManager();
    const manager2 = new BLEManager();

    await manager1.connect(device1);
    await manager2.connect(device2);

    // Link devices
    MockBLENetwork.link(device1, device2);

    // Send message
    const message = { test: 'hello' };
    let received = null;
    manager2.onMessageReceived = (msg) => { received = msg; };

    await manager1.sendMessage(message);

    expect(received).toEqual(message);
  });
});
```

### 5.3 Test Commands

```bash
# All tests
npm test

# Unit tests only
npm run test:crypto

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

---

## 6. Performance Optimization

### 6.1 Web Worker Usage

```javascript
// workers/crypto-worker.js

import * as DMesh from '../crypto/core.js';

self.onmessage = async (event) => {
  const { type, payload, id } = event.data;

  try {
    let result;

    switch (type) {
      case 'encrypt':
        result = DMesh.encryptMessage(payload, nacl, nacl.util);
        break;
      case 'decrypt':
        result = DMesh.decryptMessage(payload, nacl, nacl.util);
        break;
      case 'generateKeys':
        result = {
          signKeyPair: DMesh.generateSignKeyPair(nacl),
          boxKeyPair: DMesh.generateBoxKeyPair(nacl)
        };
        break;
    }

    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
```

### 6.2 IndexedDB Optimization

```javascript
// storage/optimized-db.js

export class OptimizedDB {
  constructor() {
    this.cache = new Map();
    this.writeQueue = [];
    this.flushInterval = null;
  }

  async get(store, key) {
    // Check cache first
    const cacheKey = `${store}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Read from DB
    const value = await idbGet(store, key);
    this.cache.set(cacheKey, value);
    return value;
  }

  async put(store, value, key) {
    const cacheKey = `${store}:${key || value.fp}`;
    this.cache.set(cacheKey, value);

    // Queue write
    this.writeQueue.push({ store, value, key });
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.flushInterval) return;

    this.flushInterval = setTimeout(async () => {
      await this.flush();
      this.flushInterval = null;
    }, 100);
  }

  async flush() {
    const batch = [...this.writeQueue];
    this.writeQueue = [];

    const db = await openDB();
    const tx = db.transaction(
      [...new Set(batch.map(b => b.store))],
      'readwrite'
    );

    for (const { store, value, key } of batch) {
      const st = tx.objectStore(store);
      if (key !== undefined) {
        st.put(value, key);
      } else {
        st.put(value);
      }
    }

    await tx.complete;
  }
}
```

---

## 7. Security Audit Checklist

### Pre-Audit Checks

- [ ] Dependency vulnerability scan (npm audit)
- [ ] Check for secret key memory residue
- [ ] Timing attack possibility review
- [ ] XSS/CSRF prevention verification
- [ ] CSP header configuration check

### Audit Items

#### 1. Cryptographic Implementation
- [ ] TweetNaCl version verification (1.0.3)
- [ ] Nonce generation uniqueness verification
- [ ] Key derivation function parameter review
- [ ] Signature scheme correctness

#### 2. Protocol
- [ ] Recipient binding effectiveness
- [ ] Replay protection completeness
- [ ] Timestamp validation accuracy

#### 3. Storage
- [ ] IndexedDB encryption necessity review
- [ ] Key erasure on session end
- [ ] Backup encryption strength

#### 4. Communication
- [ ] BLE communication authentication
- [ ] Man-in-the-middle attack resistance
- [ ] DoS attack countermeasures

---

## 8. Continuous Improvement

### Privacy-Preserving Metrics

```javascript
// analytics/privacy-preserving.js

// Local only, never sent to server
export class LocalMetrics {
  constructor() {
    this.metrics = {
      messagesEncrypted: 0,
      messagesDecrypted: 0,
      errors: {},
      bleConnections: 0,
      avgEncryptTime: 0
    };
  }

  trackEncrypt(durationMs) {
    this.metrics.messagesEncrypted++;
    this.metrics.avgEncryptTime =
      (this.metrics.avgEncryptTime * (this.metrics.messagesEncrypted - 1) + durationMs)
      / this.metrics.messagesEncrypted;
  }

  trackError(code) {
    this.metrics.errors[code] = (this.metrics.errors[code] || 0) + 1;
  }

  // Allow users to see their own metrics
  getReport() {
    return { ...this.metrics, generatedAt: new Date().toISOString() };
  }
}
```

---

## Next Steps

1. **This week**: PR for key backup security fix
2. **Next week**: Create Web Bluetooth API PoC
3. **In 2 weeks**: PR for basic BLE send/receive
4. **In 1 month**: Group feature design review

---

## Contributing

Want to help implement these features? Here's how:

1. **Pick an issue** labeled `good first issue` or `help wanted`
2. **Comment** that you're working on it
3. **Fork** and create a feature branch
4. **Submit PR** with tests and documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

*This document provides technical implementation details.*
*For strategic analysis, see [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md)*
