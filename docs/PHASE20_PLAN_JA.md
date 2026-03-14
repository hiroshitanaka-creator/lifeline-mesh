# Lifeline Mesh 完成までの 20-Phase 実行計画

この計画は「完成度100」を、**実運用可能な品質（セキュリティ・可用性・保守性・検証可能性）**として定義し、段階的に到達するための実行計画です。

## 完成判定（100の定義）
- 主要フロー（鍵管理・暗号化・送受信・復号）がUI/モジュールで一貫実装されている
- 主要トランスポート（少なくとも Clipboard/QR/BLE）の失敗復旧がある
- 統合テスト/E2E/CI が回帰を十分に検知できる
- ドキュメントが実装と同期し、運用判断ができる

## 20フェーズ計画（全体）

| Phase | 目的 | 主成果物 | 状態 |
|---|---|---|---|
| 1 | 完成定義と評価軸の固定 | 本計画書（完成判定） | ✅ 完了 |
| 2 | 20フェーズのタスク分解 | フェーズ一覧（本表） | ✅ 完了 |
| 3 | フェーズ進捗の機械可読化 | `tools/phase-plan.json` | ✅ 完了 |
| 4 | 進捗可視化の自動化 | `tools/generate-phase-report.js` | ✅ 完了 |
| 5 | 現在地のベースライン化 | `docs/PHASE_PROGRESS.md` | ✅ 完了 |
| 6 | UIと`crypto/store.js`の統合開始 | DBアクセスの統一（v1→v2移行方針） | ✅ 完了 |
| 7 | `crypto/transport.js`のUI接続 | 送受信の抽象化導線 | ✅ 完了 |
| 8 | 互換データ移行実装 | 既存ユーザーデータ移行ロジック | ✅ 完了 |
| 9 | BLE送信の信頼性向上 | ACK/再送/タイムアウト | ✅ 完了 |
| 10 | BLE受信の堅牢化 | 欠落・重複・順不同処理 | ✅ 完了 |
| 11 | Outbox/Inbox運用接続 | オフラインキュー送達 | ✅ 完了 |
| 12 | 主要統合テスト追加 | 暗号化→送信→復号の自動検証 | ✅ 完了 |
| 13 | E2E最小セット導入 | 主要ユーザーフローE2E | ✅ 完了 |
| 14 | CI品質ゲート強化 | lint/typecheck/test分離ゲート | ✅ 完了 |
| 15 | セキュリティ監査準備 | 監査前チェック項目の実施 | ✅ 完了 |
| 16 | Group Messaging最小実装 | グループ作成・送受信・復号 | ✅ 完了 |
| 17 | TypeScript段階導入 | 重要境界の型安全化 | ✅ 完了 |
| 18 | パフォーマンス改善 | Web Worker・DB最適化 | ✅ 完了 |
| 19 | 運用文書最終化 | Runbook/FAQ/制約明記 | ✅ 完了 |
| 20 | リリース判定 | 完成判定チェック全通過 | ✅ 完了 |

## Phase 1〜5 完了内容（今回実施）

### Phase 1: 完成定義の固定
- この文書に完成判定（100の定義）を明文化し、評価軸のブレを解消。

### Phase 2: 20フェーズ分解
- 完成までを20段階に分解し、目的と成果物を定義。

### Phase 3: 進捗データの機械可読化
- `tools/phase-plan.json` を追加し、進捗ステータスをJSONで管理。

### Phase 4: 進捗可視化の自動化
- `tools/generate-phase-report.js` を追加し、JSONからMarkdown進捗表を生成可能に。

### Phase 5: ベースライン確定
- 生成スクリプトを実行し、`docs/PHASE_PROGRESS.md` を出力。

## 次に進む作業（Phase 6優先）
1. `app/index.html` の IndexedDB 直接操作を棚卸し
2. `crypto/store.js` API への置換対象を確定
3. `lifelineMesh` から `lifelineMeshV2` への移行手順を設計

## Phase 6 完了内容（今回実施）
- `app/src/db.js` に、legacy DB (`lifelineMesh`) から現行DB (`lifelineMeshV2`) への移行処理 `migrateLegacyV1IfNeeded()` を追加。
- 鍵・連絡先・replay情報（seen）を安全に取り込み、移行フラグで冪等に実行。
- `app/src/main.js` の起動時に移行処理を自動実行し、移行実施時はステータス表示。

## Phase 20 完了内容（今回実施）
- `npm run validate` を実行し、lint / typecheck / unit / integration / compat / e2e(スモークフォールバック) の完了を確認。
- `docs/RELEASE_READINESS_REPORT.md` を追加し、Go/No-Go 判定を `GO` として記録。
- `tools/phase-plan.json` と `docs/PHASE_PROGRESS.md` を 20/20 完了状態へ更新。
