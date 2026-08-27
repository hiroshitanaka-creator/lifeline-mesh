# Lifeline Mesh — Intent / Viability Analysis (evidence-only)

- 実施日: 2026-08-27
- 対象: `hiroshitanaka-creator/lifeline-mesh`
- 対象リビジョン: `096cdccaf3f24303f41b561efc1b0892f3f44cde`（`origin/main` と同一 SHA）
- 種別: 調査レポート。実装タスクではない。既存ファイルは一切変更していない。

---

## 0. Phase 0 investigation trace

本セクションは実行コマンドとその出力のみで構成される。解釈は含まない。
以降のセクションは、ここに記録された receipt のみを引用する。

### 0.1 リポジトリ基本情報

```
$ git rev-parse --abbrev-ref HEAD
claude/lifeline-mesh-intent-analysis-h5z550

$ git rev-parse HEAD
096cdccaf3f24303f41b561efc1b0892f3f44cde

$ git rev-parse origin/main
096cdccaf3f24303f41b561efc1b0892f3f44cde

$ git diff --stat HEAD origin/main
(出力なし = 差分ゼロ)
```

作業ブランチの HEAD SHA は `origin/main` と一致する。したがって本調査は `main` のツリーを対象としている。

```
$ git ls-files | wc -l
201
```

```
$ git ls-files | awk -F/ '{print $1}' | sort | uniq -c | sort -nr
     44 docs
     28 tests
     23 .github
     22 app
     14 tools
     12 crypto
      8 transport
      7 types
      7 spec
      6 node-server
      6 bluetooth
      4 gateway
      1 tsconfig.runtime.json
      1 tsconfig.json
      1 sim
      1 server.js
      1 playwright.config.js
      1 package.json
      1 package-lock.json
      1 eslint.config.js
      1 TECHNICAL_ROADMAP.md
      1 SECURITY.md
      1 REPO_ANALYSIS.md
      1 README_ES.md
      1 README.md
      1 PROJECT_CHARTER.md
      1 LICENSE
      1 GOOD_FIRST_ISSUES.md
      1 DEEP_DIVE_ANALYSIS.md
      1 CONTRIBUTING.md
      1 .husky
      1 .gitignore
```

```
$ git log --oneline -20
096cdcc docs: clarify strict local gate and clean husky hook (#184)
59fa90e chore: add strict local validation script (#183)
e6a9243 docs: add offline build guide and Spanish README translation (#182)
26bcea2 Use canonical outbox API for offline queue and add rebuild regressions (#180)
8d24588 gateway: queue async event-store persistence and trim memory model (#179)
6bc1719 Serialize relay store writes and harden temp file persistence (#178)
60ff2ba Harden gateway ingress validation and payload limits (#177)
2145ff4 Add route advertisement verifier hook and abuse guards (#176)
bca6d1a Separate route-adv control path and bound mesh routing state (#175)
466e7c9 Fix node relay delivery semantics to wait for client ACK (#174)
0d4732b Harden BLE ACK fail-fast and payload parsing (#173)
437f019 Harden phase5 verification evidence and sink audit truth (#172)
64b55df Freeze truthful v0.1.x BLE peripheral path on Node relay appliance (#171)
902ca83 docs: freeze v0.1.x BLE peripheral supported path (#170)
822ea29 Harden gateway event store with durable restart-safe persistence (#169)
112de12 Harden Phase 3 outbox/inbox event-sourced projections (#168)
c69e6c4 docs: reconcile implementation-series repository truth and maintenance gate (#167)
f50d287 docs: record series completion preflight status (#166)
7b9d3af phase5: tighten unsafe HTML sinks and audit policy (#165)
b4c3707 phase5: add deterministic simulator, fuzz/property tests, and phase reporting (#164)
```

### 0.2 rg クエリパック（6件、全件カウント付き）

#### Q1 — GSI / 国土地理院 / 避難所共通コード

```
$ rg -n -i "国土地理院|hinanbasho|common_id|commonId|gsi\.go\.jp|maps\.gsi" .
(no output; exit=1)
```

**Q1 = 0 hits**

先行 Grok パスの「ツリー内に GSI 文字列なし」という主張は、本 run の rg により再検証され、成立する。

#### Q2 — dmesh ワイヤ種別 / 暗号 API

```
$ rg -n "dmesh-id|dmesh-msg|dmesh-chunk|encryptMessage|decryptMessage" --glob "*.js" | wc -l
215
```

**Q2 = 215 hits**（先頭 8 件）

```
tools/validate-test-vectors.js:20:function decryptMessageSkipTimestamp({ message, recipientBoxPK, recipientBoxSK, expectedSenderSignPK, expectedSenderBoxPK }) {
tools/validate-test-vectors.js:22:  if (!message || message.v !== 1 || message.kind !== "dmesh-msg") {
tools/validate-test-vectors.js:270:    if (id.kind !== "dmesh-id") throw new Error("Invalid kind");
tools/generate-test-vectors.js:69:    const message = DMesh.encryptMessage({
node-server/manual-smoke.js:176:    kind: "dmesh-msg",
tests/e2e/transport-receive-ci-fast.spec.js:29:  await expect(page.locator("#input")).toContainText("dmesh-msg");
tests/e2e/main-flow.spec.js:63:  expect(encryptedObj.kind).toBe("dmesh-msg");
tests/e2e/main-flow.spec.js:176:  await page.goto("/?title=Offline%20Payload&text=%7B%22kind%22%3A%22dmesh-msg%22%7D#decrypt");
```

#### Q3 — Web Bluetooth

```
$ rg -n -i "web bluetooth|WebBluetooth|navigator.bluetooth" . | wc -l
65
```

**Q3 = 65 hits**（先頭 8 件）

```
./docs/WEB_BLUETOOTH_SUPPORT.md:27:| Safari | ❌ | ❌ | N/A | N/A | ❌ | No production Web Bluetooth support. |
./docs/BLE_SUPPORT_MATRIX.md:10:| Safari (macOS/iOS) | ❌ | ❌ Unsupported | No practical production Web Bluetooth support in this project |
./docs/PHASE_PROGRESS.md:50:- Browser/mobile peripheral adapters are still pending (Web Bluetooth central/client limitation remains).
./docs/FAQ.md:245:- Safari: not supported for production Web Bluetooth use.
./node-server/server.js:5: * Mobile/desktop browsers connect to this node via Web Bluetooth as centrals.
./README.md:271:❌ **BLE availability**: Web Bluetooth is effectively Chromium-only and requires a secure context (`https://` or `http://localhost`)
./app/index.html:285:      <p class="small ng" data-i18n="ble.unsupported">⚠️ Web Bluetooth not supported in this browser. Use Chrome or Edge.</p>
./spec/PROTOCOL.md:662:- **Browser-side BLE peripheral mode** is still unavailable (Web Bluetooth central/client limitations).
```

#### Q4 — QR

```
$ rg -n -i "qr|QRCode|html5-qrcode" --glob "*.{js,html,md}" | wc -l
168
```

**Q4 = 168 hits**（先頭 8 件）

```
crypto/core.js:28:export const QR_MAX_CHUNK_SIZE = 2048;
crypto/transport.js:151:export class QRTransport extends BaseTransport {
docs/WEB_BLUETOOTH_SUPPORT.md:15:- ℹ️ **Important**: BLE is optional in Lifeline Mesh. Clipboard/File/QR relay remains the baseline fallback path.
tests/integration/sync-engine-phase3.test.js:93:  const qrRoute = resolveIngestRoute({ text: JSON.stringify({ kind: "dmesh-id", signPK: "aa", boxPK: "bb" }), channel: INGEST_CHANNEL.QR });
app/index.html:156:      <button data-action="showQRCode" data-i18n="keys.showQR">📱 Show QR Code</button>
app/index.html:180:      <button data-action="scanQRCode" data-i18n="contacts.scanQR">📷 Scan QR Code</button>
app/index.html:271:      <button data-action="scanMessageQRCode">📷 Scan Message QR</button>
app/index.html:377:      <h3 id="qr-modal-title" data-i18n="modal.qr.title">Your Public ID QR Code</h3>
```

#### Q5 — テスト / Playwright / hardware smoke

```
$ rg -n "test:e2e|playwright|hardware-smoke|sample-normalized" . | wc -l
83
```

**Q5 = 83 hits**（先頭 8 件）

```
./docs/RELEASE_READINESS_REPORT.md:16:| E2E (smoke) | `npm run test:e2e:smoke` | ✅ Pass | File-presence check: config + spec + required controls present |
./docs/RELEASE_READINESS_REPORT.md:17:| E2E (Playwright) | `npm run test:e2e:playwright` | ⚠️ Not run at Phase 20 | Playwright was unavailable; real browser tests require `npm run test:e2e:install` |
./docs/PHASE1_UNRESOLVED_AND_SOLUTIONS_JA.md:8:- `npm run test:e2e:playwright` 実行時に `playwright: not found` となり、ブラウザE2Eをこの環境では実行できない。
./docs/PHASE_PROGRESS.md:21:| 13 | E2E最小セット導入 | ✅ completed | Playwright spec + smoke check (delivery ops, group roundtrip). Note: at Phase 13–20 the E2E gate ran smoke fallback, not real Playwright.
./docs/HARDWARE_SMOKE_PATH.md:32:- `docs/evidence/hardware-smoke/<YYYY-MM-DD>-<run-label>.json`
./docs/evidence/hardware-smoke/sample-normalized.json:3:  "recordType": "phase5-hardware-smoke",
./tools/hardware-smoke-record.js:43:    recordType: "phase5-hardware-smoke",
./docs/OPERATIONS_RUNBOOK.md:11:4. For strict local release rehearsal, run `npm run validate:full-local` (`validate:local` + `test:e2e:real-browser`).
```

#### Q6 — 施設 ID / 避難所

```
$ rg -n -i "facilityId|shelterId|避難所" . | wc -l
3
```

**Q6 = 3 hits**（全件）

```
./docs/DEEP_DIVE_ANALYSIS_JA.md:183:例: 「避難所Aは定員に達しました」→ 全員に伝えたい
./app/src/i18n.js:236:    'encrypt.template.shelter': '避難所ステータス',
./app/src/i18n.js:313:    'template.shelter.content': '【避難所ステータス】\n避難所名: \n場所: \n収容可能人数: \n現在の人数: \n利用可能物資: \n緊急に必要な物資: \n備考: ',
```

`facilityId` / `shelterId` という識別子はツリー内に一度も出現しない。3 hits はすべて UI 文言（i18n テンプレート文字列）と日本語解説ドキュメント内の例文である。

### 0.3 Must-read files — `wc -l` + `git hash-object` + 固有行

MISSING は 0 件。全 25 パスが存在する。

| path | lines | git hash-object |
|---|---:|---|
| `README.md` | 485 | `c92e3bb3df08323cbffa8194d0152c27beeab459` |
| `PROJECT_CHARTER.md` | 12 | `adc00c1049a20f5e740229f7775962f1b09f2de3` |
| `package.json` | 90 | `d54f435ad14b348ccf638fec5deacd7b3a091a6b` |
| `crypto/core.js` | 841 | `5fba4d4e3b072558ef8d3c6cbdfb0de2fc48a0b3` |
| `crypto/group.js` | 217 | `7866ed72631ae0f8e06e6abc5dc760babb5de1e5` |
| `crypto/transport.js` | 720 | `d534a75c49690ed1481783ff5ecfaeb2871cad11` |
| `crypto/store.js` | 1356 | `8d5c177af46b3f7fe723aa096523660e8ebd6963` |
| `spec/PROTOCOL.md` | 678 | `02d84d3a561b008b4522835cc3afb9227d047e4b` |
| `spec/THREAT_MODEL.md` | 193 | `20b3664535305b51d4119f76fd78f1715b7adfc0` |
| `app/src/main.js` | 2542 | `b87ab92cd8643d6952abbdacdb56ea06666244d1` |
| `app/src/i18n.js` | 405 | `a922d700f0f06013d34a8e7ebb05a4e48f92d133` |
| `app/index.html` | 396 | `9434e7b215639699486c2fa81e50d302f107adc5` |
| `bluetooth/ble-manager.js` | 1036 | `2045f7bf73effaad26d933dd75d17c3f94e5cd45` |
| `bluetooth/mesh-router.js` | 600 | `a26b85b32a73ceb236a5e66962eb35dae2d0c1e3` |
| `bluetooth/gatt-server.js` | 624 | `752e4a28feff8628d865b2654fbeb5fa3f76c37e` |
| `docs/HARDWARE_SMOKE_PATH.md` | 67 | `b1c095091cd68c35d106c4bc5adfb667de827982` |
| `docs/RELAY_DRILL_AB_C.md` | 50 | `7df72dcb4df84eb7791c17d179a78978a95165c6` |
| `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md` | 104 | `384482411805dc7b5f3e41b5ec51a70464f80b06` |
| `docs/RELEASE_READINESS_REPORT.md` | 42 | `53bdd9b37010a3fdc113d41498a23fe660169abf` |
| `docs/PHASE_PROGRESS.md` | 50 | `1d4bb71267022d0133f0625fe0b38a86f184edd0` |
| `docs/IMPLEMENTATION_SERIES_STATUS.md` | 47 | `ccfa4c535db1690032df35a44d592b5679c881d3` |
| `docs/REPO_TRUTH_AUDIT.md` | 47 | `581cbb0ed13b19305e96ab132ace270c69ad0045` |
| `docs/FAQ.md` | 493 | `6de0c5f4a1c7e4c1ce872dacee747073c9ea5378` |
| `docs/evidence/hardware-smoke/sample-normalized.json` | 39 | `a57ff69fffd12525dfccbec500a9c5f2ba8748ed` |
| `tests/e2e/main-ci-critical-path.spec.js` | 212 | `3675b46581a2be11c7d5278e857efb63ac7fd4fb` |

補助 receipt（本文で引用するため追加取得）:

| path | lines | git hash-object |
|---|---:|---|
| `crypto/key-backup.js` | 327 | `7ccd9a61b22ea0db7b0cbf335a338180f98115bd` |
| `bluetooth/backends/node-bleno.js` | 278 | `5bc67213666af9142c9b245d9bf7c075ea5e90bd` |
| `transport/native-peripheral-contract.js` | 53 | `059e42c39735fa89dfd567a14bcb7b424eb79648` |
| `transport/ble-browser-central-link.js` | 72 | `40d2c02b30a0d3918f4567a852e1cc94d0973029` |
| `transport/node-gatt-peripheral-link.js` | 81 | `97ef3ea56da6b2735dfe93f1e8ffdc4a3af00f0e` |

#### 各ファイル固有の verbatim 行

`README.md`
```
README.md:11:Lifeline Mesh is a browser-based, cryptographically secure messaging system designed for emergency situations where traditional infrastructure may be degraded or unavailable.
README.md:271:❌ **BLE availability**: Web Bluetooth is effectively Chromium-only and requires a secure context (`https://` or `http://localhost`)
README.md:272:⚠️ **Browser/mobile peripheral mode gap**: v0.1.x officially supports only Node relay appliance peripheral mode (`bluetooth/backends/node-bleno.js`); mobile/browser peripheral remains unresolved (operational bypass, not closure)
```

`PROJECT_CHARTER.md`（全 12 行、要旨 4 行）
```
PROJECT_CHARTER.md:2:We build for emergency usefulness.
PROJECT_CHARTER.md:5:- Emergency coordination messaging
PROJECT_CHARTER.md:6:- Verification against impersonation / tampering
PROJECT_CHARTER.md:7:- Offline-first and relay-friendly design
```

`package.json`
```
package.json:37:    "test:e2e": "node tests/e2e/smoke-check.js",
package.json:38:    "test:e2e:smoke": "node tests/e2e/smoke-check.js",
package.json:39:    "test:e2e:playwright": "node tests/e2e/run-playwright.js",
package.json:45:    "test:e2e:playwright:main-ci": "node tests/e2e/run-playwright.js tests/e2e/main-ci-critical-path.spec.js",
```

`crypto/core.js`
```
crypto/core.js:15:export const DOMAIN = "DMESH_MSG_V1";
crypto/core.js:16:export const IDENTITY_DOMAIN = "DMESH_ID_V1";
crypto/core.js:321:export function buildSignBytes({ senderSignPK, senderBoxPK, recipientBoxPK, ephPK, nonce, ts, ciphertext }, naclUtil) {
crypto/core.js:651:export function createSignedPublicIdentity({ name, signPK, signSK, boxPK }, nacl, naclUtil) {
```

`crypto/group.js`
```
crypto/group.js:5:const GROUP_DOMAIN = "DMESH_GROUP_V1";
crypto/group.js:6:const GROUP_MSG_KEY_INFO = "DMESH_GROUP_MSG_KEY";
crypto/group.js:147:export function encryptGroupMessage({ content, groupId, senderKey, senderSignPK, senderSignSK }, nacl, naclUtil) {
```

`crypto/transport.js`
```
crypto/transport.js:151:export class QRTransport extends BaseTransport {
crypto/transport.js:165:      bidirectional: false, // Asymmetric: show QR or scan, not both
crypto/transport.js:321:export class ClipboardTransport extends BaseTransport {
crypto/transport.js:417:export class FileTransport extends BaseTransport {
```

`crypto/store.js`
```
crypto/store.js:17:export const DB_NAME = "lifelineMeshV2";
crypto/store.js:18:export const DB_VERSION = 5;
crypto/store.js:30:export const STORE_EVENT_LOG = "eventLog";
```

`spec/PROTOCOL.md`
```
spec/PROTOCOL.md:3:> Phase-1 freeze note: canonical vnext sign-target definitions are in `spec/PROTOCOL_VNEXT.md`.
spec/PROTOCOL.md:10:- **Signing**: Ed25519 (authentication, non-repudiation)
spec/PROTOCOL.md:11:- **Encryption**: X25519-XSalsa20-Poly1305 (confidentiality, integrity)
spec/PROTOCOL.md:662:- **Browser-side BLE peripheral mode** is still unavailable (Web Bluetooth central/client limitations).
```

`spec/THREAT_MODEL.md`
```
spec/THREAT_MODEL.md:33:- **Device compromise**: Attacker has full access to user's device/keys
spec/THREAT_MODEL.md:36:- **Denial of service**: Flooding, resource exhaustion
spec/THREAT_MODEL.md:185:- **Limited verification**: Out-of-band channels may be unavailable → TOFU acceptable trade-off
spec/THREAT_MODEL.md:186:- **Device loss common**: Key backup/recovery out of scope (users warned)
```

`app/src/main.js`
```
app/src/main.js:2266:  const myId = await buildMySignedIdentityPayload();
app/src/main.js:2267:  const idText = JSON.stringify(myId, null, 2);
app/src/main.js:2279:  await QRCode.toCanvas(canvas, idText, {
app/src/main.js:2355:    if (parsed.kind !== 'dmesh-msg' && parsed.kind !== 'dmesh-group-msg') {
```

`app/src/i18n.js`
```
app/src/i18n.js:5:const LANG_STORAGE_KEY = 'lifeline:lang';
app/src/i18n.js:82:    'encrypt.template.shelter': 'Shelter Status',
app/src/i18n.js:159:    'template.shelter.content': '[Shelter Status]\nShelter name: \nLocation: \nCapacity: \nCurrent occupancy: \nAvailable supplies: \nUrgent needs: \nNotes: ',
```

`app/index.html`
```
app/index.html:2:<html lang="ja">
app/index.html:10:    content="default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
app/index.html:285:      <p class="small ng" data-i18n="ble.unsupported">⚠️ Web Bluetooth not supported in this browser. Use Chrome or Edge.</p>
app/index.html:377:      <h3 id="qr-modal-title" data-i18n="modal.qr.title">Your Public ID QR Code</h3>
```

`bluetooth/ble-manager.js`
```
bluetooth/ble-manager.js:129:      requestDevice: (requestOptions) => navigator.bluetooth.requestDevice(requestOptions),
bluetooth/ble-manager.js:181:  async scan() {
bluetooth/ble-manager.js:654:  async _maybeForward(message) {
```

`bluetooth/mesh-router.js`
```
bluetooth/mesh-router.js:5:*   - 1-hop relay only (default): forward to directly connected peers.
bluetooth/mesh-router.js:6:*   - Deduplication by transferId (msgId or derived fallback).
bluetooth/mesh-router.js:10:* Phase 2 scope (opt-in via options.enableRouting = true):
```

`bluetooth/gatt-server.js`
```
bluetooth/gatt-server.js:4:* Implements the BLE peripheral/server side of the Lifeline Mesh protocol.
bluetooth/gatt-server.js:5:* The Web Bluetooth API does not expose peripheral mode in browsers; this
bluetooth/gatt-server.js:11:* In test environments a MockGATTBackend is available for unit-testing the
```

`docs/HARDWARE_SMOKE_PATH.md`
```
docs/HARDWARE_SMOKE_PATH.md:9:- Device A: Browser with Web Bluetooth support.
docs/HARDWARE_SMOKE_PATH.md:10:- Device B: Node host running `node-bleno` peripheral reference path.
docs/HARDWARE_SMOKE_PATH.md:30:Hardware smoke remains intentionally **manual / non-CI**. Every run must produce a normalized JSON artifact under:
```

`docs/RELAY_DRILL_AB_C.md`
```
docs/RELAY_DRILL_AB_C.md:12:- **Single-client relay truth remains**: Node peripheral active session is intentionally one client at a time.
docs/RELAY_DRILL_AB_C.md:13:- Native/mobile peripheral mode is currently **contract-only** (`NativePeripheralContractLink` stub).
docs/RELAY_DRILL_AB_C.md:47:- Browser BLE peripheral mode.
```

`docs/BLE_MANUAL_VALIDATION_RUNBOOK.md`
```
docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:7:> Scope: Manual verification only. This document does **not** claim automated or hardware CI validation.
docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:9:> v0.1.x support truth: BLE peripheral endpoint is the **Node relay appliance path** (`node-server/` + `node-bleno` backend). Browser/mobile peripheral mode is not shipped.
docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:24:| BLE-01 | Scan + connect | 2 | `Connected via Bluetooth` status appears on initiating device. | ☐ |
```

`docs/RELEASE_READINESS_REPORT.md`
```
docs/RELEASE_READINESS_REPORT.md:5:- Decision: **GO (Phase 20 complete)**
docs/RELEASE_READINESS_REPORT.md:16:| E2E (smoke) | `npm run test:e2e:smoke` | ✅ Pass | File-presence check: config + spec + required controls present |
docs/RELEASE_READINESS_REPORT.md:22:> was reported as "Pass (fallback)" because the runner fell back silently to smoke when Playwright
```

`docs/PHASE_PROGRESS.md`
```
docs/PHASE_PROGRESS.md:4:- Completion: 20/20 (100%)
docs/PHASE_PROGRESS.md:50:- Browser/mobile peripheral adapters are still pending (Web Bluetooth central/client limitation remains).
```

`docs/IMPLEMENTATION_SERIES_STATUS.md`
```
docs/IMPLEMENTATION_SERIES_STATUS.md:43:- Energy metrics remain simulator-derived and should not be represented as hardware battery telemetry.
docs/IMPLEMENTATION_SERIES_STATUS.md:45:- Hardware smoke evidence remains manual-only; CI still cannot attest physical RF/device behavior.
```

`docs/REPO_TRUTH_AUDIT.md`
```
docs/REPO_TRUTH_AUDIT.md:6:1. **Hard-coded test totals were contradictory/stale** across docs (`217/217` and `227/227`).
docs/REPO_TRUTH_AUDIT.md:33:- `docs/PHASE_A_TO_E_EXECUTION_JA.md` remains as **historical planning reference** and is not completion evidence.
```

`docs/FAQ.md`
```
docs/FAQ.md:7:Lifeline Mesh is a browser-based end-to-end encrypted messaging system designed for emergency situations. It works offline, requires no server, and can relay messages through any available network (mesh, Bluetooth, USB, radio, etc.).
docs/FAQ.md:245:- Safari: not supported for production Web Bluetooth use.
docs/FAQ.md:268:**Important**: `file://` opening of `app/index.html` and a never-loaded standalone local HTML copy are not supported runtime paths.
```

`docs/evidence/hardware-smoke/sample-normalized.json`
```
docs/evidence/hardware-smoke/sample-normalized.json:8:    "site": "staging-lab"
docs/evidence/hardware-smoke/sample-normalized.json:24:    "notes": "Single packet loss during RF interference simulation"
docs/evidence/hardware-smoke/sample-normalized.json:35:    "manualRun": true,
docs/evidence/hardware-smoke/sample-normalized.json:36:    "ciBacked": false,
```

`tests/e2e/main-ci-critical-path.spec.js`
```
tests/e2e/main-ci-critical-path.spec.js:12:  const myIdText = await page.locator("#my-id").textContent();
tests/e2e/main-ci-critical-path.spec.js:15:  await page.locator("#contact-input").fill(JSON.stringify(myIdentity, null, 2));
tests/e2e/main-ci-critical-path.spec.js:30:  await expect(page.locator("#decrypted")).toHaveText(PLAIN_TEXT);
```

### 0.4 `git ls-files tests` 全件 receipt

```
$ for f in $(git ls-files tests); do printf "%s %s %s\n" "$f" "$(wc -l < $f)" "$(git hash-object $f)"; done
```

| path | lines | git hash-object | 何を実行するか |
|---|---:|---|---|
| `tests/e2e/main-ci-critical-path.spec.js` | 212 | `3675b46581a2be11c7d5278e857efb63ac7fd4fb` | Playwright。単一 `page` で鍵生成→自分自身を連絡先追加→暗号化→復号、verification 遷移、share-target intake、オフライン app-shell |
| `tests/e2e/main-flow.spec.js` | 580 | `384c8f39a14cb9e10df4d2daf3bf057ca1f86298` | Playwright 12 テスト。うち `pseudo-e2e BLE: mock BLEManager I/O boundary`（277行）、`multi-device group onboarding`（449行、`browser` fixture で 2 context） |
| `tests/e2e/multi-link.spec.js` | 380 | `36073563fb7135389439ba6be817e013484d7673` | Playwright。`MockLink("peer-alice")` / `MockLink("peer-bob")` をページ内に注入し、relay/dedup/route-adv を検証 |
| `tests/e2e/run-playwright.js` | 31 | `30c971afe16f669574eb54b0143792ea6e705bee` | `playwright test` を spawn。未インストール時は smoke へ fallback せずエラー終了 |
| `tests/e2e/smoke-check.js` | 20 | `f1cd3251edef7ebcc6b60fc41c0919d486303bce` | `fs.existsSync` 3件 + `main-flow.spec.js` の文字列 4 件を `String.includes` で確認するのみ。ブラウザ不使用 |
| `tests/integration/app-runtime-mesh.test.js` | 341 | `538a1521f99804deec1056d530c5959dc0cf9cef` | `app/src/runtime-mesh.js` のマルチリンク調停 |
| `tests/integration/ble-crypto.test.js` | 1323 | `6624994bba599e07178164441e20e5c5af2af2c0` | BLE 層 + crypto の結合（チャンク/ACK/outbox flush） |
| `tests/integration/ble-mesh-relay.test.js` | 368 | `4266ece7fde07f5851fe4fa29db46ef8a38ca833` | `BLEManager` + `router` の転送経路 |
| `tests/integration/contact-verification-policy.test.js` | 318 | `3fe61ab1a34438a6cd0191fccb2440d55c88efe6` | 連絡先 verified/compromised ポリシー |
| `tests/integration/db-migration-normalize.test.js` | 39 | `a2ba83eb0a53f59e55b62301c1087f6227f225a8` | legacy DB 正規化移行 |
| `tests/integration/gateway-phase4.test.js` | 325 | `8c58e84bd1d94b5d3ab25bb6d24c94d21115aa89` | `gateway/` island backhaul / dedupe |
| `tests/integration/gatt-server.test.js` | 420 | `7e6e039492813cad747bb53788d966399b330ffa` | `GATTServer` を `MockGATTBackend` で駆動 |
| `tests/integration/group-import-normalization.test.js` | 34 | `10d373108297a3c28972784656f602cf08b1fd15` | group onboarding payload 正規化 |
| `tests/integration/group-messaging.test.js` | 436 | `1d9664f52d6f88b4acd068aaf153c7c73317947a` | Sender Key 群メッセージ round-trip |
| `tests/integration/group-verification-policy.test.js` | 96 | `727917d6c05cdb29cc8f5da64a58b32db98999b9` | group actor 検証ポリシー |
| `tests/integration/mesh-router-phase2.test.js` | 514 | `538a9bea37c54f7655ff1017ad215eb98c964c46` | N-hop ルーティング / route table |
| `tests/integration/mesh-router.test.js` | 239 | `2185a4efb904efa569c64b9c7d4573ba8ac89d11` | 1-hop relay + dedup + hop budget |
| `tests/integration/node-server-relay-ops.test.js` | 216 | `fbd956c07cabaa1ec42ac9e0490d4e4ffbc7b672` | Node relay 運用操作 |
| `tests/integration/node-server-relay.test.js` | 508 | `9ec227b9bd87744055c95939b9e0b2b77291bb90` | Node relay 永続化 / replay / 単一クライアント |
| `tests/integration/operator-panel.test.js` | 253 | `ba3be26e8b81252e52046367af0c84e72f5f2e30` | operator panel レンダリング |
| `tests/integration/phase5-simulator-fuzz.test.js` | 73 | `6a3e2e38d8a6e9f579a190660d93dd3f27dabec8` | `sim/deterministic-simulator.js` の property/fuzz |
| `tests/integration/protocol-vnext-phase1.test.js` | 142 | `47ae78dcf9489f22f3e3036efb0f1cd1384e0379` | vnext conformance vectors |
| `tests/integration/share-target-intake-routing.test.js` | 187 | `a85d0e3b00c12ed3aa34dd885b9888420830f333` | share-target ルーティング判定 |
| `tests/integration/store-event-sourcing-phase3.test.js` | 279 | `1dd158667187430486e188ee781f7942055d0a49` | append-only eventLog 射影 |
| `tests/integration/store-maintenance.test.js` | 215 | `655ad073bbd7cba65c3f0b6b05e67ec630e45e7a` | store 保守 / purge |
| `tests/integration/sync-engine-phase3.test.js` | 104 | `d4a130137d2c748a9ec97a0924b3f5f79bbfb115` | anti-entropy sync + `resolveIngestRoute` |
| `tests/integration/transport-phase2.test.js` | 204 | `ea799ffb2fc75520ad03483375e3d3e09ecd7140` | `transport/` 境界 / retry / A→B→C 自動化写像 |

### 0.5 `.github/workflows/` 全件 receipt

| path | lines | git hash-object | jobs / 実行内容 |
|---|---:|---|---|
| `.github/workflows/.gitkeep` | 0 | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 空ファイル |
| `.github/workflows/ci.yml` | 218 | `e1a31aa222d13f47a7f8cd714c50b220fa40fc7f` | jobs: `lint_typecheck`(`gate:lint-typecheck:ci`) / `unit_tests`(`gate:test:unit`) / `integration_tests`(`gate:test:integration`) / `compat_gate`(`gate:compat`) / `e2e_browser_smoke`(`test:e2e:install` → `gate:e2e:ci-critical`) / `e2e_browser_transport_receive`(`gate:e2e:ci-extra-browser`) / `validate_gate`(echo のみ、needs 集約) / `security`(`npm audit`, `check:security-audit`, grep によるシークレット検査) |
| `.github/workflows/e2e-real-browser.yml` | 54 | `b693e2f16db199ee2e89fc24a225a2ca94515abc` | job `playwright_real_browser`。cron `0 3 * * *` + push(main/master)。`test:e2e:install` → `test:e2e:playwright`（全 spec）、trace/report を artifact 化 |
| `.github/workflows/pages.yml` | 87 | `7396336997ecb36f80f85b33c175c3f030b9f46e` | jobs: `test`(`lint` / `typecheck` / `npm test`) → `deploy`(`npm run build --prefix app`、docs/spec 同梱、GitHub Pages へ公開) |
| `.github/workflows/real-bleno-smoke.yml` | 67 | `bbf590ccd9ac5f2bd4c7ad69670b0b046ca0ee09` | job `smoke`。`workflow_dispatch` のみ。`runs-on: [self-hosted, linux, bluetooth]`。`node node-server/manual-smoke.js --non-interactive --expect-client=... --timeout-ms=...` を実行し `artifacts/real-bleno-smoke.json` を upload |
| `.github/workflows/security.yml` | 121 | `7a020c6fd3d08b4da48f7bf1c3d4cfcafe62fcb8` | jobs: `dependency-audit`(`npm audit` root/crypto/tools) / `codeql`(CodeQL) / `secrets`(Detect secrets) / `sri`(SRI hash verification) |

### 0.6 補助 receipt（本文引用のため）

```
$ git ls-files artifacts | wc -l
0
```

`docs/evidence/hardware-smoke/sample-normalized.json` が参照する `artifacts/manual-smoke/device-b.log` /
`artifacts/manual-smoke/device-c.log` / `artifacts/manual-smoke/relay-drill-sheet.pdf` は
いずれも git 管理下に存在しない。

```
$ cat node-server/package.json  （抜粋）
  "dependencies": { "@abandonware/bleno": "^0.6.1" },
  "os": [ "linux" ],
  "readme": "Run on Linux with BlueZ. Requires: sudo setcap cap_net_raw+eip $(which node)"
```

```
transport/native-peripheral-contract.js:19:    return Promise.reject(new Error("NativePeripheralContractLink is contract-only in v0.1.x"));
transport/native-peripheral-contract.js:48:      peripheral: true,
transport/native-peripheral-contract.js:49:      shipped: false,
transport/native-peripheral-contract.js:50:      contractOnly: true
```

**Phase 0 完了**。必須項目（HEAD sha / `git ls-files` count / ディレクトリヒストグラム /
rg 6 クエリ+カウント / `crypto/core.js`・`crypto/transport.js`・`app/src/main.js`・
`bluetooth/ble-manager.js`・`tests/e2e/main-ci-critical-path.spec.js` の hash-object）はすべて記録済み。

---
## 1. Scope and method

### 1.1 対象と方法

- 対象は Phase 0 §0.1 で SHA を確定したツリーのみ。`origin/main` と同一 SHA であることを確認済み。
- 実行したコマンドは `git` / `rg` / `wc` / `git hash-object` のみ。`npm test` / `npm install` / ビルドは実行していない。
- 既存ファイルの編集・削除・改名・整形は行っていない。新規作成は本ファイル 1 点のみ。

### 1.2 証拠ランク（本レポートで一貫して適用）

| ランク | 対象 | 本レポートでの扱い |
|---|---|---|
| receipt | Phase 0 §0.3–§0.6 で hash-object を取得したファイルの実際の行 | 事実 |
| claim | `README.md` / `docs/*` / Issues / PR タイトル | 主張。裏付けが取れるまで事実としない |
| process claim | 「Phase 20 complete」「20/20」「GO」「CI green」 | プロセス上の宣言。ランタイム挙動の証拠ではない |
| fixture | `sample-raw.json` / `sample-normalized.json` / `staging-lab` / `Mock*` | 固定値。実測ではない |
| loopback | 単一 `page` 内で完結する Playwright | 同一プロセス内往復。多デバイス通信の証拠ではない |
| 非証拠 | 過去のチャット回答（撤回済み Claude 出力・Grok パスを含む） | 引用しない。Grok の GSI 主張は §0.2 Q1 で独立に再検証した |

### 1.3 明示的な非主張

- CI が緑であることは、物理 RF・カメラ・iPhone 実機の動作を意味しない。
- 本レポートは修正提案・機能バックログを含まない。欠落は `GAP` として記録するのみ。
- 秘密情報は記載しない（`security.yml` のシークレット検査ジョブ名のみ言及）。

---

## 2. Inventory（`git ls-files` 由来。README 由来ではない）

201 ファイル。ディレクトリ別内訳は §0.1 のヒストグラムを参照。実行コードの実体は以下。

| 領域 | 主なパス | 役割（コード実体から） |
|---|---|---|
| 暗号コア | `crypto/core.js` (841L), `crypto/group.js` (217L), `crypto/key-backup.js` (327L) | Ed25519 署名 + X25519 箱、群 Sender Key、パスワード鍵バックアップ |
| 永続化 | `crypto/store.js` (1356L) | IndexedDB `lifelineMeshV2` `DB_VERSION = 5`、`eventLog` 追記型 |
| 搬送（ライブラリ） | `crypto/transport.js` (720L) | `QRTransport` / `ClipboardTransport` / `FileTransport` / `TransportManager` |
| 搬送（境界層） | `transport/` 8 files | `TransportLink` 抽象、`BleBrowserCentralLink`、`NodeGattPeripheralLink`、`NativePeripheralContractLink`、`RouteAdvScheduler`、retry policy |
| BLE | `bluetooth/ble-manager.js` (1036L), `mesh-router.js` (600L), `gatt-server.js` (624L), `backends/node-bleno.js` (278L) | central 側 / ルーティング / peripheral サーバ抽象 / bleno 実装 |
| Node 中継機 | `node-server/` 6 files | `@abandonware/bleno` 依存、`os: ["linux"]` |
| ゲートウェイ | `gateway/` 4 files | island backhaul、event store |
| アプリ | `app/src/` 17 files（`main.js` 2542L 含む）, `app/index.html` (396L) | ブラウザ UI 一式 |
| 仕様 | `spec/` 7 files | `PROTOCOL.md`, `PROTOCOL_VNEXT.md`, `THREAT_MODEL.md`, `STATE_MODEL.md`, conformance vectors |
| テスト | `tests/` 28 files（e2e 6 / integration 22） | §0.4 |
| ドキュメント | `docs/` 44 files | §3 で claim として扱う |

観測事実（inventory レベル）:

- **`docs` が 44 ファイルで最大ディレクトリ**であり、`crypto`(12) + `bluetooth`(6) + `transport`(8) の合計 26 を上回る。
- 施設・避難所を表す**データ構造を持つファイルは存在しない**（§0.2 Q6 = 3 hits、すべて UI 文言と解説文）。
- 中継機 `node-server/` は `os: ["linux"]` に固定されている（§0.6）。

---

## 3. Claim harvest（claim source からの引用。事実ではない）

各項目は 引用 + パス + 見出し。

### C1 — `README.md` / 見出し `# Lifeline Mesh 🌐`

> "Lifeline Mesh is a browser-based, cryptographically secure messaging system designed for emergency situations where traditional infrastructure may be degraded or unavailable."
> — `README.md:11`

### C2 — `README.md` / 見出し `### Implemented ✅`

> "- Transport layer: Clipboard, QR, File, BLE (via TransportManager abstraction)"
> — `README.md:402`

> "- **Multi-link BLE runtime**: concurrent links via `Map<peerId, BLEManager>`, egress relay loop, route-adv broadcast"
> — `README.md:403`

### C3 — `README.md` / 見出し `### Known Limitations`

> "⚠️ **Browser/mobile peripheral mode gap**: v0.1.x officially supports only Node relay appliance peripheral mode (`bluetooth/backends/node-bleno.js`); mobile/browser peripheral remains unresolved (operational bypass, not closure)"
> — `README.md:272`

### C4 — `README.md` / 見出し `### Not Yet Implemented ⚠️`

> "- **Browser/mobile peripheral backend gap (not closed)**: Node relay appliance is the only officially supported peripheral endpoint in v0.1.x."
> — `README.md:417`

### C5 — `PROJECT_CHARTER.md` / 見出し `# Project Charter: lifeline-mesh`

> "We build for emergency usefulness."
> — `PROJECT_CHARTER.md:2`

Charter の Scope は 3 行（`PROJECT_CHARTER.md:5-7`）のみで、避難所・施設・自治体・QR 掲示のいずれにも言及がない。

### C6 — `docs/PHASE_PROGRESS.md` / 見出し `# Phase Progress Report`

> "- Completion: 20/20 (100%)"
> — `docs/PHASE_PROGRESS.md:4`

**process claim。** 同ファイル末尾には次の但し書きがある。

> "- Browser/mobile peripheral adapters are still pending (Web Bluetooth central/client limitation remains)."
> — `docs/PHASE_PROGRESS.md:50`

### C7 — `docs/RELEASE_READINESS_REPORT.md` / 見出し `# Release Readiness Report (Phase 20)`

> "- Decision: **GO (Phase 20 complete)**"
> — `docs/RELEASE_READINESS_REPORT.md:5`

同ファイルは自らゲートの意味を限定している。

> "| E2E (smoke) | `npm run test:e2e:smoke` | ✅ Pass | File-presence check: config + spec + required controls present |"
> — `docs/RELEASE_READINESS_REPORT.md:16`

> "was reported as \"Pass (fallback)\" because the runner fell back silently to smoke when Playwright was unavailable. This was a dishonest gate."
> — `docs/RELEASE_READINESS_REPORT.md:22-23`

### C8 — `docs/IMPLEMENTATION_SERIES_STATUS.md` / 見出し `## Unresolved risks`

> "- Energy metrics remain simulator-derived and should not be represented as hardware battery telemetry."
> — `docs/IMPLEMENTATION_SERIES_STATUS.md:43`

> "- Hardware smoke evidence remains manual-only; CI still cannot attest physical RF/device behavior."
> — `docs/IMPLEMENTATION_SERIES_STATUS.md:45`

### C9 — `docs/REPO_TRUTH_AUDIT.md` / 見出し `## Stale claims found`

> "1. **Hard-coded test totals were contradictory/stale** across docs (`217/217` and `227/227`)."
> — `docs/REPO_TRUTH_AUDIT.md:6`

このリポジトリは過去に「ドキュメントの主張がツリーと乖離していた」ことを自ら記録している。

### C10 — `docs/HARDWARE_SMOKE_PATH.md` / 見出し `## Evidence capture contract (manual-only)`

> "Hardware smoke remains intentionally **manual / non-CI**."
> — `docs/HARDWARE_SMOKE_PATH.md:30`

### C11 — `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md` / 見出し冒頭

> "> Scope: Manual verification only. This document does **not** claim automated or hardware CI validation."
> — `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:7`

### C12 — `spec/THREAT_MODEL.md` / 見出し `### Out of Scope`

> "- **Device compromise**: Attacker has full access to user's device/keys"
> — `spec/THREAT_MODEL.md:33`

> "- **Denial of service**: Flooding, resource exhaustion"
> — `spec/THREAT_MODEL.md:36`

### C13 — `spec/THREAT_MODEL.md` / 見出し `## Emergency Context Considerations`

> "- **Device loss common**: Key backup/recovery out of scope (users warned)"
> — `spec/THREAT_MODEL.md:186`

---

## 4. Runtime truth table

値は `present` / `stub` / `absent`。根拠は §0 の receipt に限る。

| # | 機能 | 値 | 根拠パス（Phase 0 receipt） | 備考 |
|---|---|---|---|---|
| 1 | keygen | **present** | `crypto/core.js:345` `generateSignKeyPair`, `crypto/core.js:354` `generateBoxKeyPair` | 署名鍵と箱鍵は別ペア（`spec/PROTOCOL.md:13`） |
| 2 | key backup | **present** | `crypto/key-backup.js:132` `encryptKeys`, `:179` `decryptKeys`, `:39` `isArgon2Available` | パスワード保護。`app/src/main.js:7` で import |
| 3 | encrypt / decrypt | **present** | `crypto/core.js:380` `encryptMessage`, `:466` `decryptMessage` | Ed25519 + X25519-XSalsa20-Poly1305 |
| 4 | recipient binding | **present** | `crypto/core.js:321` `buildSignBytes` が `recipientBoxPK` を署名対象バイト列に連結 | 受信者すり替えは署名検証で落ちる |
| 5 | QR generate | **present（公開 ID のみ）** | `app/src/main.js:2266-2282`、`app/index.html:377` | エンコード対象は `buildMySignedIdentityPayload()` の戻り値のみ。本文・宛先・施設情報は含まない |
| 6 | QR scan | **present（2 経路）** | `app/src/main.js:2320` `scanQRCode`(連絡先), `:2328` `scanMessageQRCode`(暗号文), `crypto/transport.js:214` `processScanned` | `Html5Qrcode` 使用。`dmesh-id` / `dmesh-msg` / `dmesh-group-msg` / `dmesh-chunk` を判別 |
| 7 | clipboard | **present** | `crypto/transport.js:321` `ClipboardTransport`、`tests/e2e/transport-receive-ci-fast.spec.js:27-33` | CI で実ブラウザ検証あり |
| 8 | file | **present** | `crypto/transport.js:417` `FileTransport`、`tests/e2e/transport-receive-ci-fast.spec.js:35-43` | 同上 |
| 9 | BLE central | **present（コードとして）** | `bluetooth/ble-manager.js:129` `navigator.bluetooth.requestDevice`, `:181` `scan()`, `:213` `connect()` | 実機 RF 実行の receipt はツリー内に無い → §5, §8 参照 |
| 10 | Node peripheral | **present（Linux 限定）** | `bluetooth/gatt-server.js`, `bluetooth/backends/node-bleno.js:11` `import bleno from "@abandonware/bleno"`, `node-server/package.json` `os: ["linux"]` | v0.1.x で唯一サポートされる peripheral 実体 |
| 11 | native/mobile peripheral | **stub** | `transport/native-peripheral-contract.js:19` `Promise.reject(...contract-only in v0.1.x)`, `:49` `shipped: false`, `:50` `contractOnly: true` | 呼ぶと必ず reject する |
| 12 | mesh forward | **present** | `bluetooth/mesh-router.js`（1-hop 既定、Phase 2 で N-hop opt-in）、`bluetooth/ble-manager.js:654` `_maybeForward` | egress fanout は呼び出し側責務（`spec/PROTOCOL.md` 末尾） |
| 13 | group sender keys | **present** | `crypto/group.js:5` `DMESH_GROUP_V1`, `:147` `encryptGroupMessage`, `:179` `decryptGroupMessage`, `:143` `ratchetChainKey` | |
| 14 | emergency templates | **present（クライアント側テキストのみ）** | `app/src/main.js:1152` `getEmergencyTemplateText`, `:1223` `applyEmergencyTemplate`, `app/src/i18n.js:155-159`（en）/`:309-313`（ja） | 5 種: safety / supplies / evacuation / medical / shelter。単なる文字列穴埋めで、構造化フィールドも送信スキーマも持たない |
| 15 | PWA / share-target | **present** | `app/public/manifest.json:64-73` `share_target`(POST, `files`), `app/src/share-target-intake.js`, `app/public/service-worker.js` | `tests/e2e/main-ci-critical-path.spec.js:93-188` で実ブラウザ検証 |
| 16 | GSI / 施設共通 ID | **absent** | §0.2 Q1 = **0 hits**、Q6 = 3 hits（全て UI 文言/解説文） | `facilityId` / `shelterId` という識別子はツリーに存在しない |
| 17 | 発行者（issuer）としての組織 ID | **absent** | `crypto/core.js:605` `createPublicIdentity({ name, signPK, boxPK })` | ID は `name` + 2 公開鍵 + fingerprint のみ。組織・施設・役割の欄が無い |
| 18 | 公開署名付き告知（誰でも読める通知） | **absent** | `crypto/core.js:380` `encryptMessage` は `recipientBoxPK` を必須引数として取る | 署名のみ・平文本文というメッセージ種別は存在しない。署名付き公開データは `dmesh-id`(§`crypto/core.js:651`)だけで、それは本文を運ばない |

### 4.1 表の外で確認した重要な否定事実

- **平文の公開告知パスは存在しない。** `crypto/core.js:380` の `encryptMessage` は `recipientBoxPK` を
  必須で受け取り、`crypto/core.js:321` の署名対象に含める。受信者鍵なしで署名だけ付けて配る
  メッセージ種別は `crypto/core.js` の export 一覧（§0.3）に無い。
- **QR は本文を運ぶ設計だが、アプリの「表示」側は ID しか出さない。** `crypto/transport.js:151`
  `QRTransport.send()` は任意の dmesh メッセージをチャンク化できるが、`app/src/main.js` で
  QR を **生成**する関数は `showQRCode`（`:2265`）1 つだけで、対象は自分の公開 ID に固定されている。
  暗号文 QR は **読む側**（`scanMessageQRCode`, `:2328`）のみアプリ UI に存在する。`GAP`

---

## 5. Test truth table

### 5.1 `test` を含む npm script（`package.json`、§0.3 receipt）

| script | 実体 | 実際に何が動くか |
|---|---|---|
| `test` | `test:unit && test:integration` | Node プロセス内のみ。ブラウザなし |
| `test:unit` | `test:crypto && test:vectors` | `npm --prefix crypto test` + `tools/validate-test-vectors.js` |
| `test:crypto` | `npm --prefix crypto test` | `crypto/test.js` |
| `test:vectors` | `npm --prefix tools run validate-vectors` | `tools/test-vectors.json` に対する決定的ベクタ照合 |
| `test:integration` | 22 個の `node tests/integration/*.js` を `&&` 連結（`package.json:35`） | すべて Node 単一プロセス。BLE は `MockGATTBackend` / mock I/O |
| `test:relay-appliance` | `node-server-relay.test.js` + `node-server-relay-ops.test.js` | Node 内。実 BLE 無し |
| `test:phase5` | `phase5-simulator-fuzz.test.js` + `tools/phase5-energy-metrics.js` | 決定的シミュレータ。C8 の通り実測ではない |
| **`test:e2e`** | `node tests/e2e/smoke-check.js` | **ブラウザを起動しない。** `test:e2e:smoke` と同一実体 |
| **`test:e2e:smoke`** | `node tests/e2e/smoke-check.js` (20L) | `fs.existsSync` 3 件 + `main-flow.spec.js` に対する `String.includes` 4 件のみ（`tests/e2e/smoke-check.js:3-18`）。**ファイル存在確認であって、テスト実行ではない** |
| **`test:e2e:playwright`** | `node tests/e2e/run-playwright.js` | 実 Chromium。未インストールなら **fallback せず exit 1**（`tests/e2e/run-playwright.js:28`） |
| `test:e2e:playwright:main-ci` | `run-playwright.js tests/e2e/main-ci-critical-path.spec.js` | CI 必須ゲート |
| `test:e2e:playwright:extra-ci` | `run-playwright.js tests/e2e/transport-receive-ci-fast.spec.js` | CI 必須ゲート |
| `test:e2e:install` | `npx playwright install --with-deps chromium` | ブラウザ取得のみ |
| `test:e2e:real-browser` | `test:e2e:install && test:e2e:playwright` | 全 spec を実ブラウザで |

**`test:e2e:smoke` と `test:e2e:playwright` の差は決定的である。**
前者はファイルの有無と文字列の一致しか見ない。後者だけが実際にブラウザを起動する。
`validate:local`（= `validate`）は `gate:e2e:smoke` を使う（`package.json:19`）ため、
**ローカルの `npm run validate` はブラウザを一度も起動しない**。
`validate:ci` のみが `gate:e2e:ci-critical` / `gate:e2e:ci-extra-browser` を通す（`package.json:20`）。

### 5.2 `tests/` 配下 全 28 ファイルの実行内容

§0.4 の表を参照。性質別の要約:

| 性質 | 該当 | 判定 |
|---|---|---|
| ブラウザを起動しない | `tests/e2e/smoke-check.js`, `tests/integration/*`(22) | Node ループバック / mock |
| 単一 `page` 内ループバック | `tests/e2e/main-ci-critical-path.spec.js`, `tests/e2e/transport-receive-ci-fast.spec.js` | **loopback**。`main-ci-critical-path.spec.js:12-15` で **自分の ID を自分の連絡先として登録**し、自分宛に暗号化して自分で復号している |
| ページ内に mock link を注入 | `tests/e2e/multi-link.spec.js`（`MockLink("peer-alice")` / `MockLink("peer-bob")`, 224-225 行） | **loopback**。RF も第 2 デバイスも介在しない |
| 2 ブラウザコンテキスト | `tests/e2e/main-flow.spec.js:180`（`{ browser }`）, `:449`（multi-device group onboarding） | 同一ホスト上の 2 コンテキスト。ペイロードはテストコードが手渡しする。無線区間は無い |
| BLE を名乗るが mock | `tests/e2e/main-flow.spec.js:277` `pseudo-e2e BLE: mock BLEManager I/O boundary` | ファイル自身が `pseudo-e2e` と `mock` を名乗っている |
| 実 BLE ハードウェア | **CI 内に無し** | `.github/workflows/real-bleno-smoke.yml` のみが実機を触るが `workflow_dispatch` 限定 + `self-hosted, linux, bluetooth` ランナー必須。定期実行なし |

### 5.3 CI が実際に保証している範囲（`.github/workflows/`、§0.5）

- `ci.yml` の必須ゲート: lint / typecheck / unit / integration / compat + **Playwright 2 spec のみ**
  （`main-ci-critical-path.spec.js` と `transport-receive-ci-fast.spec.js`）。
  この 2 spec はいずれも §5.2 の通り **単一 page ループバック**。
- `e2e-real-browser.yml` は全 spec を回すが、`schedule` + `push(main)` であり PR ゲートではない。
- `real-bleno-smoke.yml` は **手動起動限定**。`self-hosted` + `bluetooth` ラベル付きランナーが
  存在しなければ実行され得ない。ツリー内にその実行結果 artifact は無い（§0.6 `git ls-files artifacts` = 0）。
- したがって **CI の緑は、暗号ロジック・アプリ配線・単一ブラウザ内 UI 経路までを保証し、
  無線区間・複数実機・カメラ・iPhone については何も保証しない。**

---
## 6. Intent map

オペレータ再構成（2026-08-28）の各節を、§4 / §5 の receipt に突き合わせる。
**partial は partial のまま据え置く。present に繰り上げない。**

| # | 意図の節 | 判定 | 根拠 |
|---|---|---|---|
| I1 | 避難所または企業支店が Mesh 鍵ペアを生成する | **partial** | 鍵生成は `crypto/core.js:345,354` に present。しかし生成されるのは**個人端末の鍵**であり、「施設」「支店」という主体はツリー上に存在しない（§4 #16,#17）。組織を表す構造は `createPublicIdentity({ name, signPK, boxPK })` の `name` 文字列のみ |
| I2 | 壁掲示 QR は公開 ID のみを載せる | **present** | `app/src/main.js:2266-2282`。QR にエンコードされるのは `buildMySignedIdentityPayload()` のみ。本文も宛先も含まない（§4 #5）。**意図と実装が一致している唯一の強い一致点** |
| I3 | 避難者がスキャンして「公式の宛先」を得る | **present** | `app/src/main.js:2320` `scanQRCode` → `addContact()`。スキャン結果が送信先候補（連絡先）になる（§4 #6） |
| I4 | 同じスキャンで「発行者（issuer）」が分かる | **absent** | ID の中身は `name` + 2 鍵 + fingerprint（`crypto/core.js:605`）。発行者・所属・権限を表すフィールドが無い。`name` は自己申告の自由文字列で、上位の署名者による裏書きも無い。TOFU（`spec/THREAT_MODEL.md:185`）が唯一の信頼基盤 |
| I5 | 公開告知が署名され、誰でも読める | **absent** | `crypto/core.js:380` `encryptMessage` は `recipientBoxPK` 必須。署名のみ・本文平文という種別が export 一覧（§0.3）に存在しない。読めるのは鍵を持つ受信者だけ（§4.1） |
| I6 | 機微ペイロード（氏名・人数・位置・医療）は避難所の box 鍵へ暗号化 | **partial** | 暗号化と受信者拘束は present（§4 #3,#4）。しかし「避難所の box 鍵」という概念は無く、宛先は個人連絡先である。氏名/人数/位置/医療は**構造化フィールドではなく i18n 文字列テンプレートの穴埋め**にすぎない（`app/src/i18n.js:155-159`, `:309-313`、§4 #14） |
| I7 | 同一エンベロープで被害・人員・機材・資材を「司令塔支店」へ運ぶ | **absent** | 該当する種別・フィールドがツリーに無い。`crypto/core.js:380` の `payloadExtra` は任意 JSON を通すが、被害/人員/機材/資材のスキーマも、それを解釈する UI も存在しない。`gateway/`(4 files) は island backhaul であって組織階層ではない |
| I8 | 避難所鍵と支店司令塔鍵は同一か別か | **absent（区別が存在しない）** | ツリーには「役割つき鍵」という概念が無い。鍵は端末単位の 2 ペアのみ（`crypto/core.js:345,354`）。よって同一/別を論じる土台が実装されていない |
| I9 | 内閣府 / GSI 全国避難所共通 ID を施設ラベルとして使う | **absent** | §0.2 Q1 = **0 hits**。§0.2 Q6 = 3 hits（すべて UI 文言・解説文）。仕様にも型定義にも存在しない。**GSI 束縛は仕様ではなく記憶である**と、このツリーは示している |
| I10 | ダウンリンク告知とアップリンク PII が一つのエンベロープを共有する | **absent** | I5 の通りダウンリンク告知そのものが無いため、共有以前に片側が存在しない |
| I11 | iPhone が主デバイス、Safari に Web Bluetooth が無いため BLE は「意図されているが塞がれている」 | **present（ツリーもそう記録している）** | `docs/BLE_SUPPORT_MATRIX.md:10` "Safari (macOS/iOS) \| ❌ \| ❌ Unsupported"、`docs/WEB_BLUETOOTH_SUPPORT.md:27`、`app/index.html:285`。ツリーは iOS を放棄ではなく非対応として明記している |
| I12 | peripheral 経路は Node relay appliance であって iOS / ブラウザではない | **present** | `README.md:272`, `docs/RELAY_DRILL_AB_C.md:13`, `transport/native-peripheral-contract.js:49-50`, `node-server/package.json` `os: ["linux"]` |
| I13 | ハードウェアスモークは手動・非 CI。`sample-*` は fixture | **present（fixture であることを確認）** | `docs/HARDWARE_SMOKE_PATH.md:30`, `sample-normalized.json` の `"site": "staging-lab"`, `"ciBacked": false`, `"notes": "Single packet loss during RF interference simulation"`。参照先 `artifacts/**` は git 管理外（§0.6） |

### 6.1 意図マップの要約（数値のみ）

- present: I2, I3, I11, I12, I13 → **5 / 13**（うち I11–I13 は「制約の記述が正しい」ことの確認であり、機能の存在ではない）
- partial: I1, I6 → **2 / 13**
- absent: I4, I5, I7, I8, I9, I10 → **6 / 13**

**避難所コンセプトの中核（発行者の証明・公開告知・役割つき鍵・組織階層・施設 ID）は 1 つも実装されていない。**
実装されているのは「個人間 E2E 暗号メッセンジャ + 公開 ID の QR 交換」である。

---

## 7. Viability（concept と tree を分離）

### 7.A コンセプト（オペレータ再構成そのものの成立性）

#### 7.A.1 成立条件

1. 掲示 QR の公開鍵が本物であること。すなわち QR を貼る主体が物理的に信頼できる場所を占有していること（掲示物の物理的正統性が暗号の信頼根になる）。
2. 発行者を名乗る主体に、上位の裏書き（自治体・本社）が存在するか、あるいは避難者が「その場所に掲示されている」ことを信頼の代替とすること。
3. 公開告知（誰でも読む）と機微アップリンク（避難所だけが読む）が、**別々の鍵運用**を持つこと。前者は署名のみ、後者は暗号化。
4. 避難所側に、受け取った暗号文を復号し集計できる端末と担当者が常時いること。
5. 施設 ID が「ラベル」に留まり、鍵として使われないこと（オペレータの前提通り）。

#### 7.A.2 失敗条件

1. 掲示 QR が差し替えられる。物理的な貼り替えは暗号で防げず、TOFU は最初のスキャンを信じるため、偽 QR が先に貼られれば負ける。
2. 避難所の秘密鍵が入った端末が失われる/水没する。復旧手段が概念上定義されていなければ、その避難所宛の全ペイロードが読めなくなる。
3. 公開告知を暗号化してしまうと、鍵を持たない避難者に届かない。逆に機微情報を署名のみで流すと全員に漏れる。この 2 経路を 1 つのエンベロープに統合しようとすると必ずどちらかが壊れる。
4. 司令塔支店を単一の宛先にすると、そこが被災したときに系全体が止まる。
5. 施設 ID を鍵や認可に格上げすると、公開情報である ID がなりすましの入口になる。

#### 7.A.3 災害時に不可欠な条件（あれば良い、ではなく無いと成立しない）

1. **電源**。スマートフォンの充電が尽きた時点で全経路が消える。
2. **鍵の事前配布または現地生成の運用手順**。発災後に初めて鍵を作るなら、その瞬間に誰も相手を検証できない。
3. **紙の代替経路**。読み取り機材が使えない場合に、同じ情報が人手で運べること。
4. **復号担当者の交代手順**。24 時間体制を 1 人の端末に依存させない。
5. **誤情報が流れたときの取り消し手段**。署名は真正性を保証するが、内容の誤りは取り消せない。

### 7.B 現在のツリー（`096cdcc`）

#### 7.B.1 動作する条件

1. 双方が Chromium 系ブラウザで、secure context（`https://` または `http://localhost`）でアプリを開いている（`README.md:271`）。
2. 双方が事前に `Generate / Load Keys` を押して鍵を持っている（`docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:17`）。
3. 相手の公開 ID を QR / Clipboard / File のいずれかで取り込み済みである（§4 #5–#8）。
4. 経路が Clipboard / File / QR のいずれかである場合、**人間が物理的に運べば動く**。これらは CI で実ブラウザ検証済み（`tests/e2e/transport-receive-ci-fast.spec.js`）。
5. BLE を使う場合、peripheral 側が **Linux + BlueZ + `@abandonware/bleno` の Node 機材**であること（`node-server/package.json` `os: ["linux"]`）。
6. 群配信は同一 Sender Key を配布済みのメンバー間でのみ成立（`crypto/group.js:147,179`）。

#### 7.B.2 失敗する条件

1. **主デバイスが iPhone**。Safari に Web Bluetooth が無く（`docs/BLE_SUPPORT_MATRIX.md:10`）、BLE 経路は起動しない。残るのは Clipboard / File / QR / share-target。
2. **ブラウザ同士を BLE で直結しようとする**。どちらも central にしかなれず peripheral 側が居ない（`bluetooth/gatt-server.js:5`, `spec/PROTOCOL.md:662`）。Node 機材が要る。
3. **native/mobile peripheral を呼ぶ**。`transport/native-peripheral-contract.js:19` が必ず reject する。
4. **`file://` で `app/index.html` を直接開く**。ES module CORS で失敗（`README.md:273`, `docs/FAQ.md:268`）。ビルド済み `app/dist/index.html` が必要。
5. **端末を失う**。`spec/THREAT_MODEL.md:186` が鍵復旧を明示的に scope 外としている。
6. **DoS / 電波妨害**。`spec/THREAT_MODEL.md:36` が明示的に scope 外。
7. **公開告知を流したい**。§4.1 の通り、そのメッセージ種別が存在しない。
8. **複数クライアントが 1 台の中継機に同時接続する**。`docs/RELAY_DRILL_AB_C.md:12` が「意図的に同時 1 クライアント」と明記。

#### 7.B.3 災害時に不可欠だが、ツリーに無いもの（`GAP` として列挙。修正提案ではない）

1. **`GAP`: 実機無線区間の証拠**。CI が触る BLE はすべて mock（§5.2）。物理 RF を通した記録はツリーに存在せず、参照される `artifacts/**` も git 管理外（§0.6）。
2. **`GAP`: 電源・稼働時間の実測**。エネルギー指標はシミュレータ由来であるとリポジトリ自身が宣言している（`docs/IMPLEMENTATION_SERIES_STATUS.md:43`）。
3. **`GAP`: iPhone 実機での経路検証**。CI は Chromium のみ（`.github/workflows/e2e-real-browser.yml`）。iOS Safari を回す job は存在しない。
4. **`GAP`: 鍵の紛失・端末喪失からの復旧**。scope 外と明記（`spec/THREAT_MODEL.md:186`）。`crypto/key-backup.js` はパスワード backup を提供するが、そのパスワードを災害時にどう保つかは仕様外。
5. **`GAP`: 発行者の裏書き**。TOFU 以外の信頼確立手段が無い（`spec/THREAT_MODEL.md:185`）。掲示 QR の差し替えに対する防御はツリーに無い。
6. **`GAP`: 施設・避難所を表すデータ構造**。§0.2 Q1=0 / Q6=3（UI 文言のみ）。
7. **`GAP`: カメラ実機でのスキャン検証**。`Html5Qrcode` を実カメラで回すテストは `tests/` に無い（§0.4）。

---

## 8. Contradictions

### X1 — 「20/20 完了」対 「主要 peripheral 経路は未実装」 → 解消済みだが要注意

- claim: `docs/PHASE_PROGRESS.md:4` "- Completion: 20/20 (100%)"
- receipt/claim（同ファイル）: `docs/PHASE_PROGRESS.md:50` "- Browser/mobile peripheral adapters are still pending"

同一ファイル内で完了率と未完了項目が併記されている。**矛盾ではないが、"20/20" 単体を引用すると誤読される。**
process claim として扱う（§1.2）。

### X2 — 「Transport layer: … BLE」 対 peripheral 不在 → **UNRESOLVED**

- claim: `README.md:402` "- Transport layer: Clipboard, QR, File, BLE (via TransportManager abstraction)"
- receipt: `crypto/transport.js` の export（§0.3）は `QRTransport` / `ClipboardTransport` / `FileTransport` / `TransportManager` のみ。**`BLETransport` クラスは `crypto/transport.js` に存在しない。** BLE は `bluetooth/ble-manager.js` の別系統であり、TransportManager 抽象の下にはいない。

README の一文は 4 経路が同一抽象下にあるかのように読めるが、コードでは 3 + 1 である。`UNRESOLVED`。

### X3 — BLE 手動ランブックの「2 devices」 対 「ブラウザ peripheral 非出荷」 → **UNRESOLVED**

- claim A: `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md:24` "| BLE-01 | Scan + connect | 2 | `Connected via Bluetooth` status appears on initiating device. |"
- claim B（同ファイル 9 行目）: "Browser/mobile peripheral mode is not shipped."
- receipt: `bluetooth/gatt-server.js:5` "The Web Bluetooth API does not expose peripheral mode in browsers"

ランブックの前提（`:16` "At least 2 devices (3 devices recommended for relay/runtime observability checks)."、`:17` "On each device: open app, click **Generate / Load Keys** once."）は**両方がアプリを開いたブラウザ**と読める。
しかしブラウザ同士は central 同士であり接続できない。BLE-01/BLE-02 の "2 devices" の片方が
Node 中継機であるとはランブック本文に書かれていない。手順として実行不能か、あるいは記述が不完全である。`UNRESOLVED`。

### X4 — 「GO / Phase 20 complete」 対 「その時点で実ブラウザ E2E 未実行」 → 文書自身が解消

- claim: `docs/RELEASE_READINESS_REPORT.md:5` "- Decision: **GO (Phase 20 complete)**"
- 同文書 `:17` "| E2E (Playwright) | `npm run test:e2e:playwright` | ⚠️ Not run at Phase 20 |"
- 同文書 `:22-23` "This was a dishonest gate."

リリース判定は、実ブラウザ E2E を一度も通さずに GO が出されている。文書はそれを事後に自己申告している。
**矛盾は解消済みだが、"GO" を現在の品質保証と読むことはできない。**

### X5 — `sample-normalized.json` の "pass" 対 fixture である事実 → **fixture 確定**

- claim 的外観: `sample-normalized.json` の `"status": "pass"`, `"deliveryRatio": 0.95`
- receipt: 同ファイル `"site": "staging-lab"`, `"manualRun": true`, `"ciBacked": false`,
  `"notes": "Single packet loss during RF interference simulation"`
- receipt: 参照される `artifacts/manual-smoke/*.log` は `git ls-files artifacts` = 0（§0.6）

「95% 到達」は**シミュレーション由来の見本レコード**であり、実測の合格記録ではない。
`docs/HARDWARE_SMOKE_PATH.md:30` の "manual / non-CI" と整合する。fixture として確定。

### X6 — `test:e2e` の名前 対 実体 → **命名上の罠**

- receipt: `package.json:37` `"test:e2e": "node tests/e2e/smoke-check.js"`
- receipt: `tests/e2e/smoke-check.js:3-18` は `fs.existsSync` と `String.includes` のみ

`npm run test:e2e` は E2E を一切実行しない。`CONTRIBUTING.md:147` と
`docs/PHASE_A_TO_E_EXECUTION_JA.md:37` はこの `test:e2e` を案内している（§0.2 Q5）。
`README.md:172` は "Smoke check (file-presence; no browser required)" と正しく注記している。
**同一リポジトリ内で、同じコマンドの説明が場所により正確さを変える。**

### X7 — 「Multi-link BLE runtime」 対 テストの実体 → **UNRESOLVED**

- claim: `README.md:403` "- **Multi-link BLE runtime**: concurrent links via `Map<peerId, BLEManager>`, egress relay loop, route-adv broadcast"
- receipt: これを検証する `tests/e2e/multi-link.spec.js` は `new MockLink("peer-alice")` /
  `new MockLink("peer-bob")`（`:224-225`）をページ内 JS に注入している。

マルチリンクの**調停ロジック**は検証されている。**同時に張られた 2 本の実 BLE リンク**は検証されていない。
claim の "concurrent links" が論理的な同時性か物理的な同時性かをツリーは決められない。`UNRESOLVED`。

### X8 — 意図（施設・発行者・GSI）対 ツリー → **矛盾ではなく不在**

- 意図側: I1, I4, I7, I8, I9（§6）
- receipt: §0.2 Q1 = 0 hits、Q6 = 3 hits（UI 文言のみ）、`crypto/core.js:605` の ID は `name`+2 鍵のみ

ドキュメントがこれらを主張しているわけではない。**README も spec も、避難所 ID や発行者裏書きを一度も約束していない。**
したがってこれは「ドキュメントの嘘」ではなく「意図が一度もコードにも仕様にも降りていない」状態である。
オペレータの争点「GSI 束縛は仕様だったか記憶だったか」に対する本ツリーの答えは、**記憶**である。

---

## 9. Residue / unknowns（ツリーが答えられない問い）

1. **掲示 QR が差し替えられたとき、避難者は気づけるか。** TOFU（`spec/THREAT_MODEL.md:185`）以外の
   検証手段がツリーに無い。物理掲示の正統性は暗号の外側にあり、コードからは判定不能。
2. **実際の避難所で、誰が復号担当端末を持つのか。** 役割つき鍵が無い（§6 I8）ため、
   運用設計をツリーから読み取れない。
3. **BLE 経路は現実の避難所で何メートル届くのか。** 実機記録が存在しない（§7.B.3 `GAP` 1）。
4. **iPhone だけを持つ避難者が、Clipboard / File / QR 経路で何分かけて 1 通送れるのか。**
   iOS 実機テストがツリーに無い（§7.B.3 `GAP` 3）。
5. **`payloadExtra`（`crypto/core.js:380`）に被害・人員・資材を入れる設計は過去に存在したか。**
   フィールドは通るが、スキーマ・UI・テストのいずれもツリーに無い。履歴 20 件（§0.1）にも該当コミットは見えない。
6. **`real-bleno-smoke.yml` は一度でも実行されたか。** `workflow_dispatch` 限定であり、
   実行結果 artifact は git 管理外（§0.6）。ツリーからは判定不能。
7. **`node-server` 機材（Linux + BlueZ）を避難所に置く前提は誰の決定か。**
   `docs/ADR_BLE_PERIPHERAL_PATH.md` が存在するが本 run の must-read には含まれず、receipt 未取得。
   本レポートの射程外。
8. **公開告知（署名のみ・平文）を意図的に外したのか、単に未実装なのか。**
   `spec/THREAT_MODEL.md` の Assets（`:11-15`）は 5 項目すべてが機密性・真正性寄りで、
   「公開可読性」を資産として挙げていない。設計判断の痕跡はあるが、明示的な却下記録は見つからない。

---

## 10. Operator summary（10 行以内）

1. HEAD `096cdcc` は `origin/main` と同一。201 ファイル。Phase 0 の receipt は §0 にすべてある。
2. 実装されているのは **個人間 E2E 暗号メッセンジャ**であり、避難所システムではない。
3. 意図 13 節のうち present 5・partial 2・**absent 6**。中核（発行者証明・公開告知・役割鍵・組織階層・施設 ID）は全て absent。
4. **GSI / 避難所共通 ID は 0 hits。** 仕様でも実装でもなく、記憶である。争点はこれで閉じる。
5. **壁 QR = 公開 ID のみ**は意図と実装が一致する唯一の強い一致点（`app/src/main.js:2266-2282`）。
6. **公開告知は原理的に出せない。** `encryptMessage` が `recipientBoxPK` 必須で、署名のみの平文種別が存在しない。
7. iPhone 主デバイスでは BLE は動かない（Safari 非対応）。残るのは Clipboard / File / QR / share-target で、これらは CI 検証済み。
8. **CI の緑は無線・カメラ・iPhone を一切保証しない。** 必須ゲートの Playwright 2 spec は単一 page ループバック。
9. `sample-normalized.json` は `staging-lab` / `ciBacked: false` の fixture。参照 artifact は git 管理外。
10. 次に効くのは機能追加ではなく、§7.B.3 の 7 つの `GAP` のうち「実機無線」「iPhone 実機」「掲示 QR の差し替え耐性」の 3 点に対する事実確認である。

---

## 11. Files read（§0 の receipt と一致）

### 11.1 Must-read 25 件（§0.3、全て present、MISSING 0 件）

`README.md` / `PROJECT_CHARTER.md` / `package.json` / `crypto/core.js` / `crypto/group.js` /
`crypto/transport.js` / `crypto/store.js` / `spec/PROTOCOL.md` / `spec/THREAT_MODEL.md` /
`app/src/main.js` / `app/src/i18n.js` / `app/index.html` / `bluetooth/ble-manager.js` /
`bluetooth/mesh-router.js` / `bluetooth/gatt-server.js` / `docs/HARDWARE_SMOKE_PATH.md` /
`docs/RELAY_DRILL_AB_C.md` / `docs/BLE_MANUAL_VALIDATION_RUNBOOK.md` /
`docs/RELEASE_READINESS_REPORT.md` / `docs/PHASE_PROGRESS.md` /
`docs/IMPLEMENTATION_SERIES_STATUS.md` / `docs/REPO_TRUTH_AUDIT.md` / `docs/FAQ.md` /
`docs/evidence/hardware-smoke/sample-normalized.json` / `tests/e2e/main-ci-critical-path.spec.js`

### 11.2 補助 receipt 5 件（§0.3 末尾、hash-object 取得済み）

`crypto/key-backup.js` / `bluetooth/backends/node-bleno.js` /
`transport/native-peripheral-contract.js` / `transport/ble-browser-central-link.js` /
`transport/node-gatt-peripheral-link.js`

### 11.3 `tests/` 全 28 件（§0.4、全件 hash-object 取得済み）

`tests/e2e/` 6 件 + `tests/integration/` 22 件。個別ハッシュと実行内容は §0.4 の表。

### 11.4 `.github/workflows/` 全 6 件（§0.5、全件 hash-object 取得済み）

`.gitkeep` / `ci.yml` / `e2e-real-browser.yml` / `pages.yml` / `real-bleno-smoke.yml` / `security.yml`

### 11.5 rg のみで参照し hash-object 未取得（引用は行番号付き、§0.2 の hit 出力の範囲内）

`docs/WEB_BLUETOOTH_SUPPORT.md` / `docs/BLE_SUPPORT_MATRIX.md` / `docs/DEEP_DIVE_ANALYSIS_JA.md` /
`docs/PHASE1_UNRESOLVED_AND_SOLUTIONS_JA.md` / `docs/OPERATIONS_RUNBOOK.md` /
`node-server/server.js` / `node-server/package.json` / `app/public/manifest.json` /
`tools/hardware-smoke-record.js` / `tools/validate-test-vectors.js` / `CONTRIBUTING.md` /
`tests/e2e/smoke-check.js` / `tests/e2e/run-playwright.js` / `tests/e2e/main-flow.spec.js` /
`tests/e2e/multi-link.spec.js` / `tests/e2e/transport-receive-ci-fast.spec.js`

（うち `tests/e2e/` の 5 件は §11.3 で hash-object 取得済み。§11.5 は「§0.3 の must-read 表に無い」ものの一覧。）

---

**レポート終端。** 本ファイル以外の変更は無い。`git status --porcelain` は本ファイル 1 行のみを示す。
