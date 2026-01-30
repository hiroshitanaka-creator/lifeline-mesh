# Lifeline Mesh 🌐

**End-to-end encrypted emergency messaging • Offline-first • No server required**

[![Tests](https://img.shields.io/badge/tests-37%2F37%20passing-brightgreen)](https://github.com/hiroshitanaka-creator/lifeline-mesh/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Security](https://img.shields.io/badge/security-SRI%20enabled-green)](spec/THREAT_MODEL.md)

Lifeline Mesh is a browser-based, cryptographically secure messaging system designed for emergency situations where traditional infrastructure may be degraded or unavailable.

> **Mission**: When disaster strikes and infrastructure fails, people still need to communicate.
> This project aims to provide that lifeline.

---

## 🆘 We Need Your Help

This project could save lives, but it needs contributors to become real.

**Most Needed Right Now:**

| Priority | Task | Skills | Issue |
|----------|------|--------|-------|
| 🔴 Critical | **Bluetooth BLE Relay** | Web Bluetooth API, JavaScript | Help wanted |
| 🔴 Critical | **Key Backup Security** | Cryptography, Argon2id | Help wanted |
| 🟡 High | **UI/UX Overhaul** | Design, CSS, Accessibility | Help wanted |
| 🟡 High | **Group Messaging** | Protocol design, Crypto | Help wanted |
| 🟢 Good First | **Documentation i18n** | Any language | Good first issue |
| 🟢 Good First | **Test Coverage** | JavaScript testing | Good first issue |

**Read the full roadmap**: [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)

Every contribution matters. Let's build this together.

---

## 🚀 Quick Start

### Try the Live Demo
**https://hiroshitanaka-creator.github.io/lifeline-mesh/**

### Use Locally
1. Clone this repository
2. Open `app/index.html` in your browser
3. Generate keys → Add contacts → Encrypt/Decrypt

**No installation required** – runs entirely in your browser.

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
- 💾 Export keys (password-protected backup)
- 📥 Import keys (restore from file)
- 🗑️ Reset all data (emergency key rotation)

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

All tests passing: **37/37 ✓**

### Crypto Core Tests (14/14)
```bash
cd crypto
npm install
npm test
```

Tests: Key generation, encryption/decryption, signature verification, tampering detection, replay checks, byte utilities.

### Test Vector Validation (23/23)
```bash
cd tools
npm install
npm run validate-vectors
```

Tests: Message structure, round-trip encryption, signature validation, recipient binding, tampering detection, interoperability.

---

## 🏗️ Architecture

### Repository Structure
```
/app            Demo UI (browser-based, ES6 modules)
/crypto         Core cryptographic functions (pure, testable)
/spec           Threat model + protocol specification
/tools          Test vectors, validator, SRI generator
/docs           Usage guide, FAQ
.github/        Workflows, templates, deployment guides
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
Automatically deployed from `main` branch via GitHub Actions.

**Live URL**: https://hiroshitanaka-creator.github.io/lifeline-mesh/

### Self-Hosting
1. Copy `/app` directory to your web server
2. Serve `index.html` (no build step required)
3. **Recommended**: Add CSP headers for extra security

### Production Checklist
- [x] SRI added to all CDN scripts
- [x] All tests passing
- [x] Documentation complete
- [ ] Consider self-hosting TweetNaCl (avoid CDN dependency)
- [ ] Add Content Security Policy headers
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
- **Languages**: JavaScript (ES6 modules)
- **Crypto**: TweetNaCl 1.0.3
- **Storage**: IndexedDB (browser)
- **Build**: None required (pure HTML/JS)

---

## 🤝 Contributing

We welcome all contributors! Here's how to get started:

### First Time?
1. Read [DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md) to understand the vision
2. Check [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) for implementation details
3. Look for issues labeled `good first issue`
4. Join the discussion in GitHub Discussions

### Ways to Contribute
- **Code**: Bluetooth relay, group messaging, UI improvements
- **Security**: Reviews, audits, vulnerability research
- **Design**: UX for emergency scenarios, accessibility
- **Docs**: Translations, tutorials, examples
- **Testing**: Test vectors, edge cases, real-world scenarios
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

**Current Version**: 1.0.0 (Production-ready prototype)

### Completed ✅
- Core crypto implementation (Ed25519 + X25519)
- Test suite (37/37 passing)
- Comprehensive documentation
- Key management (export/import)
- SRI security hardening
- GitHub Pages deployment

### In Progress 🚧
- Relay implementations (Bluetooth BLE)
- Key backup security upgrade (Argon2id)
- UI/UX improvements

### Planned 📋
- Group messaging (Sender Keys protocol)
- Mobile apps (React Native / Flutter)
- LoRa integration
- Post-quantum crypto

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
