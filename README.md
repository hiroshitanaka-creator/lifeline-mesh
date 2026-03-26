# Lifeline Mesh 🌐

**End-to-end encrypted emergency messaging • Offline-first • No server required**

[![Tests](https://img.shields.io/badge/tests-84%2F84%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh is a browser-based, cryptographically secure messaging system designed for emergency situations where traditional infrastructure may be degraded or unavailable.

> **Mission**: When disaster strikes and infrastructure fails, people still need to communicate.
> This project aims to provide that lifeline.

---

## 🆘 We Need Your Help

This project could save lives, but it needs contributors to grow.

**Open Contribution Areas:**

| Priority | Task | Skills | Notes |
|----------|------|--------|-------|
| 🟡 High | **BLE GATT Server (peripheral mode)** | Web Bluetooth API | Client-only today; acting as relay requires GATT server |
| 🟡 High | **Multi-hop mesh routing** | Protocol design, JS | MeshRouter Phase 1 (1-hop) is done; Phase 2 (N-hop) is not |
| 🟡 High | **UI/UX Overhaul** | Design, CSS, Accessibility | Functional but not polished |
| 🟢 Good First | **Documentation i18n** | Any language | Good first issue |
| 🟢 Good First | **Real Playwright E2E** | Testing, browser automation | Smoke spec exists; real browser run needs CI Playwright install |

**Read the full roadmap**: [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Every contribution matters. Let's build this together.

---

## 🚀 Quick Start

### Try the Live Demo
**https://hiroshitanaka-creator.github.io/lifeline-mesh/**

### Use Locally
```bash
git clone https://github.com/hiroshitanaka-creator/lifeline-mesh.git
cd lifeline-mesh
npm ci --prefix app
npm run dev --prefix app   # opens http://localhost:5173
```
Then: Generate keys → Add contacts → Encrypt/Decrypt

> The app uses ES6 modules with relative imports; a dev server (Vite) is required. Directly opening `app/index.html` as a `file://` URL will not work.

---

## ✨ Features

### Security
- 🔐 **Ed25519 signatures** for message authentication
- 🔒 **X25519-XSalsa20-Poly1305** encryption for confidentiality
- 🔑 **Ephemeral encryption keys** (forward secrecy approximation)
- 🎯 **Recipient binding** prevents message redirection
- 🛡️ **Replay protection** with 30-day nonce tracking
- ✅ **TOFU (Trust On First Use)** with key pinning
- 🔗 **Subresource Integrity (SRI)** for CDN scripts

### Key Management
- 🔑 Auto-generate Ed25519 + X25519 key pairs
- 💾 Export keys (Argon2id/PBKDF2 password-protected backup)
- 📥 Import keys (restore from file)
- 🗑️ Reset all data (emergency key rotation)

### Group Messaging
- 👥 Create named groups with member lists
- 🔒 Sender Keys protocol (DMESH_GROUP_V1, domain-separated)
- 🔄 Chain key ratcheting per message (forward secrecy within session)

### BLE Store-and-Forward
- 📡 BLE client: connect to nearby devices and exchange messages
- 📤 Outbox queuing when offline; automatic flush on reconnect
- 📥 Inbox persistence for received messages
- ⚠️ **GATT server (peripheral/relay mode) is not implemented** – BLE acts as client only

### User Experience
- 📱 Offline-first (works without internet)
- 📋 Copy/paste encrypted messages
- 📚 Embedded documentation
- 🌐 No server required
- 🚀 Relay-agnostic (send via any channel: QR, Bluetooth, USB, radio, etc.)

---

## 📖 Documentation

### For Users
- **[Usage Guide](docs/USAGE.md)** - Quick start, security practices, troubleshooting
- **[FAQ](docs/FAQ.md)** - 30+ questions about security, features, and usage
- **[Web Bluetooth Support](docs/WEB_BLUETOOTH_SUPPORT.md)** - Browser/platform compatibility and fallback guidance

### For Developers
- **[Protocol Specification](spec/PROTOCOL.md)** - Detailed technical specification
- **[Threat Model](spec/THREAT_MODEL.md)** - Comprehensive security analysis
- **[Crypto Core API](crypto/README.md)** - Reusable crypto functions

### For Contributors
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Security Policy](SECURITY.md)** - Vulnerability reporting
- **[Project Charter](PROJECT_CHARTER.md)** - Scope and goals

---

## 🔬 Testing

All tests passing: **84/84 ✓**

| Suite | Count | Command |
|---|---|---|
| Crypto core unit | 22 | `npm run test:crypto` |
| Test vectors | 27 | `npm run test:vectors` |
| BLE + transport integration | 18 | `npm run test:integration` (partial) |
| Group messaging integration | 3 | `npm run test:integration` (partial) |
| Mesh router integration | 14 | `npm run test:integration` (partial) |
| **Total** | **84** | `npm run test:unit && npm run test:integration` |

```bash
# Run everything
npm run test:unit && npm run test:integration

# Crypto unit tests only
cd crypto && npm test

# Test vectors only
cd tools && npm run validate-vectors

# Smoke check (file-presence; no browser required)
npm run test:e2e:smoke

# Real Playwright E2E (requires: npm run test:e2e:install first)
npm run test:e2e:playwright
```

---

## 🏗️ Architecture

### Repository Structure
```
/app            Demo UI (Vite build, ES6 modules, PWA)
/bluetooth      BLE manager + MeshRouter (Phase 1: 1-hop relay)
/crypto         Core crypto, group messaging, transport, store
/spec           Threat model + protocol specification
/tools          Test vectors, validator, SRI generator
/docs           Usage guide, FAQ, phase progress
/tests          Integration and E2E test suites
.github/        CI/CD workflows, templates
```

### Crypto Stack
- **Signing**: Ed25519 (nacl.sign)
- **Encryption**: X25519-XSalsa20-Poly1305 (nacl.box)
- **Hashing**: SHA-512 (for fingerprints)
- **Library**: TweetNaCl (audited, compact)

### Message Flow
```
Alice                  Relay Network              Bob
  |                          |                      |
  | 1. Generate ephemeral    |                      |
  | 2. Encrypt (ECDH)        |                      |
  | 3. Sign (Ed25519)        |                      |
  | 4. Send JSON ---------> | Forward ----------> |
  |                          |                 5. Verify
  |                          |                 6. Decrypt
  |                          |                 7. Read
```

---

## 🔒 Security

### Guaranteed Properties
✅ **Confidentiality**: Only recipient can decrypt
✅ **Authenticity**: Sender verified via signature
✅ **Integrity**: Tampering detected
✅ **Recipient binding**: Message tied to specific recipient
✅ **Replay resistance**: 30-day nonce tracking

### Known Limitations
❌ **Anonymity**: Sender/recipient public keys visible to relays
❌ **Traffic analysis resistance**: Message patterns observable
❌ **Post-quantum security**: Vulnerable to quantum computers
❌ **Perfect forward secrecy**: Long-term signing keys used

See [THREAT_MODEL.md](spec/THREAT_MODEL.md) for comprehensive analysis.

---

## 🎯 Use Cases

### Emergency Coordination
- Shelter status updates
- Supply requests/offers
- Safety check-ins
- Evacuation coordination

### Offline Scenarios
- Natural disasters (earthquakes, floods, hurricanes)
- Infrastructure failure (power outages, network collapse)
- Remote/rural areas with limited connectivity
- Politically sensitive communications

### Relay Methods
- **Mesh networks**: WiFi Direct, Bluetooth mesh
- **Sneakernet**: USB sticks, SD cards
- **QR codes**: Display → scan
- **Radio**: LoRa, ham radio (encode JSON as text)
- **Manual**: Print encrypted JSON, hand-deliver

---

## 🚀 Deployment

### GitHub Pages (Current)
Automatically deployed from `master` branch via `.github/workflows/pages.yml`.
The workflow runs `npm ci --prefix app && npm run build --prefix app` and deploys `app/dist/` (Vite build output).

**Live URL**: https://hiroshitanaka-creator.github.io/lifeline-mesh/

### Self-Hosting
1. Run `npm ci --prefix app && npm run build --prefix app`
2. Serve `app/dist/` directory from your web server
3. **Recommended**: Add CSP headers for extra security

### Production Checklist
- [x] SRI added to all CDN scripts
- [x] All tests passing
- [x] Documentation complete
- [ ] Consider self-hosting TweetNaCl (avoid CDN dependency)
- [x] Add Content Security Policy headers
- [ ] Set up monitoring/analytics (optional)

---

## 🛠️ Development

### Run Tests
```bash
# All tests (crypto + vectors)
npm test

# Crypto only
cd crypto && npm test

# Test vectors
cd tools && npm run validate-vectors
```

### Generate Test Vectors
```bash
cd tools
npm run generate-vectors
```

### Update SRI Hashes
```bash
cd tools
npm run generate-sri
# Copy output to app/index.html
```

### Technology Stack
- **Languages**: JavaScript (ES6 modules), TypeScript (types only)
- **Crypto**: TweetNaCl 1.0.3 + tweetnacl-util + argon2 (key backup)
- **Storage**: IndexedDB (browser, via crypto/store.js)
- **Build**: Vite (app/), no build needed for crypto/tools

---

## 🤝 Contributing

We welcome all contributors! Here's how to get started:

### First Time?
1. Read [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) to understand the vision
2. Check [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) for implementation details
3. Look for issues labeled `good first issue`
4. Join the discussion in GitHub Discussions

### Ways to Contribute
- **Code**: BLE GATT server (peripheral), multi-hop mesh, UI polish
- **Security**: Reviews, audits, vulnerability research
- **Design**: UX for emergency scenarios, accessibility
- **Docs**: Translations, tutorials, examples
- **Testing**: Real Playwright E2E, test vectors, edge cases
- **Ideas**: Protocol improvements, use cases, partnerships

### Development Setup
```bash
git clone https://github.com/hiroshitanaka-creator/lifeline-mesh.git
cd lifeline-mesh
npm install
npm test  # Run all tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## 📊 Status & Roadmap

**Current Version**: 0.1.0 (v0.1.0 release gate passed; prototype quality)

### Implemented ✅
- Core crypto (Ed25519 + X25519-XSalsa20-Poly1305), 84/84 tests passing
- Key management: generate, export/import (Argon2id/PBKDF2 password-protected backup)
- Transport layer: Clipboard, QR, File, BLE (via TransportManager abstraction)
- BLE store-and-forward: outbox, inbox, retry, offline queuing
- Group messaging MVP (Sender Keys / DMESH_GROUP_V1 protocol)
- MeshRouter Phase 1: 1-hop relay with deduplication and hop budgets
- Multi-job CI (lint, typecheck, unit, integration, compat, E2E)
- GitHub Pages deployment (Vite build)
- Comprehensive docs and threat model

### Not Yet Implemented ⚠️
- BLE GATT server (peripheral/relay mode) — client-only by design for Phase 1
- MeshRouter runtime integration in app UI — module exists and is tested standalone
- Multi-hop mesh routing (MeshRouter Phase 2)
- Real Playwright E2E in CI (spec exists; requires `npm run test:e2e:install`)
- typecheck coverage for `app/src/` and `bluetooth/` (tsconfig.runtime.json surfaces gaps)
- Mobile apps, LoRa integration, post-quantum crypto

**Full Roadmap**: [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

> 日本語ドキュメント: [docs/DEEP_DIVE_ANALYSIS_JA.md](docs/DEEP_DIVE_ANALYSIS_JA.md)

---

## 🔐 Security Policy

**Found a vulnerability?**
Please use GitHub's private vulnerability reporting or contact maintainers directly.
**Do not** open public issues for security reports.

See [SECURITY.md](SECURITY.md) for details.

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file.

Copyright (c) 2026 Lifeline Mesh Contributors

---

## 🙏 Acknowledgments

- **TweetNaCl** - Audited NaCl implementation by @dchest
- **Emergency responders** - Inspiration for real-world use cases
- **Open source community** - Testing and feedback

---

## 🌐 Links

- **Live Demo**: https://hiroshitanaka-creator.github.io/lifeline-mesh/
- **Documentation**: [docs/](docs/)
- **Issues**: https://github.com/hiroshitanaka-creator/lifeline-mesh/issues
- **Discussions**: https://github.com/hiroshitanaka-creator/lifeline-mesh/discussions

---

### 💡 Name Meaning

A **lifeline** is a rope or chain thrown to rescue someone in danger.
A **mesh** network ensures that if one connection breaks, others remain.

**Lifeline Mesh** is built to stay connected when everything else goes dark.

## Contributing / Contributions

Thanks for your interest in contributing!

### Before submitting a Pull Request
- Please keep changes **small and focused** (one topic per PR).
- Please avoid touching **security**, **workflows**, or **CI configuration** unless explicitly discussed first.
- Please describe:
  1) **Why** the change is needed  
  2) **How** you tested it  
  3) Any **risks / edge cases**

### Maintainer review policy
For safety and stability, I may ask for changes or close PRs while the repository is being stabilized.
If you are unsure, please open an **Issue** first to discuss the approach.

---

# SolarWill Kernel

SolarWill Kernel は、**理由と制約を追跡できる意思決定支援**を最小構成で検証するための研究用リポジトリです。

## What it does

与えられた問いに対して、次を返します。

- 選択肢
- 暫定的な推奨
- 理由
- リスク
- 次に確認すべき問い
- trace（なぜその出力になったかの記録）

## What it is NOT

これは以下ではありません。

- 自律エージェント
- 万能な哲学AI
- 感情ケア用チャットボット
- 最終判断を代行するシステム
- 完成済みの製品

## Main Question

> SolarWill は、単一応答よりも、理由と制約が追える意思決定支援を作れるか？

## Week 1 Scope

この repo の最初の1週間では、次しかやりません。

- backend は **1つだけ**
- safety / constraint は **1つだけ**
- trace schema は **1つだけ**
- 出力形式は **1つだけ**
- baseline は **1つだけ**

### Non-goals for Week 1

- multi-agent swarm
- REST API
- Docker
- vector DB
- UI / viewer
- memory system
- benchmark 拡張
- 複数LLM backend の同時運用

## Quick Start

### 1. Create venv

```bash
python -m venv .venv
source .venv/bin/activate
```

### 2. Install

```bash
pip install -e .
```

### 3. Create env file

```bash
cp .env.example .env
```

### 4. Choose one backend

Week 1 は Gemini か Ollama のどちらか **1つだけ** 使います。

**Gemini を使う場合** — `.env` に以下を入れる:

```
SOLARWILL_BACKEND=gemini
GEMINI_API_KEY=your_key_here
```

**Ollama を使う場合** — `.env` に以下を入れる:

```
SOLARWILL_BACKEND=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

> **最初の1週間は Gemini 推奨。**
> 理由: まずは SolarWill の構造を理解するべきで、ローカルモデル運用の罠を同時に踏むべきではないから。

### 5. Run

```bash
python -m solarwill run "転職するべきか悩んでいる" --pretty
```

または:

```bash
solarwill run "転職するべきか悩んでいる" --pretty
```

## Output Contract

最低限、以下の形で返します。

```json
{
  "status": "ok",
  "question": "転職するべきか悩んでいる",
  "options": [
    "現職に残る",
    "転職活動を始める",
    "期限付きで情報収集する"
  ],
  "recommendation": "期限付きで情報収集する",
  "reasons": [
    "不確実性が高い",
    "即断より比較材料が不足している"
  ],
  "risks": [
    "現職不満の放置",
    "転職期待の過大評価"
  ],
  "next_questions": [
    "何が一番つらいのか",
    "収入と裁量のどちらを優先するか"
  ],
  "trace": {
    "backend_requested": "gemini",
    "backend_used": "gemini",
    "constraint_result": "passed",
    "prompt_version": "v0.1",
    "timestamp": "..."
  }
}
```

## Design Rules

1. One question first
2. One backend first
3. One output contract first
4. Trace everything
5. No magic
6. No giant architecture in week 1

## Week 1 Success Criteria

- `solarwill run ...` が通る
- stub backend で常に JSON が返る
- `blocked` / `warn` / `ok` の3状態が機能する
- trace JSON が保存される
- baseline 比較の土台ができる

---

## Research Charter — SolarWill Kernel

### Main Question

SolarWill は、単一応答よりも、理由と制約が追える意思決定支援を作れるか？

### Why this repo exists

この repo の目的は、巨大な思想体系をいきなり完成させることではない。
まずは、**小さく、読めて、壊して、直せる**最小核を作り、そこから学ぶことにある。

### Hypotheses

1. constraint + trace を持つ出力は、単一応答より監査しやすい
2. options + risks + next_questions を固定すると、出力の再利用性が上がる

### Non-goals (Week 1)

- multi-agent / philosopher swarm
- REST API
- Docker
- UI / viewer
- memory system
- benchmark 拡張
- 複数LLM backend 同時運用
- 「AI全体への優越」の主張

### Success Metrics (Week 1)

1. `solarwill run` で常に構造化 JSON が返る
2. 危険入力で `blocked`、注意入力で `warn` が返る
3. 実行ごとに trace が保存される

### Failure Criteria

1. 出力 schema が毎回崩れる
2. constraint 判定が trace に残らない
3. stub fallback でも最低応答が返らない

### Minimal Baselines

- baseline A: stub backend with no live model
- baseline B: single live backend (Gemini or Ollama, one only)

### Operating Principle

SolarWill は「夢を小さくする」ための repo ではない。
**夢を検証可能な大きさに切る**ための repo である。

### Week 1 Rule

新しい機能を増やす前に、次を必ず満たす。

- CLI が動く
- tests が通る
- trace が残る
- 何をやらないかが明文化されている

### Decision

Week 1 では **1 backend / 1 constraint / 1 trace contract / 1 CLI path** に固定する。