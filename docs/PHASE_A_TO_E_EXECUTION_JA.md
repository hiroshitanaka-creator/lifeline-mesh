# Phase A〜E 実行チェックシート（運用版）

このドキュメントは、`docs/NEXT_PHASE_EXECUTION_JA.md` の Phase 6〜10（本計画での Phase A〜E）を、
日次運用で実行できる形に落とし込んだチェックシートです。

- **Phase A**: 現場UX/信頼性の仕上げ（旧 Phase 6）
- **Phase B**: 導入・配布可能性の実装（旧 Phase 7）
- **Phase C**: 相互運用の固定化（旧 Phase 8）
- **Phase D**: 継続セキュリティ運用（旧 Phase 9）
- **Phase E**: 1.0 Go/No-Go（旧 Phase 10）

---

## 運用ルール（全Phase共通）

1. 実装前に「目的」「完了条件」「検証コマンド」を PR 説明に明記する。  
2. 各タスクは **Definition of Done (DoD)** を満たしたらチェックする。  
3. フェーズ完了時に `npm run check:phase -- --phase=<A|B|C|D|E>` を実行して記録する。  
4. 失敗項目がある場合は次Phaseへ進まない（例外はGo/No-Go議事録で承認）。

---

## Phase A（現場UX/信頼性の仕上げ）

### 目的
- 非技術ユーザーが迷わず操作できる。
- 失敗時も代替ルートで送信完遂できる。

### DoD
- [ ] キュー状態表示が「未送信/再送中/配信済み/失敗」に統一。
- [ ] 失敗時ガイド（再試行・代替経路）が UI で確認可能。
- [ ] 長文送信時の分割進捗が UI で追える。
- [ ] 災害テンプレート（安否/物資/避難/医療）が入力補助として使える。

### 検証コマンド
- `npm run test:integration`
- `npm run test:e2e`

---

## Phase B（導入・配布可能性の実装）

### 目的
- 第三者が手順のみで導入できる。

### DoD
- [ ] オフライン配布キットの構成が文書化。
- [ ] 署名・チェックサム検証手順が文書化。
- [ ] 5分導入ガイド（運用者/利用者）が整備。
- [ ] 多言語更新フローが定義済み。

### 検証コマンド
- `npm run test:unit`
- `npm run lint`

---

## Phase C（相互運用の固定化）

### 目的
- 複数経路で同一メッセージ互換を維持できる。

### DoD
- [ ] transport 抽象に沿う外部連携アダプタ仕様が定義済み。
- [ ] export/import 仕様が固定されている。
- [ ] 互換方針（旧版互換/破壊的変更条件）が明文化。
- [ ] 互換性テストが CI で常時実行される。

### 検証コマンド
- `npm run test:vectors`
- `npm run test:integration`

---

## Phase D（継続セキュリティ運用）

### 目的
- セキュリティ運用を属人化させない。

### DoD
- [ ] 依存更新サイクル・SLA が定義されている。
- [ ] 鍵管理/復号/移行に対する再監査項目が定義済み。
- [ ] セキュリティ回帰テストの追加方針がある。
- [ ] 事故対応 Runbook が演習ベースで更新される運用になっている。

### 検証コマンド
- `npm run lint`
- `npm run typecheck`

---

## Phase E（1.0 Go/No-Go）

### 目的
- リリース判断を感覚でなく基準で実施する。

### DoD
- [ ] P0/P1 未解決が 0 件。
- [ ] `docs/RELEASE_CHECKLIST.md` の必須項目を満たす。
- [ ] 手動運用訓練シナリオが規定回数パス。
- [ ] 承認者サインオフが記録済み。

### 検証コマンド
- `npm run validate`

---

## フェーズ完了ログ（記入用）

| Date | Phase | Result | Evidence |
|------|-------|--------|----------|
| YYYY-MM-DD | A | PASS/FAIL | PR #xxx / CI URL |
| YYYY-MM-DD | B | PASS/FAIL | PR #xxx / CI URL |
| YYYY-MM-DD | C | PASS/FAIL | PR #xxx / CI URL |
| YYYY-MM-DD | D | PASS/FAIL | PR #xxx / CI URL |
| YYYY-MM-DD | E | PASS/FAIL | PR #xxx / CI URL |
