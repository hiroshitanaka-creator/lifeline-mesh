# Lifeline Mesh Compatibility Policy

Protocol Version: **1.1**

## Export/Import互換ルール

- 鍵バックアップは `version` フィールドを必須とする。
- `version: 2`（PBKDF2/Argon2id + secretbox）を標準とし、`version: 1` は読み取りのみ許可。
- 将来版で `version` を増やす場合、少なくとも1リリース期間は後方互換を維持する。

## 破壊的変更（Breaking Change）の条件

以下のいずれかに該当する場合は breaking change 扱い:

1. 既存クライアントが既存バックアップを復元できなくなる。
2. 既存クライアントが新規メッセージ構造を解釈できない。
3. メッセージ署名/暗号検証の前提が互換なしに変わる。

## CI互換ゲート

- `npm run test:vectors`（暗号・構造互換）
- `npm run test:integration`（BLE/Transport主経路）
- `npm run check:compat`（本ポリシーの存在・必須節）

## 運用ルール

- 破壊的変更を含むPRは、移行手順とロールバック手順を同時に提出する。
- Go/No-Go判定時に互換ゲート結果を必須確認とする。
