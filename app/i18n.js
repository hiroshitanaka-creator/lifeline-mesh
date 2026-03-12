/**
 * Lifeline Mesh - Internationalization (i18n)
 *
 * Zero-dependency bilingual support: Japanese (ja) and English (en).
 * Language is auto-detected from navigator.language and can be toggled
 * by the user. The preference is persisted in localStorage.
 *
 * Usage:
 *   import { t, applyTranslations, toggleLang } from './i18n.js';
 *
 *   // Get translated string
 *   alert(t('alert_generate_keys_first'));
 *
 *   // With %s substitution
 *   setStatus(true, t('status_contact_saved', contact.name));
 *
 *   // Apply all data-i18n attributes in the DOM
 *   applyTranslations();
 *
 *   // Toggle between ja / en
 *   window.toggleLang = toggleLang;
 */

// ============================================================================
// Translation Dictionary
// ============================================================================

const TRANSLATIONS = {
  en: {
    // Page metadata
    app_title: "Lifeline Mesh - Emergency Messaging",
    app_description: "End-to-end encrypted emergency messaging. Offline-first. No server required.",

    // Header
    app_heading: "🌐 Lifeline Mesh",
    app_subtitle: "End-to-end encrypted emergency messaging • Offline-first • No server required",
    app_features: "✅ Ed25519 signatures • ✅ X25519 encryption • ✅ Ephemeral keys • ✅ Replay protection • ✅ TOFU",
    app_bundled_note: "🔒 Bundled build - zero external dependencies",

    // PWA install prompt
    pwa_install_prompt: "📱 Install Lifeline Mesh as an app for offline access",
    pwa_install_btn: "Install",
    pwa_later_btn: "Later",

    // Section headings
    section_keys: "1) Your Keys",
    section_contacts: "2) Contacts",
    section_encrypt: "3) Encrypt Message",
    section_decrypt: "4) Decrypt Message",
    section_ble: "5) Bluetooth Relay",
    docs_heading: "📚 Documentation",

    // Buttons — Keys
    btn_generate_keys: "🔑 Generate / Load Keys",
    btn_reset_all: "🗑️ RESET ALL",
    btn_copy_id: "📋 Copy My Public ID",
    btn_show_qr: "📱 Show QR Code",
    btn_export_keys: "💾 Export Keys",
    btn_import_keys: "📥 Import Keys",

    // Key management details
    keymgmt_heading: "Key Management",
    keymgmt_qr_desc: "QR Code: Display your public ID as QR code for easy scanning",
    keymgmt_export_desc: "Export: Download your secret keys as encrypted JSON (password-protected)",
    keymgmt_import_desc: "Import: Restore keys from backup file",
    keymgmt_warning: "⚠️ Warning: Keep exported keys secure. Anyone with your secret keys can impersonate you.",

    // Buttons — Contacts
    btn_add_contact: "➕ Add Contact",
    btn_scan_qr: "📷 Scan QR Code",
    btn_refresh: "🔄 Refresh",
    btn_delete_selected: "❌ Delete Selected",

    // Buttons — Encrypt / Decrypt
    btn_encrypt: "🔒 Encrypt",
    btn_copy_encrypted: "📋 Copy Encrypted Message",
    btn_decrypt: "🔓 Decrypt",

    // Buttons — Bluetooth
    btn_ble_scan: "📡 Scan for Devices",
    btn_ble_disconnect: "❌ Disconnect",
    btn_ble_send: "📤 Send Last Encrypted via Bluetooth",

    // Documentation links
    doc_usage: "Usage Guide",
    doc_faq: "FAQ",
    doc_threat: "Threat Model",
    doc_protocol: "Protocol Specification",

    // Labels / placeholders / static text
    label_not_loaded: "(not loaded)",
    label_none: "(none)",
    label_select_recipient: "Select Recipient",
    label_select_above: "(select above)",
    label_recipient: "Recipient:",
    label_tofu: "TOFU (Trust On First Use - auto-accept unknown senders)",
    label_ble_status: "Status:",
    label_ble_connected_to: "Connected to:",
    contact_placeholder: "{\"name\":\"Bob\",\"signPK\":\"base64\",\"boxPK\":\"base64\"}",
    msg_placeholder: "Type your message here (max 150KB)",
    decrypt_placeholder: "Paste encrypted JSON message here",

    // BLE status / dynamic
    ble_unsupported: "⚠️ Web Bluetooth not supported in this browser. Use Chrome or Edge.",
    ble_not_connected: "🔴 Not connected",
    ble_connected: "🟢 Connected",
    ble_received_heading: "Received Messages via Bluetooth",
    ble_msg_received: "Received:",

    // QR modals
    modal_qr_heading: "Your Public ID QR Code",
    modal_qr_instruction: "Scan this with another device to add you as a contact",
    modal_scanner_heading: "Scan Contact QR Code",
    modal_scanner_instruction: "Point camera at QR code to add contact",

    // Status messages (shown in the status bar)
    status_ok: "✓ OK",
    status_error: "✗ ERROR",
    status_keys_ready: "Keys ready. Fingerprint: %s",
    status_copied_id: "Public ID copied to clipboard",
    status_exported: "Keys exported (weak encryption - store backup securely!)",
    status_imported: "Keys imported successfully",
    status_reset_done: "All data deleted",
    status_contact_saved: "Contact saved: %s (fp: %s...)",
    status_contact_deleted: "Contact deleted (fp: %s...)",
    status_encrypted: "Encrypted for %s",
    status_copied_encrypted: "Encrypted message copied to clipboard",
    status_decrypted: "✓ Decrypted from %s (fp: %s...)",
    status_unknown_sender: "Unknown sender (fp: %s...). Enable TOFU or add contact first.",
    status_ble_scanning: "Scanning for devices...",
    status_ble_connecting: "Connecting...",
    status_ble_connected: "Connected via Bluetooth!",
    status_ble_disconnected: "Disconnected",
    status_ble_not_supported: "Bluetooth not supported",
    status_ble_received: "Received message via Bluetooth - ready to decrypt",
    status_ble_sent: "Message sent via Bluetooth!",
    status_pwa_installed: "PWA installed successfully",

    // Alert / confirm dialogs
    alert_generate_keys_first: "Generate keys first",
    alert_export_warning:
      "WARNING: Key backup encryption is currently WEAK (demo-grade).\n\n" +
      "For critical use, manually store your keys securely.\n" +
      "Upgrade to Argon2id encryption is planned.\n\n" +
      "Continue with export?",
    alert_export_password:
      "Enter password to encrypt your keys:\n(Use a STRONG password - encryption is weak)",
    alert_no_keys: "No keys to export. Generate keys first.",
    alert_import_password: "Enter password to decrypt your keys:",
    alert_invalid_backup: "Invalid backup file format",
    alert_import_failed: "Decryption failed - wrong password or corrupted file",
    confirm_reset: "⚠️ Delete ALL data (keys, contacts, replay DB)?\nThis cannot be undone!",
    alert_invalid_contact: "Invalid format. Need: signPK and boxPK",
    alert_invalid_signpk: "Invalid signPK length",
    alert_invalid_boxpk: "Invalid boxPK length",
    alert_select_contact: "Select a contact first",
    alert_select_recipient: "Select a recipient",
    alert_recipient_not_found: "Recipient not found",
    alert_no_msg_to_send: "No encrypted message to send. Encrypt a message first.",
    alert_camera_error: "Camera access error: %s",

    // Language toggle label
    lang_toggle_label: "日本語"
  },

  ja: {
    // ページメタデータ
    app_title: "Lifeline Mesh - 緊急メッセージング",
    app_description: "エンドツーエンド暗号化緊急メッセージ。オフライン対応。サーバー不要。",

    // ヘッダー
    app_heading: "🌐 Lifeline Mesh",
    app_subtitle: "エンドツーエンド暗号化緊急メッセージ • オフライン対応 • サーバー不要",
    app_features: "✅ Ed25519署名 • ✅ X25519暗号化 • ✅ 使い捨て鍵 • ✅ リプレイ攻撃防御 • ✅ TOFU",
    app_bundled_note: "🔒 バンドルビルド - 外部依存なし",

    // PWAインストールプロンプト
    pwa_install_prompt: "📱 Lifeline Meshをアプリとしてインストールしてオフラインで使用",
    pwa_install_btn: "インストール",
    pwa_later_btn: "後で",

    // セクション見出し
    section_keys: "1) 自分の鍵",
    section_contacts: "2) 連絡先",
    section_encrypt: "3) メッセージを暗号化",
    section_decrypt: "4) メッセージを復号",
    section_ble: "5) Bluetooth中継",
    docs_heading: "📚 ドキュメント",

    // ボタン — 鍵
    btn_generate_keys: "🔑 鍵を生成 / 読み込む",
    btn_reset_all: "🗑️ 全データ削除",
    btn_copy_id: "📋 公開IDをコピー",
    btn_show_qr: "📱 QRコードを表示",
    btn_export_keys: "💾 鍵をエクスポート",
    btn_import_keys: "📥 鍵をインポート",

    // 鍵管理 details
    keymgmt_heading: "鍵の管理",
    keymgmt_qr_desc: "QRコード：公開IDをQRコードとして表示して簡単にスキャン",
    keymgmt_export_desc: "エクスポート：秘密鍵を暗号化JSONとしてダウンロード（パスワード保護）",
    keymgmt_import_desc: "インポート：バックアップファイルから鍵を復元",
    keymgmt_warning: "⚠️ 警告：エクスポートした鍵は安全に保管してください。秘密鍵を持つ人はあなたになりすますことができます。",

    // ボタン — 連絡先
    btn_add_contact: "➕ 連絡先を追加",
    btn_scan_qr: "📷 QRコードをスキャン",
    btn_refresh: "🔄 更新",
    btn_delete_selected: "❌ 選択した連絡先を削除",

    // ボタン — 暗号化 / 復号
    btn_encrypt: "🔒 暗号化",
    btn_copy_encrypted: "📋 暗号化メッセージをコピー",
    btn_decrypt: "🔓 復号",

    // ボタン — Bluetooth
    btn_ble_scan: "📡 デバイスをスキャン",
    btn_ble_disconnect: "❌ 切断",
    btn_ble_send: "📤 最後に暗号化したメッセージをBluetoothで送信",

    // ドキュメントリンク
    doc_usage: "使い方ガイド",
    doc_faq: "よくある質問",
    doc_threat: "脅威モデル",
    doc_protocol: "プロトコル仕様",

    // ラベル / プレースホルダー
    label_not_loaded: "（未読み込み）",
    label_none: "（なし）",
    label_select_recipient: "宛先を選択",
    label_select_above: "（上で選択）",
    label_recipient: "宛先：",
    label_tofu: "TOFU（初回接続時信頼 - 未知の送信者を自動受理）",
    label_ble_status: "状態：",
    label_ble_connected_to: "接続先：",
    contact_placeholder: "{\"name\":\"Bob\",\"signPK\":\"base64\",\"boxPK\":\"base64\"}",
    msg_placeholder: "メッセージを入力（最大150KB）",
    decrypt_placeholder: "暗号化されたJSONメッセージを貼り付け",

    // BLE 状態 / 動的テキスト
    ble_unsupported: "⚠️ このブラウザはWeb Bluetoothに対応していません。ChromeまたはEdgeをご利用ください。",
    ble_not_connected: "🔴 未接続",
    ble_connected: "🟢 接続済み",
    ble_received_heading: "Bluetooth経由で受信したメッセージ",
    ble_msg_received: "受信：",

    // QR モーダル
    modal_qr_heading: "自分の公開ID QRコード",
    modal_qr_instruction: "別のデバイスでスキャンして連絡先として追加",
    modal_scanner_heading: "連絡先QRコードをスキャン",
    modal_scanner_instruction: "QRコードにカメラを向けて連絡先を追加",

    // ステータスメッセージ
    status_ok: "✓ OK",
    status_error: "✗ エラー",
    status_keys_ready: "鍵の準備ができました。フィンガープリント：%s",
    status_copied_id: "公開IDをクリップボードにコピーしました",
    status_exported: "鍵をエクスポートしました（弱い暗号化 - バックアップを安全に保管してください！）",
    status_imported: "鍵を正常にインポートしました",
    status_reset_done: "全データを削除しました",
    status_contact_saved: "連絡先を保存しました：%s (fp: %s...)",
    status_contact_deleted: "連絡先を削除しました (fp: %s...)",
    status_encrypted: "%s に暗号化しました",
    status_copied_encrypted: "暗号化メッセージをクリップボードにコピーしました",
    status_decrypted: "✓ %s から復号しました (fp: %s...)",
    status_unknown_sender: "不明な送信者 (fp: %s...). TOFUを有効にするか連絡先を先に追加してください。",
    status_ble_scanning: "デバイスをスキャン中...",
    status_ble_connecting: "接続中...",
    status_ble_connected: "Bluetooth経由で接続しました！",
    status_ble_disconnected: "切断しました",
    status_ble_not_supported: "Bluetoothはサポートされていません",
    status_ble_received: "Bluetooth経由でメッセージを受信 - 復号する準備ができました",
    status_ble_sent: "Bluetooth経由でメッセージを送信しました！",
    status_pwa_installed: "PWAを正常にインストールしました",

    // アラート / 確認ダイアログ
    alert_generate_keys_first: "まず鍵を生成してください",
    alert_export_warning:
      "警告：鍵バックアップの暗号化は現在弱い（デモ品質）です。\n\n" +
      "重要な用途には、鍵を手動で安全に保管してください。\n" +
      "Argon2id暗号化へのアップグレードを計画中です。\n\n" +
      "エクスポートを続けますか？",
    alert_export_password:
      "鍵を暗号化するためのパスワードを入力してください：\n（強力なパスワードを使用してください - 暗号化は弱い）",
    alert_no_keys: "エクスポートする鍵がありません。まず鍵を生成してください。",
    alert_import_password: "鍵を復号するためのパスワードを入力してください：",
    alert_invalid_backup: "無効なバックアップファイル形式",
    alert_import_failed: "復号に失敗しました - パスワードが間違っているかファイルが壊れています",
    confirm_reset: "⚠️ 全データ（鍵・連絡先・リプレイDB）を削除しますか？\nこの操作は元に戻せません！",
    alert_invalid_contact: "無効な形式です。signPKとboxPKが必要です",
    alert_invalid_signpk: "signPKの長さが無効です",
    alert_invalid_boxpk: "boxPKの長さが無効です",
    alert_select_contact: "まず連絡先を選択してください",
    alert_select_recipient: "宛先を選択してください",
    alert_recipient_not_found: "宛先が見つかりません",
    alert_no_msg_to_send: "送信する暗号化メッセージがありません。先にメッセージを暗号化してください。",
    alert_camera_error: "カメラアクセスエラー：%s",

    // 言語切替ラベル
    lang_toggle_label: "EN"
  }
};

// ============================================================================
// Language Detection & Persistence
// ============================================================================

const STORAGE_KEY = "lifeline-lang";
const SUPPORTED = ["en", "ja"];

/**
 * Get the currently active language.
 * Priority: localStorage → navigator.language → "en"
 * @returns {"en"|"ja"}
 */
export function getCurrentLang() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;

  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ja") ? "ja" : "en";
}

/**
 * Set and persist the active language, then re-apply all translations.
 * @param {"en"|"ja"} lang
 */
export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
  applyTranslations();
  _updateToggleButton(lang);
}

/**
 * Toggle between "en" and "ja".
 */
export function toggleLang() {
  setLang(getCurrentLang() === "ja" ? "en" : "ja");
}

// ============================================================================
// Translation
// ============================================================================

/**
 * Get a translated string for the current language.
 * Supports %s substitution for dynamic values.
 *
 * @param {string} key - Translation key
 * @param {...string} args - Values to substitute for each %s placeholder
 * @returns {string}
 */
export function t(key, ...args) {
  const lang = getCurrentLang();
  let str = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"]?.[key] ?? key;
  for (const arg of args) {
    str = str.replace("%s", String(arg));
  }
  return str;
}

// ============================================================================
// DOM Application
// ============================================================================

/**
 * Walk all elements with data-i18n / data-i18n-placeholder / data-i18n-title
 * attributes and update their text/attribute with the current language.
 *
 * Call this once on page load and again whenever the language changes.
 */
export function applyTranslations() {
  const lang = getCurrentLang();
  document.documentElement.lang = lang;

  // textContent
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const translated = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"]?.[key];
    if (translated !== undefined) el.textContent = translated;
  });

  // placeholder attribute
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    const translated = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"]?.[key];
    if (translated !== undefined) el.placeholder = translated;
  });

  // title attribute
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    const translated = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"]?.[key];
    if (translated !== undefined) el.title = translated;
  });

  // <title> tag
  const titleKey = document.documentElement.getAttribute("data-i18n-title");
  if (titleKey) {
    const translated = TRANSLATIONS[lang]?.[titleKey] ?? TRANSLATIONS["en"]?.[titleKey];
    if (translated) document.title = translated;
  }

  _updateToggleButton(lang);
}

/**
 * Update the language toggle button label.
 * @private
 */
function _updateToggleButton(lang) {
  const btn = document.getElementById("lang-toggle");
  if (btn) {
    btn.textContent = TRANSLATIONS[lang]?.lang_toggle_label
      ?? (lang === "ja" ? "EN" : "日本語");
  }
}
