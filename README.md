# Lifeline Mesh 🌐

**End-to-end encrypted emergency messaging • Offline-first • No server required**

[![Tests](https://img.shields.io/badge/tests-224%2F224%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
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
| 🟡 High | **Browser-side BLE peripheral backend** | Capacitor / WebView bridge / native BLE APIs | `IGATTBackend` already has a Node backend (`node-bleno`); mobile/browser-peripheral adapters are still needed |
| 🟡 High | **UI/UX Overhaul** | Design, CSS, Accessibility | Functional but not polished |
| 🟢 Good First | **Documentation i18n** | Any language | Good first issue |
| 🟢 Good First | **Playwright E2E expansion** | Testing, browser automation | Real-browser harness exists; coverage can be widened |

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

> The app uses ES modules and secure-browser APIs. Use `http://localhost` (Vite) for local development; do not open `app/index.html` as `file://`.

---

## ✨ Features

### Security
- 🔐 **Ed25519 signatures** for message authentication
- 🔒 **X25519-XSalsa20-Poly1305** encryption for confidentiality
- 🔑 **Ephemeral encryption keys** (forward secrecy approximation)
- 🎯 **Recipient binding** prevents message redirection
- 🛡️ **Replay protection** with 30-day nonce tracking
- ✅ **TOFU (Trust On First Use)** with key pinning
- 🔏 **Contact verification workflow**: mark contacts as verified or compromised, with safety numbers and per-contact status badges
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

### BLE Mesh Networking
- 📡 **Multi-link runtime**: multiple concurrent BLE connections with real store-and-forward relay
- 🔀 **N-hop routing**: MeshRouter Phase 2 proactive route advertisements (auto-enabled at ≥2 links)
- 🧩 **Transport boundary (`transport/`)** with `TransportLink` adapters for browser-central BLE, Node peripheral reference path, and native peripheral contract stubs
- 📤 Outbox queuing (priority / TTL / per-link targeting) with automatic flush on reconnect
- 📥 Inbox persistence for received messages
- 🔌 **GATT server layer** (`bluetooth/gatt-server.js`): pluggable `IGATTBackend` interface ready for native adapters (Capacitor, noble)
- 🖥️ **Node.js relay server** (`node-server/`): persistent single-client relay mode with durable message store (`persistent-relay-store.js`) for infrastructure-independent forwarding

### Operator Panel
- 📊 Live mesh state dashboard: active links, route table, relay counters, route-advertisement activity
- 🟢 Color-coded link health (green ≥2 links, yellow = 1, red = 0)
- 🛡️ XSS-safe rendering; polling interval configurable

### User Experience
- 📱 Offline-first (works without internet)
- 📦 PWA manifest + share target (`title`/`text` GET params) + app-shell service worker caching for scope `/lifeline-mesh/`
- 🆘 Emergency Mode (simplified, form-based disaster messaging)
- 📋 Copy/paste encrypted messages; keyboard shortcuts (Ctrl+K/E/D)
- 📚 Embedded documentation
- 🌐 No server required
- 🚀 Relay-agnostic (send via any channel: QR, Bluetooth, USB, radio, etc.)

---

## 📖 Documentation

### For Users
- **[Usage Guide](docs/USAGE.md)** - Quick start, security practices, troubleshooting
- **[FAQ](docs/FAQ.md)** - 30+ questions about security, features, and usage
- **[Web Bluetooth Support](docs/WEB_BLUETOOTH_SUPPORT.md)** - Browser/platform compatibility and fallback guidance
- **[BLE Manual Validation Runbook](docs/BLE_MANUAL_VALIDATION_RUNBOOK.md)** - Hardware test matrix and repeatable contributor checks
- **[A↔B↔C Relay Drill](docs/RELAY_DRILL_AB_C.md)** - Unified interop drill for browser-central ↔ Node-peripheral path

### For Developers
- **[Protocol Specification](spec/PROTOCOL.md)** - Current protocol specification (with vnext cross-link)
- **[Protocol VNext Freeze](spec/PROTOCOL_VNEXT.md)** - Canonical phase-1 sign-target definitions and ID derivation
- **[State Model](spec/STATE_MODEL.md)** - Verification state machine + signed state/event model
- **[Threat Model](spec/THREAT_MODEL.md)** - Comprehensive security analysis
- **[Crypto Core API](crypto/README.md)** - Reusable crypto functions

### For Contributors
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute
- **[Security Policy](SECURITY.md)** - Vulnerability reporting
- **[Project Charter](PROJECT_CHARTER.md)** - Scope and goals

---

## 🔬 Testing

All tests passing: **224/224 ✓**

| Suite | Count | Command |
|---|---|---|
| Crypto core unit | 22 | `npm run test:crypto` |
| Test vectors | 27 | `npm run test:vectors` |
| BLE + transport integration | 24 | `npm run test:integration` |
| Group messaging integration | 11 | `npm run test:integration` |
| Contact verification integration | 7 | `npm run test:integration` |
| Store maintenance integration | 1 | `npm run test:integration` |
| Mesh router Phase 1 integration | 14 | `npm run test:integration` |
| BLE mesh relay integration | 6 | `npm run test:integration` |
| Mesh router Phase 2 integration | 27 | `npm run test:integration` |
| App runtime mesh integration | 12 | `npm run test:integration` |
| GATT server integration | 19 | `npm run test:integration` |
| Node-server relay integration | 7 | `npm run test:integration` |
| Node-server relay ops integration | 14 | `npm run test:integration` |
| Share-target intake routing integration | 4 | `npm run test:integration` |
| Operator panel unit | 21 | `npm run test:integration` |
| DB migration integration | 1 | `npm run test:integration` |
| Transport Phase 2 boundary integration | 7 | `npm run test:integration` |
| **Total** | **224** | `npm run test:unit && npm run test:integration` |

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

# Full real-browser path (install + Playwright run)
npm run test:e2e:real-browser
```

CI note:
- Fast PR gate (`e2e_browser_smoke` job in CI) runs the Playwright **critical-path spec** (`main-ci-critical-path.spec.js`) — full key-gen → encrypt → decrypt → verify → compromised flow.
- Full Playwright suite runs in `.github/workflows/e2e-real-browser.yml` (nightly, manual dispatch, and pushes to main/master).
- `npm run validate` maps to `validate:local` (smoke E2E for faster local iteration), while CI uses `validate:ci` (adds `typecheck:runtime` + Playwright critical path gate).

---

## 🏗️ Architecture

### Repository Structure
```
/app            Demo UI (Vite build, ES6 modules, PWA)
  src/
    runtime-mesh.js   Multi-link mesh runtime (addLink/removeLink, route adv)
    operator-panel.js Live operator dashboard (polling, XSS-safe renderer)
/bluetooth      BLE manager + MeshRouter + GATT server layer
  ble-manager.js      BLE central/client with store-and-forward
  mesh-router.js      Phase 1 (1-hop dedup) + Phase 2 (N-hop route adv)
  gatt-server.js      GATT peripheral layer with pluggable IGATTBackend
/transport      Phase 2 transport-link adapters + retry policy + envelope strategy
/crypto         Core crypto, group messaging, transport, store (schema v4)
/node-server    Node.js relay server (persistent single-client relay mode)
  relay-node.js             Relay session manager
  persistent-relay-store.js Durable message store for relay forwarding
/spec           Threat model + protocol specification
/tools          Test vectors, validator, SRI generator
/docs           Usage guide, FAQ, phase progress
/tests          Integration and E2E test suites
/types          TypeScript declaration files (.d.ts)
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

### Multi-link Relay Topology
```
[Alice] ──BLE-link-A──► [Relay node]  ──BLE-link-B──► [Bob]
                              │
                         runtime-mesh.js
                         MeshRouter (Phase 1+2)
                         route adv broadcast (30 s interval)
```
The app runtime (`app/src/runtime-mesh.js`) maintains a `Map<peerId, BLEManager>` for concurrent links. Incoming messages on link-A are forwarded to other links (egress loop), and route advertisements propagate topology automatically when ≥2 links are active.

The Node relay (`node-server/`) is intentionally **single-client** per active BLE session, with durable pending/delivered store state and observable cleanup/snapshot counters exposed via `relay-ops.js` and `FileRelayStore#getSnapshot()`.

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
❌ **BLE availability**: Web Bluetooth is effectively Chromium-only and requires a secure context (`https://` or `http://localhost`)
⚠️ **Browser/mobile peripheral mode gap**: Node relay peripheral mode exists (`bluetooth/backends/node-bleno.js`), but browser/mobile adapters are not yet implemented
❌ **Offline bootstrap**: First load must happen in a served origin; `file://` is unsupported. After first load, cached app assets can be used offline
⚠️ **Fallback path**: Clipboard/File/QR relay is the compatibility baseline when BLE is unavailable

See [THREAT_MODEL.md](spec/THREAT_MODEL.md) for comprehensive analysis.
See [WEB_BLUETOOTH_SUPPORT.md](docs/WEB_BLUETOOTH_SUPPORT.md) for current browser/platform BLE caveats.

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
Automatically deployed from `main` branch via `.github/workflows/pages.yml`.
The workflow runs `npm install --prefix app && npm run build --prefix app` and deploys `app/dist/` (Vite build output).

**Live URL**: https://hiroshitanaka-creator.github.io/lifeline-mesh/

### Self-Hosting
1. Run `npm ci --prefix app && npm run build --prefix app`
2. Serve `app/dist/` directory from your web server
3. **Recommended**: Add CSP headers for extra security

### Production Checklist
- [x] SRI added to all CDN scripts
- [x] All tests passing (217/217)
- [x] Documentation complete
- [ ] Consider self-hosting TweetNaCl (avoid CDN dependency)
- [x] Add Content Security Policy headers
- [ ] Set up monitoring/analytics (optional)

---

## 🛠️ Development

### Run Tests
```bash
# All tests (crypto + vectors + integration)
npm test

# Crypto only
cd crypto && npm test

# Test vectors
cd tools && npm run validate-vectors

# Integration suites
npm run test:integration
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
- **Languages**: JavaScript (ES6 modules), TypeScript (declaration files in `types/`)
- **Crypto**: TweetNaCl 1.0.3 + tweetnacl-util + argon2 (key backup)
- **Storage**: IndexedDB schema v4 (priority, TTL, linkId fields) via `crypto/store.js`
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
- **Code**: Native GATT backend (Capacitor/noble), UI polish, LoRa/radio transport
- **Security**: Reviews, audits, vulnerability research
- **Design**: UX for emergency scenarios, accessibility
- **Docs**: Translations, tutorials, examples
- **Testing**: E2E coverage expansion, test vectors, edge cases
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
- Core crypto (Ed25519 + X25519-XSalsa20-Poly1305), 217/217 tests passing
- Key management: generate, export/import (Argon2id/PBKDF2 password-protected backup)
- Transport layer: Clipboard, QR, File, BLE (via TransportManager abstraction)
- **Multi-link BLE runtime**: concurrent links via `Map<peerId, BLEManager>`, egress relay loop, route-adv broadcast
- **MeshRouter Phase 1 + Phase 2**: 1-hop relay with dedup; N-hop proactive routing with route advertisements (auto-enabled at ≥2 links)
- **GATT server layer**: `bluetooth/gatt-server.js` with pluggable `IGATTBackend` + `MockGATTBackend` for unit testing
- **Operator Panel**: live mesh monitoring UI (`app/src/operator-panel.js`), mounted in app with 2 s polling
- **Outbox schema v4**: `priority` / `ttl` / `linkId` fields, IDB migration, `getOutboxForLink()` / `getOutboxByMinPriority()` / `purgeExpiredOutbox()`
- **TypeScript declarations**: `types/runtime-mesh.d.ts`, `types/operator-panel.d.ts`, `types/gatt-server.d.ts`, `types/app-globals.d.ts`
- **Contact verification workflow**: safety-number display, verify / mark-compromised per contact, encryption blocked for compromised recipients
- **Node.js relay server** (`node-server/`): persistent single-client relay with durable store; 5/5 integration tests
- Group messaging MVP (Sender Keys / DMESH_GROUP_V1 protocol)
- Multi-job CI (lint, typecheck, unit, integration, compat, security, E2E Playwright critical-path)
- GitHub Pages deployment (Vite build)
- Comprehensive docs and threat model

### Not Yet Implemented ⚠️
- **Browser/mobile peripheral backend gap**: `IGATTBackend` already has a Node backend (`bluetooth/backends/node-bleno.js`). Browser/mobile peripheral adapters (Capacitor/WebView/native bridge) remain pending
- Mobile apps, LoRa integration, post-quantum crypto
- Full TypeScript strict-mode coverage for `app/src/` and `bluetooth/`

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

---

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
