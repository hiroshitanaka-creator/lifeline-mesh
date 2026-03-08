# Go/No-Go 判定会アジェンダ（Phase 5）

## 参加者（固定）
- Release Manager
- Security Owner
- QA Owner
- Ops Representative

## 判定項目
1. P0/P1 バグ件数
2. CIゲート（lint/typecheck/unit/integration/e2e）結果
3. 既知リスクと回避策
4. ロールバック手順の確認
5. 監視指標の初期値と監視担当

## 判定
- Go: 全項目許容範囲内
- No-Go: 重大リスク未解消、または必須ゲート未達
