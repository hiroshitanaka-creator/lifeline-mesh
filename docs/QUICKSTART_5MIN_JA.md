# 5分導入ガイド（運用者/利用者）

## 0. 前提
- ブラウザ: Chrome/Edge 推奨
- ファイル: `app/index.html`

## 1. 利用者向け（約5分）

1. `app/index.html` を開く。
2. **Generate / Load Keys** を押す。
3. **Copy My Public ID** を共有する（またはQR表示）。
4. 相手の公開IDを貼り付けて **Add Contact**。
5. メッセージを入力し **Encrypt**、相手側で **Decrypt**。

## 2. 運用者向け（約5分）

1. `docs/OFFLINE_DISTRIBUTION_KIT_JA.md` に従って配布物整合性を確認。
2. 初回導入時に「鍵バックアップ（Export Keys）」を必ず案内。
3. 失敗時は UI の `Delivery Operations` に従い、再送→代替経路へ切り替える。
4. 互換問題は `docs/COMPATIBILITY_POLICY.md` の条件を参照して判断する。

## 3. トラブル時の最短手順

- 送信失敗: 再送後、Clipboard / File / QR へ切替。
- 復号失敗: 連絡先鍵の不一致・グループ鍵バージョンを確認。
- BLE不可: 仕様上想定内。代替経路運用で継続する。
