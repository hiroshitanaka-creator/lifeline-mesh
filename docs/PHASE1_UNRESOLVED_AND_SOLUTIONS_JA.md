# Phase 1 未対応事項と解決策

このドキュメントは、Phase 1 実装時に環境起因で完了できなかった確認項目と、その解消手順をまとめたものです。

## 1. Playwright E2E が環境で実行できない

### 状況
- `npm run test:e2e:playwright` 実行時に `playwright: not found` となり、ブラウザE2Eをこの環境では実行できない。

### 解決策
1. 依存インストール
   - `npm install`
2. Playwright 本体 + ブラウザセットアップ
   - `npx playwright install --with-deps`
3. E2E実行
   - `npm run test:e2e:playwright`
4. CI へ反映
   - 上記コマンドを GitHub Actions のジョブに追加し、失敗時に `trace.zip`/screenshot を保存する。

## 2. ルート lint が既存ファイル起因で失敗

### 状況
- `npm run lint` は `crypto/group.js` の既存 quotes ルール違反で失敗する（今回変更箇所外）。

### 解決策
1. 自動修正
   - `npx eslint crypto/group.js --fix`
2. 回帰確認
   - `npm run lint`
3. 再発防止
   - `lint-staged` の対象に `crypto/**/*.js` が既に入っているため、今後は同種違反がコミット時に自動修正される。

## 3. Exit Criteria の厳密確認

### 状況
- Phase 1 の Exit Criteria は「主要フローで旧コード参照が残っていないこと」。
- 今回の対応でインライン業務ロジックは排除済みだが、将来的な再混入防止は追加ガードが有効。

### 解決策
1. 静的検査ルール追加
   - `app/index.html` に `onclick=` / `onchange=` が残っていないことを CI で検査。
2. E2E回帰
   - 鍵生成 -> 暗号化 -> 復号 -> BLE境界 のシナリオを Playwright 本番ジョブで必須化。
3. レビュー観点固定
   - PRテンプレートに「UIハンドラの実装場所（main.js集約）」チェック項目を追加。
