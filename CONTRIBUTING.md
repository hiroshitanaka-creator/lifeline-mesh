# Contributing to Lifeline Mesh

Thank you for your interest in contributing! This project aims to save lives by providing emergency communication when infrastructure fails. Every contribution matters.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Community](#community)

---

## Code of Conduct

This project is dedicated to providing a safe, welcoming environment for everyone. We expect all contributors to:

- Be respectful and inclusive
- Focus on constructive feedback
- Prioritize the mission: helping people in emergencies

---

## How Can I Contribute?

### 1. Code Contributions

**High Priority (Help Wanted):**

| Area | Description | Skills Needed |
|------|-------------|---------------|
| **Bluetooth BLE** | Implement Web Bluetooth relay | JavaScript, BLE |
| **Key Security** | Upgrade to Argon2id encryption | Cryptography |
| **Group Messaging** | Implement Sender Keys protocol | Protocol design |
| **UI/UX** | Make it usable in emergencies | Design, CSS |

**Good First Issues:**

- Add more test vectors
- Improve error messages
- Fix typos in documentation
- Add JSDoc comments
- Translate documentation

### 2. Non-Code Contributions

- **Security Review**: Audit the crypto implementation
- **Documentation**: Write tutorials, translate docs
- **Design**: Create mockups, improve accessibility
- **Testing**: Try the app, report bugs, suggest improvements
- **Outreach**: Connect with emergency responders, NGOs

### 3. Ideas and Feedback

- Open a Discussion for feature ideas
- Share use cases from your region/context
- Suggest partnerships with organizations

---

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- Git
- A modern browser (Chrome/Edge recommended for Web Bluetooth)

### Setup

```bash
# Clone the repository
git clone https://github.com/hiroshitanaka-creator/lifeline-mesh.git
cd lifeline-mesh

# Install dependencies
npm install

# Install subproject dependencies
npm run install:all

# Run all tests
npm test

# Run linting
npm run lint
```

### Project Structure

```
/app            Browser UI (ES6 modules)
/crypto         Core cryptographic functions
/spec           Protocol specification & threat model
/tools          Test vectors & utilities
/docs           User documentation
/.github        CI/CD workflows & templates
```

### Key Documents

Before contributing, please read:

1. **[DEEP_DIVE_ANALYSIS.md](DEEP_DIVE_ANALYSIS.md)** - Project vision and roadmap
2. **[TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md)** - Implementation details
3. **[spec/THREAT_MODEL.md](spec/THREAT_MODEL.md)** - Security considerations
4. **[spec/PROTOCOL.md](spec/PROTOCOL.md)** - Protocol specification

---

## Development Workflow

### 1. Find or Create an Issue

- Check existing issues before creating new ones
- Comment on an issue to claim it
- For large changes, discuss in an issue first

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 3. Make Changes

- Keep changes focused and minimal
- Add tests for new functionality
- Update documentation if needed

### 4. Test Your Changes

```bash
# Run all tests
npm test

# Run crypto tests only
npm run test:crypto

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### 5. Commit

```bash
git add .
git commit -m "feat: add Bluetooth relay support"
```

**Commit Message Format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding tests
- `refactor:` - Code refactoring
- `security:` - Security improvements

---

## Pull Request Process

### Before Submitting

- [ ] All tests pass (`npm test`)
- [ ] No linting errors (`npm run lint`)
- [ ] Documentation updated (if applicable)
- [ ] No secrets or credentials committed
- [ ] PR is focused (one feature/fix per PR)

### PR Description

Please include:

1. **What**: Brief description of changes
2. **Why**: Motivation / issue link
3. **How**: Technical approach (if complex)
4. **Testing**: How you tested the changes

### Review Process

1. Automated CI checks must pass
2. At least one maintainer review
3. Security-sensitive changes require extra review
4. Merge after approval

---

## Style Guidelines

### JavaScript

- ES6+ features (modules, async/await, etc.)
- No external dependencies in `/crypto` (purity)
- JSDoc comments for public functions

```javascript
/**
 * Encrypt a message for a recipient
 * @param {Object} params - Encryption parameters
 * @param {string} params.content - Message content
 * @param {Uint8Array} params.recipientBoxPK - Recipient's public key
 * @returns {Object} Encrypted message object
 */
export function encryptMessage(params) {
  // ...
}
```

### Crypto Code Rules

1. **Never** implement your own primitives
2. **Always** use TweetNaCl for crypto operations
3. **Always** add test vectors for new crypto code
4. **Never** commit test keys to production code
5. **Always** consider the threat model

### Documentation

- Clear, concise language
- Code examples where helpful
- Keep emergency users in mind (non-technical)

---

## Community

### Getting Help

- **GitHub Discussions**: Questions, ideas, general chat
- **GitHub Issues**: Bug reports, feature requests

### Recognition

All contributors are recognized in:
- GitHub Contributors page
- Release notes for significant contributions

### Maintainers

Questions? Reach out via GitHub Discussions or Issues.

---

## Thank You

Every contribution, no matter how small, brings us closer to a tool that could save lives during disasters.

**Let's build this together.**

---

*[日本語版 / Japanese version coming soon]*
