# オフライン配布キット手順（Phase B）

## 目的
災害時や閉域環境でも、ネット接続なしで Lifeline Mesh を配布・検証・起動できるようにする。

## 配布キット構成

- `app/`（静的フロントエンド本体）
- `docs/QUICKSTART_5MIN_JA.md`（初回導入手順）
- `docs/COMPATIBILITY_POLICY.md`（互換方針）
- `SHA256SUMS`（配布物チェックサム）
- `RELEASE_NOTES.md`（変更点）

## 作成手順

1. リポジトリをクリーンな状態にする。
2. `npm ci && npm ci --prefix app` を実行する。
3. `app/` とドキュメントを zip 化し、`SHA256SUMS` を生成する。
4. 配布責任者がチェックサム検証を実施し、配布開始する。

## 検証手順（受領側）

1. `SHA256SUMS` と配布物のハッシュ一致を確認。
2. `app/index.html` をローカルブラウザで開く。
3. 鍵生成 → 連絡先追加 → 暗号化 → 復号の最小フローを実施。

## 運用メモ

- BLE未対応環境では Clipboard / File / QR を代替経路とする。
- 配布時点のプロトコル版は `docs/COMPATIBILITY_POLICY.md` で確認する。
