# Lifeline Mesh リポジトリ包括分析レポート

> 生成日: 2026-02-07

## 1. 現状：何が実装されていて、どう動作するか

### プロジェクト概要

Lifeline Mesh はブラウザベースのエンドツーエンド暗号化・緊急メッセージングシステム。サーバー不要・オフラインファーストで、災害時に近距離通信（QR/Bluetooth/クリップボード/ファイル）を通じて暗号化メッセージを送受信する。

### アーキテクチャ全体像

```
+--------------------------------------------------------------+
|                     app/index.html (UI)                       |
|   913行の単一HTMLファイル・インラインJS・PWA対応               |
+------------------+------------------+------------------------+
|  crypto/core.js  | crypto/store.js  | bluetooth/ble-manager  |
|  暗号コア(614行) | IndexedDB永続化  |  BLE通信管理(374行)    |
+------------------+------------------+------------------------+
| crypto/transport | crypto/key-backup| crypto/errors.js       |
| トランスポート抽象| 鍵バックアップ   | エラーハンドリング     |
+------------------+------------------+------------------------+
        |                  |                    |
   TweetNaCl 1.0.3    IndexedDB API     Web Bluetooth API
```

### 実装済みの動作フロー

**鍵管理フロー:**
1. `crypto/core.js` で Ed25519（署名用）+ X25519（暗号化用）の鍵ペアを生成
2. IndexedDB に保存
3. `dmesh-id` 形式の公開IDを生成し、QRコード/クリップボードで共有可能

**暗号化フロー (`encryptMessage`):**
1. エフェメラル X25519 鍵ペアを毎回生成（前方秘匿性の近似）
2. `nacl.box.before` + `nacl.box.after` でペイロードを暗号化
3. `DMESH_MSG_V1` ドメイン分離付きの SignBytes を構築
4. Ed25519 で detached signature を生成
5. v1.1: メッセージID（SHA-512先頭32バイト）、TTL/有効期限を付与

**復号フロー (`decryptMessage`):**
1. Base64デコード -> フィールド長検証
2. v1.1: 有効期限ベースのバリデーション（DTN対応）/ v1.0: タイムスタンプskew検証
3. 受信者バインディング検証（`recipientBoxPK` 一致確認）
4. 送信者の鍵一致チェック（既知連絡先の場合）
5. 署名検証
6. リプレイ検出（`msgId + senderFp` ベース）
7. エフェメラル鍵で共有秘密を計算 -> 復号

**トランスポート層:**
- `BaseTransport` 抽象クラスを基底に、`QRTransport`、`ClipboardTransport`、`FileTransport` を実装
- `TransportManager` で統一的なインターフェースを提供
- BLEは別モジュール (`bluetooth/ble-manager.js`) で Web Bluetooth API を利用

---

## 2. 進捗：完成モジュール vs 未実装モジュール

### 完成済み (Production-ready)

| モジュール | ファイル | 状態 | テスト |
|-----------|---------|------|--------|
| 暗号コア | `crypto/core.js` (614行) | **完成** | 20/20テスト合格 |
| テストベクトル | `tools/test-vectors.json` + `validate-test-vectors.js` | **完成** | 23/23テスト合格 |
| プロトコル仕様 | `spec/PROTOCOL.md` (586行) | **完成** | v1.0 + v1.1仕様化済み |
| 脅威モデル | `spec/THREAT_MODEL.md` | **完成** | - |
| エラーハンドリング | `crypto/errors.js` (225行) | **完成** | 日英バイリンガル |
| CI/CD | `.github/workflows/{ci,pages,security}.yml` | **完成** | Node 18/20/22マトリクス |
| ドキュメント | `docs/`, `README.md` 等 | **完成** | 日英バイリンガル |

### 実装済みだが統合/接続が不完全

| モジュール | ファイル | 状態 | 問題 |
|-----------|---------|------|------|
| メッセージストア (v2) | `crypto/store.js` (636行) | **実装済み・未使用** | UIはv1 DB (`lifelineMesh`)を直接操作。v2ストア (`lifelineMeshV2`) は接続されていない |
| トランスポート層 | `crypto/transport.js` (660行) | **実装済み・未使用** | UIは直接クリップボード操作。Transport抽象層は接続されていない |
| 鍵バックアップ (v2) | `crypto/key-backup.js` (328行) | **実装済み・未使用** | UIはXOR暗号化(v1)を使用。Argon2id/PBKDF2対応の新モジュールは接続されていない |
| BLE管理 | `bluetooth/ble-manager.js` (374行) | **PoC段階** | UIに基本接続済みだがGATTサーバー側未実装（クライアントのみ） |

### 未実装 (設計書のみ)

| 機能 | 設計書 | 状態 |
|------|--------|------|
| グループメッセージング | `TECHNICAL_ROADMAP.md` S3 | **設計のみ** (Sender Keys プロトコル) |
| メッシュルーティング | `TECHNICAL_ROADMAP.md` S2.4 | **設計のみ** (MeshRouter クラス) |
| Web Worker暗号化 | `TECHNICAL_ROADMAP.md` S6.1 | **未着手** |
| IndexedDB最適化 | `TECHNICAL_ROADMAP.md` S6.2 | **未着手** |
| ローカルメトリクス | `TECHNICAL_ROADMAP.md` S8 | **未着手** |
| TypeScript移行 | `TECHNICAL_ROADMAP.md` S4 | tsconfig.jsonのみ。型定義1ファイル |
| E2E/統合テスト | `TECHNICAL_ROADMAP.md` S5 | **未着手** |
| Post-quantum暗号 | `spec/PROTOCOL.md` 将来の検討 | **未着手** |
| LoRa統合 | 定数のみ定義 (`LORA_MAX_CHUNK_SIZE`) | **未着手** |

---

## 3. 不足点：改善すべき点と技術的課題

### 致命的な問題

**A. UIの鍵エクスポートがXOR暗号化 (`app/index.html:466-477`)**

`crypto/key-backup.js` にArgon2id/PBKDF2 + NaCl secretboxの安全な実装が存在するが、UIに統合されていない。ユーザーの秘密鍵がブルートフォースで容易に解読される。

**B. UIとモジュール間のデータベース不整合**
- UI: `lifelineMesh` v1（3ストア: keys, contacts, replay）
- `crypto/store.js`: `lifelineMeshV2` v2（6ストア: keys, contacts, outbox, inbox, seen, chunks）
- 2つのDB定義が並存し、UIは新しいストアを一切使っていない

### CIの品質ゲート

**C. ESLint: 113エラー（全て修正可能）**
- `bluetooth/` と `crypto/key-backup.js` がlint未通過
- 主な問題: シングルクォート -> ダブルクォート、trailing comma、未定義グローバル (`TextEncoder`, `crypto`, `setTimeout`)
- `eslint --fix` で101件は自動修正可能

**D. TypeScript: 8型エラー**
- `window.argon2` の型定義欠如
- `FileTransport.receive()` のシグネチャがBaseTransportと不一致
- `EventTarget` から `.result` / `.files` へのアクセスに型アサーション不足

### アーキテクチャ上の課題

**E. UIがモノリシック単一HTMLファイル（913行）**
- すべてのロジック（IndexedDB操作、暗号化、BLE、QR、PWA）がインラインスクリプトに集中
- `crypto/store.js`、`crypto/transport.js`、`crypto/key-backup.js` といった分離済みモジュールを使わず、UI内に同等のコードが重複
- Viteビルドシステムは存在するが、モジュール分割のメリットを活用できていない

**F. BLEはクライアント側のみ（GATTサーバー未実装）**
- `ble-manager.js` は他デバイスへの接続のみ可能
- 自デバイスがGATTサーバーとして動作する機能がないため、双方向通信不可
- Web Bluetooth API の制約上、ブラウザからGATTサーバー公開は非常に困難

**G. テストの範囲が限定的**
- ユニットテストは `crypto/core.js` のみ（20テスト）
- `crypto/store.js`、`crypto/transport.js`、`crypto/key-backup.js`、`crypto/errors.js` はテスト無し
- `bluetooth/ble-manager.js` もテスト無し
- 統合テスト・E2Eテストは未着手
- テストフレームワーク不使用（独自 `test()` ヘルパー）

**H. errors.js が core.js から利用されていない**
- `crypto/errors.js` に `LifelineMeshError`、`ErrorCode`、`wrapError` 等が定義済み
- `crypto/core.js` は全て `throw new Error("...")` で素のエラーを投げている
- 構造化エラーハンドリングの恩恵を受けていない

---

## 4. 方向性：アーキテクチャ・目的・思想

### 設計思想

1. **オフラインファースト・サーバーレス**: 災害時にインフラが壊滅しても、ブラウザ同士で直接通信可能な暗号メッセージング
2. **暗号的正確性**: NaCl (TweetNaCl) を基盤に、Ed25519署名 + X25519+XSalsa20-Poly1305暗号化、エフェメラル鍵、受信者バインディング、リプレイ防止を正しく実装
3. **Delay-Tolerant Networking (DTN)**: v1.1でTTL/有効期限ベースに移行し、Store-and-Forwardに対応。メッセージIDで重複排除
4. **トランスポート非依存**: QR、クリップボード、ファイル、BLE、（将来的に）LoRa/SMS/音声など、複数経路でメッセージ配送
5. **TOFU (Trust On First Use)**: PKI不要。初回メッセージで自動的に信頼し、以降は鍵の一貫性を検証

### アーキテクチャの方向性

プロジェクトは以下の3層アーキテクチャに向かっている:

```
[ユーザー層]     UI (PWA) -> 将来的にReact Native / Flutter
                     |
[プロトコル層]   crypto/core + crypto/store + crypto/transport + crypto/errors
                     |
[通信層]         QR | Clipboard | File | BLE | LoRa | SMS
```

現状、プロトコル層のモジュールは実装済みだが、ユーザー層（UI）と接続されていないのが最大のギャップ。

| 想定された接続 | 現状 |
|--------------|------|
| UI -> `crypto/store.js` (v2 DB) | UI -> 直接IndexedDB v1操作 |
| UI -> `crypto/transport.js` (抽象層) | UI -> 直接 `navigator.clipboard` 操作 |
| UI -> `crypto/key-backup.js` (安全なバックアップ) | UI -> XOR暗号化をインライン実装 |
| UI -> `crypto/errors.js` (構造化エラー) | UI -> 素の `Error` をキャッチ |

### ロードマップから見る優先順位

1. **即時**: 鍵バックアップのセキュリティ修正（XOR -> Argon2id）
2. **短期**: BLE PoC の完成、UIとモジュールの統合
3. **中期**: グループメッセージング（Sender Keys）、TypeScript移行
4. **長期**: メッシュルーティング、Post-quantum暗号、モバイルアプリ

### 総合評価

**強み:**
- 暗号プロトコルの設計と実装は堅実（TweetNaCl、ドメイン分離、受信者バインディング、エフェメラル鍵）
- テストベクトルによる相互運用性検証が充実（43テスト全通過）
- ドキュメント・仕様書が非常に充実（脅威モデル、プロトコル仕様、ロードマップ）
- CI/CDパイプラインが整備済み

**課題:**
- モジュール統合の断絶: 設計上分離されたモジュール群がUIに接続されていない
- セキュリティ上の既知問題: 鍵エクスポートのXOR暗号化が本番に残存
- コード品質ゲートの不通過: ESLint 113エラー、TypeScript 8エラー
- テスト範囲: 暗号コア以外のモジュールにテストがない
- UIのモノリシック化: 913行のインラインスクリプトが保守性を低下

---

## CI検証結果 (2026-02-07)

| チェック | 結果 | 詳細 |
|---------|------|------|
| `npm run test:crypto` | **PASS** (20/20) | 暗号コアのユニットテスト全通過 |
| `npm run test:vectors` | **PASS** (23/23) | テストベクトル検証全通過 |
| `npm run lint` | **FAIL** (113 errors) | bluetooth/, crypto/key-backup.js が主因 |
| `npm run typecheck` | **FAIL** (8 errors) | 型定義不足・シグネチャ不一致 |
