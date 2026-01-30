# Technical Roadmap - Implementation Details
## 技術的実装ロードマップ詳細

---

## 1. 即座に対処すべき問題

### 1.1 鍵エクスポートの脆弱性修正

**現在のコード（危険）**:
```javascript
// app/index.html:328-339 - XOR暗号化は暗号化ではない
const passwordHash = nacl.hash(nacl.util.decodeUTF8(password));
encrypted[i] = dataBytes[i] ^ passwordHash[i % passwordHash.length];
```

**推奨実装（Argon2id + NaCl secretbox）**:

```javascript
// 新しい crypto/key-backup.js

import argon2 from 'argon2-browser';

const ARGON2_CONFIG = {
  type: argon2.ArgonType.Argon2id,
  time: 3,        // iterations
  mem: 65536,     // 64 MB
  parallelism: 4,
  hashLen: 32     // 256 bits for secretbox key
};

/**
 * パスワードから暗号化鍵を導出（安全）
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
 * 鍵をパスワードで暗号化（安全）
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
 * 暗号化された鍵を復号（安全）
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

## 2. Bluetooth BLE メッシュ実装

### 2.1 アーキテクチャ

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

### 2.2 BLE GATT Service 設計

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

### 2.3 Web Bluetooth 実装

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
   * デバイス検索とスキャン
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
   * デバイスに接続
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
   * メッセージ送信（チャンク対応）
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
   * メッセージをチャンクに分割
   */
  chunkMessage(data) {
    const chunks = [];
    for (let i = 0; i < data.length; i += BLE_CONFIG.CHUNK_SIZE) {
      chunks.push(data.slice(i, i + BLE_CONFIG.CHUNK_SIZE));
    }
    return chunks;
  }

  /**
   * 受信メッセージの処理
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
   * 切断処理
   */
  handleDisconnect() {
    console.log('BLE disconnected');
    this.server = null;
    this.service = null;
  }

  /**
   * 切断
   */
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
  }
}
```

### 2.4 メッシュルーティング（将来）

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
   * ルート更新
   */
  updateRoute(destination, nextHop, hopCount) {
    const existing = this.routingTable.get(destination);

    if (!existing || hopCount < existing[1]) {
      this.routingTable.set(destination, [nextHop, hopCount, Date.now()]);
    }
  }

  /**
   * メッセージ転送判定
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
   * 次のホップを取得
   */
  getNextHop(destination) {
    const route = this.routingTable.get(destination);
    return route ? route[0] : null;
  }

  /**
   * キャッシュクリーンアップ
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

## 3. グループメッセージング設計

### 3.1 Sender Keys プロトコル（Signal方式）

```
グループメッセージの暗号化フロー:

1. グループ作成時:
   - グループID生成（random UUID）
   - 作成者がグループ鍵ペア生成
   - 各メンバーに個別に鍵配布（1対1暗号化）

2. メッセージ送信時:
   - 送信者のSender Keyで暗号化（対称鍵）
   - 全メンバーが同じ鍵で復号可能
   - ラチェット: メッセージごとに鍵を進める

3. メンバー追加時:
   - 新メンバーに現在のSender Key配布
   - 過去のメッセージは復号不可（forward secrecy）

4. メンバー削除時:
   - 新しいSender Key生成・配布
   - 削除されたメンバーは以降のメッセージ復号不可
```

### 3.2 データ構造

```javascript
// crypto/group.js

/**
 * グループ情報
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
 * グループメッセージ
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

### 3.3 グループ暗号化実装

```javascript
// crypto/group-crypto.js

export class GroupCrypto {
  /**
   * 新しいSender Keyを生成
   */
  generateSenderKey(nacl) {
    return {
      version: 1,
      signatureKey: nacl.sign.keyPair(),
      chainKey: nacl.randomBytes(32)
    };
  }

  /**
   * チェーンキーをラチェット
   */
  ratchetChainKey(chainKey, nacl) {
    return nacl.hash(chainKey).slice(0, 32);
  }

  /**
   * メッセージキーを導出
   */
  deriveMessageKey(chainKey, nacl) {
    const info = nacl.util.decodeUTF8('DMESH_GROUP_MSG_KEY');
    return nacl.hash(new Uint8Array([...chainKey, ...info])).slice(0, 32);
  }

  /**
   * グループメッセージを暗号化
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
   * グループメッセージを復号
   */
  decryptGroupMessage({ message, senderKey, expectedSenderSignPK }, nacl, naclUtil) {
    // 署名検証
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

    // 復号
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

## 4. TypeScript移行計画

### 4.1 型定義

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

### 4.2 移行ステップ

```
1. tsconfig.json設定（完了済み）
2. 型定義ファイル作成
3. crypto/core.js → crypto/core.ts
4. crypto/errors.js → crypto/errors.ts
5. 新機能はTypeScriptで記述
6. テストをTypeScriptに移行
7. app/index.html のスクリプトを分離
8. Viteビルドシステム導入
```

---

## 5. テスト戦略

### 5.1 テストピラミッド

```
           /\
          /  \  E2E Tests (Playwright)
         /----\  - 実際のBluetooth通信
        /      \ - 暗号化→復号フロー
       /--------\
      /          \  Integration Tests
     /------------\  - BLE + Crypto
    /              \ - IndexedDB + UI
   /----------------\
  /                  \  Unit Tests (現在)
 /--------------------\  - crypto/core
/______________________\ - crypto/errors
```

### 5.2 追加すべきテスト

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

---

## 6. パフォーマンス最適化

### 6.1 Web Worker活用

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

### 6.2 IndexedDB最適化

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

## 7. セキュリティ監査チェックリスト

### 実施前チェック

- [ ] 依存関係の脆弱性スキャン（npm audit）
- [ ] 秘密鍵のメモリ残留確認
- [ ] タイミング攻撃の可能性確認
- [ ] XSS/CSRF防止確認
- [ ] CSPヘッダー設定確認

### 監査項目

1. **暗号実装**
   - [ ] TweetNaClのバージョン確認（1.0.3）
   - [ ] nonce生成の一意性確認
   - [ ] 鍵導出関数のパラメータ確認
   - [ ] 署名スキームの正確性

2. **プロトコル**
   - [ ] 受信者バインディングの有効性
   - [ ] リプレイ保護の完全性
   - [ ] タイムスタンプ検証の精度

3. **ストレージ**
   - [ ] IndexedDB暗号化の必要性検討
   - [ ] セッション終了時の鍵消去
   - [ ] バックアップ暗号化の強度

4. **通信**
   - [ ] BLE通信の認証
   - [ ] 中間者攻撃への耐性
   - [ ] DoS攻撃への対策

---

## 8. 継続的改善

### メトリクス収集（プライバシー保護）

```javascript
// analytics/privacy-preserving.js

// ローカルのみ、サーバーには送信しない
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

  // ユーザーが自分のメトリクスを見れるようにする
  getReport() {
    return { ...this.metrics, generatedAt: new Date().toISOString() };
  }
}
```

---

## 次のステップ

1. **今週**: 鍵バックアップのセキュリティ修正をPR
2. **来週**: Web Bluetooth APIのPoCを作成
3. **2週間後**: BLE基本送受信のPR
4. **1ヶ月後**: グループ機能の設計レビュー

---

*このドキュメントは技術的な実装詳細を提供します。*
*戦略的な分析は DEEP_DIVE_ANALYSIS.md を参照してください。*
