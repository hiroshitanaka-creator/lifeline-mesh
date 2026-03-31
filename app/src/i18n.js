/* =========================
  i18n - Bilingual support (Japanese / English)
========================= */

const LANG_STORAGE_KEY = 'lifeline:lang';

const translations = {
  en: {
    /* --- Page meta --- */
    'page.subtitle': 'End-to-end encrypted emergency messaging • Offline-first • No server required',
    'mode.heading': 'Mode',
    'mode.description': 'Emergency Mode gives a fast, form-based path. Advanced Mode keeps full controls.',
    'mode.emergency': 'Emergency Mode (Simplified)',
    'mode.advanced': 'Advanced Mode',
    'emergency.heading': 'Emergency Quick Message',
    'emergency.help': 'Fill this form and send to your selected recipient. This writes the final text into Message content automatically.',
    'emergency.template.label': 'Message type',
    'emergency.field.name': 'Name / Team',
    'emergency.field.location': 'Location',
    'emergency.field.status': 'Status / Need',
    'emergency.field.people': 'People count',
    'emergency.field.details': 'Details',
    'emergency.field.details.placeholder': 'Short practical details',
    'emergency.apply': '🆘 Create Emergency Message',
    'common.overwrite': 'Overwrite',
    'common.cancel': 'Cancel',

    /* --- Install prompt --- */
    'install.prompt': '📱 Install Lifeline Mesh as an app for offline access',
    'install.btn': 'Install',
    'install.later': 'Later',

    /* --- Section 1: Keys --- */
    'keys.heading': '1) Your Keys',
    'keys.generateLoad': '🔑 Generate / Load Keys',
    'keys.resetAll': '🗑️ RESET ALL',
    'keys.notLoaded': '(not loaded)',
    'keys.copyId': '📋 Copy My Public ID',
    'keys.showQR': '📱 Show QR Code',
    'keys.export': '💾 Export Keys',
    'keys.import': '📥 Import Keys',
    'keys.mgmt.summary': 'Key Management',
    'keys.mgmt.qr': '<strong>QR Code:</strong> Display your public ID as QR code for easy scanning',
    'keys.mgmt.export': '<strong>Export:</strong> Download your secret keys as encrypted JSON (password-protected)',
    'keys.mgmt.import': '<strong>Import:</strong> Restore keys from backup file',
    'keys.mgmt.warning': '<strong>⚠️ Warning:</strong> Keep exported keys secure. Anyone with your secret keys can impersonate you.',
    'keys.kdf.argon2id': '🔐 Key export uses <strong>Argon2id</strong> (memory-hard, recommended)',
    'keys.kdf.pbkdf2': '⚠️ Key export uses <strong>PBKDF2</strong> fallback (Argon2id unavailable)',

    /* --- Section 2: Contacts --- */
    'contacts.heading': '2) Contacts',
    'contacts.label': 'Contact JSON',
    'contacts.add': '➕ Add Contact',
    'contacts.scanQR': '📷 Scan QR Code',
    'contacts.refresh': '🔄 Refresh',
    'contacts.delete': '❌ Delete Selected',
    'contacts.recipient.label': 'Recipient',
    'contacts.recipient.placeholder': 'Select Recipient',
    'contacts.none': '(none)',

    /* --- Section 3: Encrypt --- */
    'encrypt.heading': '3) Encrypt Message',
    'encrypt.mode.direct': 'Direct',
    'encrypt.mode.group': 'Group',
    'encrypt.recipient.prefix': 'Recipient:',
    'encrypt.recipient.none': '(select above)',
    'encrypt.group.namePlaceholder': 'New group name',
    'encrypt.group.create': '👥 Create Group',
    'encrypt.group.jsonPlaceholder': 'Paste group JSON to join (id/name/members/senderKey)',
    'encrypt.group.join': '📥 Join Group',
    'encrypt.group.select': 'Select Group',
    'encrypt.group.memberSelect': 'Select Contact',
    'encrypt.group.addMember': '➕ Add Member',
    'encrypt.group.removeMember': '➖ Remove Member',
    'encrypt.group.noGroup': '(no group selected)',
    'encrypt.content.label': 'Message content',
    'encrypt.template.placeholder': 'Select Disaster Template',
    'encrypt.template.safety': 'Safety Check',
    'encrypt.template.supplies': 'Supply Request',
    'encrypt.template.evacuation': 'Evacuation Notice',
    'encrypt.template.medical': 'Medical Assistance',
    'encrypt.template.shelter': 'Shelter Status',
    'encrypt.template.apply': '🧩 Apply Template',
    'encrypt.btn': '🔒 Encrypt',
    'encrypt.copy': '📋 Copy Encrypted Message',
    'encrypt.exportFile': '💾 Export Encrypted File',

    /* --- Section 4: Decrypt --- */
    'decrypt.heading': '4) Decrypt Message',
    'decrypt.label': 'Encrypted message JSON',
    'decrypt.tofu': 'TOFU (Trust On First Use - auto-accept unknown senders)',
    'decrypt.btn': '🔓 Decrypt',

    /* --- Section 5: Bluetooth --- */
    'ble.heading': '5) Bluetooth Relay',
    'ble.unsupported': '⚠️ Web Bluetooth not supported in this browser. Use Chrome or Edge.',
    'ble.status.prefix': 'Status:',
    'ble.scan': '📡 Scan for Devices',
    'ble.disconnect': '❌ Disconnect',
    'ble.connectedTo': 'Connected to:',
    'ble.connectedTo.none': '(none)',
    'ble.messages.summary': 'Received Messages via Bluetooth',
    'ble.messages.none': '(none)',
    'ble.send': '📤 Send Last Encrypted via Bluetooth',
    'ble.settings.summary': 'BLE Retry / ACK Settings',
    'ble.ackTimeout': 'ACK timeout (ms)',
    'ble.retryCount': 'Retry count',
    'ble.retryDelay': 'Retry delay (ms)',
    'ble.chunkDelay': 'Chunk delay (ms)',
    'ble.reassemblyTimeout': 'Reassembly timeout (ms)',
    'ble.applyConfig': '⚙️ Apply BLE Config',
    'ble.resetConfig': '↺ Reset Defaults',

    /* --- Section 6: Delivery --- */
    'delivery.heading': '6) Delivery Operations',
    'delivery.queueStatus': 'Queue Status:',
    'delivery.flush': '🔁 Flush queued messages now',
    'delivery.outbox.summary': 'Outbox Snapshot',
    'delivery.inbox.summary': 'Inbox Snapshot',
    'delivery.status.unsent': 'Unsent',
    'delivery.status.retrying': 'Retrying',
    'delivery.status.delivered': 'Delivered',
    'delivery.status.failed': 'Failed',
    'delivery.guide.default': 'If sending fails: retry first, then switch to Clipboard / File / QR.',
    'delivery.guide.failed': 'Send failed ({error}). Retry first, then try Clipboard / File / QR.',
    'delivery.guide.fallback': 'BLE retry limit reached. Switching to fallback transport.',
    'delivery.guide.retrying': 'Retrying (attempt {attempt}). Please wait and check again.',

    /* --- Section 7: Docs --- */
    'docs.summary': '📚 Documentation',
    'docs.usage': 'Usage Guide',
    'docs.faq': 'FAQ',
    'docs.threat': 'Threat Model',
    'docs.protocol': 'Protocol Specification',

    /* --- Modals --- */
    'modal.qr.title': 'Your Public ID QR Code',
    'modal.qr.hint': 'Scan this with another device to add you as a contact',
    'modal.scanner.title': 'Scan Contact QR Code',
    'modal.scanner.hint': 'Point camera at QR code to add contact',

    /* --- Status messages (JS) --- */
    'status.templateSelect': 'Please select a template',
    'status.templateLoadFail': 'Failed to load template',
    'status.templateOverwrite': 'Overwrite existing message?',
    'status.templateOverwriteInline': 'Overwrite existing message text with this emergency template?',
    'status.templateApplied': 'Template applied. Fill in the required fields.',
    'status.templateCancel': 'Template apply cancelled.',

    /* --- Disaster templates (message content) --- */
    'template.safety.content': '[Safety Check]\nName: \nLocation: \nCondition: Safe / Minor injury / Serious injury\nAssistance needed: \nCompanions: \nNext contact: ',
    'template.supplies.content': '[Supply Request]\nLocation: \nNeeded supplies: Water / Food / Blankets / Hygiene / Other\nNumber of people: \nUrgency: High / Medium / Low\nPickup time: \nContact info: ',
    'template.evacuation.content': '[Evacuation Notice]\nDeparture point: \nDestination: \nTransport: On foot / Car / Other\nNumber of companions: \nHazard info: \nEstimated arrival: ',
    'template.medical.content': '[Medical Assistance]\nLocation: \nPerson: \nSymptoms / Injury: \nConscious: Yes / No\nBreathing: Yes / No\nTreatment / Transport needed: ',
    'template.shelter.content': '[Shelter Status]\nShelter name: \nLocation: \nCapacity: \nCurrent occupancy: \nAvailable supplies: \nUrgent needs: \nNotes: ',
  },

  ja: {
    /* --- Page meta --- */
    'page.subtitle': 'エンドツーエンド暗号化緊急メッセージ • オフライン対応 • サーバー不要',
    'mode.heading': 'モード',
    'mode.description': '緊急モードはフォーム中心の簡易経路です。高度モードでは全機能を利用できます。',
    'mode.emergency': '緊急モード（かんたん）',
    'mode.advanced': '高度モード',
    'emergency.heading': '緊急メッセージ（簡易）',
    'emergency.help': 'フォーム入力でメッセージを作成し、内容欄へ自動反映します。',
    'emergency.template.label': 'メッセージ種別',
    'emergency.field.name': '氏名 / チーム名',
    'emergency.field.location': '現在地',
    'emergency.field.status': '状態 / 要求',
    'emergency.field.people': '人数',
    'emergency.field.details': '詳細',
    'emergency.field.details.placeholder': '実務的な短い詳細',
    'emergency.apply': '🆘 緊急メッセージ作成',
    'common.overwrite': '上書き',
    'common.cancel': 'キャンセル',

    /* --- Install prompt --- */
    'install.prompt': '📱 Lifeline Mesh をアプリとしてインストールしてオフラインでも使えるようにする',
    'install.btn': 'インストール',
    'install.later': 'あとで',

    /* --- Section 1: Keys --- */
    'keys.heading': '1) あなたの鍵',
    'keys.generateLoad': '🔑 鍵を生成・読み込む',
    'keys.resetAll': '🗑️ 全てリセット',
    'keys.notLoaded': '（未読み込み）',
    'keys.copyId': '📋 公開IDをコピー',
    'keys.showQR': '📱 QRコードを表示',
    'keys.export': '💾 鍵をエクスポート',
    'keys.import': '📥 鍵をインポート',
    'keys.mgmt.summary': '鍵管理',
    'keys.mgmt.qr': '<strong>QRコード:</strong> 公開IDをQRコードで表示して簡単にスキャン可能',
    'keys.mgmt.export': '<strong>エクスポート:</strong> 秘密鍵をパスワード保護されたJSONでダウンロード',
    'keys.mgmt.import': '<strong>インポート:</strong> バックアップファイルから鍵を復元',
    'keys.mgmt.warning': '<strong>⚠️ 注意:</strong> エクスポートした鍵は安全に保管してください。秘密鍵があれば誰でもあなたになりすますことができます。',
    'keys.kdf.argon2id': '🔐 鍵のエクスポートには <strong>Argon2id</strong>（メモリハード・推奨）を使用',
    'keys.kdf.pbkdf2': '⚠️ 鍵のエクスポートには <strong>PBKDF2</strong> フォールバックを使用（Argon2id 利用不可）',

    /* --- Section 2: Contacts --- */
    'contacts.heading': '2) 連絡先',
    'contacts.label': '連絡先JSON',
    'contacts.add': '➕ 連絡先を追加',
    'contacts.scanQR': '📷 QRコードをスキャン',
    'contacts.refresh': '🔄 更新',
    'contacts.delete': '❌ 選択を削除',
    'contacts.recipient.label': '宛先',
    'contacts.recipient.placeholder': '宛先を選択',
    'contacts.none': '（なし）',

    /* --- Section 3: Encrypt --- */
    'encrypt.heading': '3) メッセージを暗号化',
    'encrypt.mode.direct': 'ダイレクト',
    'encrypt.mode.group': 'グループ',
    'encrypt.recipient.prefix': '宛先:',
    'encrypt.recipient.none': '（上で選択）',
    'encrypt.group.namePlaceholder': '新しいグループ名',
    'encrypt.group.create': '👥 グループを作成',
    'encrypt.group.jsonPlaceholder': '参加するグループのJSONを貼り付け（id/name/members/senderKey）',
    'encrypt.group.join': '📥 グループに参加',
    'encrypt.group.select': 'グループを選択',
    'encrypt.group.memberSelect': '連絡先を選択',
    'encrypt.group.addMember': '➕ メンバーを追加',
    'encrypt.group.removeMember': '➖ メンバーを削除',
    'encrypt.group.noGroup': '（グループ未選択）',
    'encrypt.content.label': 'メッセージ内容',
    'encrypt.template.placeholder': '災害テンプレートを選択',
    'encrypt.template.safety': '安否確認',
    'encrypt.template.supplies': '物資支援依頼',
    'encrypt.template.evacuation': '避難連絡',
    'encrypt.template.medical': '医療支援要請',
    'encrypt.template.shelter': '避難所ステータス',
    'encrypt.template.apply': '🧩 テンプレート適用',
    'encrypt.btn': '🔒 暗号化',
    'encrypt.copy': '📋 暗号化メッセージをコピー',
    'encrypt.exportFile': '💾 暗号化ファイルをエクスポート',

    /* --- Section 4: Decrypt --- */
    'decrypt.heading': '4) メッセージを復号',
    'decrypt.label': '暗号化メッセージJSON',
    'decrypt.tofu': 'TOFU（初回信頼 - 未知の送信者を自動承認）',
    'decrypt.btn': '🔓 復号',

    /* --- Section 5: Bluetooth --- */
    'ble.heading': '5) Bluetoothリレー',
    'ble.unsupported': '⚠️ このブラウザはWeb Bluetoothに対応していません。ChromeまたはEdgeを使用してください。',
    'ble.status.prefix': '状態:',
    'ble.scan': '📡 デバイスをスキャン',
    'ble.disconnect': '❌ 切断',
    'ble.connectedTo': '接続中:',
    'ble.connectedTo.none': '（なし）',
    'ble.messages.summary': 'Bluetooth経由で受信したメッセージ',
    'ble.messages.none': '（なし）',
    'ble.send': '📤 最後の暗号化メッセージをBluetoothで送信',
    'ble.settings.summary': 'BLE 再送 / ACK 設定',
    'ble.ackTimeout': 'ACKタイムアウト (ms)',
    'ble.retryCount': '再送回数',
    'ble.retryDelay': '再送間隔 (ms)',
    'ble.chunkDelay': 'チャンク間隔 (ms)',
    'ble.reassemblyTimeout': '再結合タイムアウト (ms)',
    'ble.applyConfig': '⚙️ BLE設定を適用',
    'ble.resetConfig': '↺ デフォルトに戻す',

    /* --- Section 6: Delivery --- */
    'delivery.heading': '6) 配信操作',
    'delivery.queueStatus': 'キュー状態:',
    'delivery.flush': '🔁 キューのメッセージを今すぐ送信',
    'delivery.outbox.summary': '送信トレイ',
    'delivery.inbox.summary': '受信トレイ',
    'delivery.status.unsent': '未送信',
    'delivery.status.retrying': '再送中',
    'delivery.status.delivered': '配信済み',
    'delivery.status.failed': '失敗',
    'delivery.guide.default': '送信失敗時は、まず再送を実行し、必要であれば Clipboard / File / QR に切り替えてください。',
    'delivery.guide.failed': '送信が失敗しました（{error}）。失敗時は「再送」→「Clipboard」→「File/QR」の順で迂回してください。',
    'delivery.guide.fallback': 'BLE再送上限に到達したため、代替経路へ切替中です。失敗時は「再送」→「Clipboard」→「File/QR」の順で迂回してください。',
    'delivery.guide.retrying': '再送中です（attempt {attempt}）。しばらく待って再確認してください。',

    /* --- Section 7: Docs --- */
    'docs.summary': '📚 ドキュメント',
    'docs.usage': '使用ガイド',
    'docs.faq': 'よくある質問',
    'docs.threat': '脅威モデル',
    'docs.protocol': 'プロトコル仕様',

    /* --- Modals --- */
    'modal.qr.title': 'あなたの公開ID QRコード',
    'modal.qr.hint': '他のデバイスでスキャンして連絡先として追加してください',
    'modal.scanner.title': '連絡先QRコードをスキャン',
    'modal.scanner.hint': 'カメラをQRコードに向けて連絡先を追加してください',

    /* --- Status messages (JS) --- */
    'status.templateSelect': 'テンプレートを選択してください',
    'status.templateLoadFail': 'テンプレートの読み込みに失敗しました',
    'status.templateOverwrite': '既存のメッセージを上書きしますか？',
    'status.templateOverwriteInline': '既存のメッセージ内容をこのテンプレートで上書きしますか？',
    'status.templateApplied': 'テンプレートを適用しました。必要項目を入力してください。',
    'status.templateCancel': 'テンプレート適用をキャンセルしました。',

    /* --- Disaster templates (message content) --- */
    'template.safety.content': '【安否確認】\n氏名: \n現在地: \n状態: 無事 / 軽傷 / 重傷\n必要な支援: \n同行者: \n次の連絡予定: ',
    'template.supplies.content': '【物資支援依頼】\n場所: \n必要物資: 水 / 食料 / 毛布 / 衛生用品 / その他\n人数: \n緊急度: 高 / 中 / 低\n受け渡し可能時間: \n連絡先情報: ',
    'template.evacuation.content': '【避難連絡】\n出発地点: \n避難先: \n移動手段: 徒歩 / 車 / その他\n同行者人数: \n危険情報: \n到着予定時刻: ',
    'template.medical.content': '【医療支援要請】\n場所: \n対象者: \n症状・けが: \n意識: あり / なし\n呼吸: あり / なし\n必要な処置・搬送: ',
    'template.shelter.content': '【避難所ステータス】\n避難所名: \n場所: \n収容可能人数: \n現在の人数: \n利用可能物資: \n緊急に必要な物資: \n備考: ',
  }
};

let currentLang = localStorage.getItem(LANG_STORAGE_KEY) || 'en';

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (!translations[lang]) return;
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  applyTranslations();
  document.documentElement.lang = lang;

  const btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.textContent = lang === 'ja' ? 'EN' : 'JA';
    btn.title = lang === 'ja' ? 'Switch to English' : '日本語に切り替え';
  }
}

/**
 * Translate a key, optionally interpolating {placeholder} values.
 * @param {string} key
 * @param {Record<string, string>} [vars]
 */
export function t(key, vars = {}) {
  const str = translations[currentLang]?.[key] ?? translations['en']?.[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/**
 * Apply translations to all elements with data-i18n attribute.
 * Also updates placeholder, title, and aria-label if corresponding
 * data-i18n-placeholder / data-i18n-title / data-i18n-aria attributes are set.
 */
export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const html = el.getAttribute('data-i18n-html');
      if (html === 'true') {
        el.innerHTML = t(key);
      } else {
        el.textContent = t(key);
      }
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
}
