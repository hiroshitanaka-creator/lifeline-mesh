# Good First Issues

Welcome! These tasks are designed for first-time contributors. Pick one that interests you and get started!

## How to Claim a Task

1. Comment on the GitHub issue (or create one if it doesn't exist)
2. Fork the repository
3. Create a branch: `git checkout -b fix/your-task-name`
4. Make your changes
5. Submit a PR

---

## Documentation Tasks

### 1. Translate README to Your Language
**Difficulty**: Easy | **Skills**: Any language

Create `README_XX.md` where XX is your language code (e.g., `README_ES.md` for Spanish).

**Files**: `README.md` (source)

---

### 2. Add More FAQ Questions
**Difficulty**: Easy | **Skills**: Writing

Add 5+ questions that new users might ask.

**Files**: `docs/FAQ.md`

---

### 3. Add Code Comments to crypto/core.js
**Difficulty**: Easy-Medium | **Skills**: JavaScript, Cryptography basics

Add JSDoc comments explaining what each function does.

**Files**: `crypto/core.js`

---

## Testing Tasks

### 4. Add Edge Case Test Vectors
**Difficulty**: Medium | **Skills**: JavaScript, Testing

Create test vectors for:
- Maximum size message (150KB)
- Empty message
- Unicode edge cases (emoji, RTL text)

**Files**: `tools/test-vectors.json`, `tools/generate-test-vectors.js`

---

### 5. Add Browser Compatibility Tests
**Difficulty**: Medium | **Skills**: JavaScript, Testing

Test and document which browsers support which features.

**Files**: Create `docs/BROWSER_SUPPORT.md`

---

## Code Tasks

### 6. Improve Error Messages
**Difficulty**: Easy | **Skills**: JavaScript

Make error messages more user-friendly (less technical jargon).

**Files**: `crypto/errors.js`, `app/index.html`

---

### 7. Add Loading States to UI
**Difficulty**: Easy | **Skills**: HTML, CSS, JavaScript

Show loading indicators during:
- Key generation
- Encryption/Decryption
- QR code scanning

**Files**: `app/index.html`

---

### 8. Add Dark Mode Support
**Difficulty**: Easy-Medium | **Skills**: CSS

Implement `prefers-color-scheme` dark mode.

**Files**: `app/index.html` (CSS section)

---

### 9. Add Keyboard Shortcuts
**Difficulty**: Easy | **Skills**: JavaScript

Add shortcuts like:
- `Ctrl+E` - Encrypt
- `Ctrl+D` - Decrypt
- `Ctrl+K` - Generate keys

**Files**: `app/index.html`

---

### 10. Improve Accessibility (a11y)
**Difficulty**: Medium | **Skills**: HTML, ARIA, Accessibility

- Add ARIA labels
- Ensure keyboard navigation
- Test with screen reader

**Files**: `app/index.html`

---

## Research Tasks

### 11. Document Web Bluetooth Browser Support
**Difficulty**: Easy | **Skills**: Research

Research and document which browsers/platforms support Web Bluetooth API.

**Files**: Create `docs/WEB_BLUETOOTH_SUPPORT.md`

---

### 12. Compare with Similar Projects
**Difficulty**: Easy | **Skills**: Research

Create a detailed comparison with Briar, Bridgefy, Meshtastic.

**Files**: Add section to `DEEP_DIVE_ANALYSIS.md`

---

## Design Tasks

### 13. Create App Icons
**Difficulty**: Easy | **Skills**: Design

Create proper app icons for PWA (various sizes).

**Files**: `app/` directory

---

### 14. Design Emergency Mode UI
**Difficulty**: Medium | **Skills**: UX Design

Create mockups for a simplified "panic mode" UI.

**Files**: Create mockups, open for discussion

---

## Getting Help

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions
- Ask questions in GitHub Discussions
- Tag maintainers if you're stuck

---

## Recognition

All contributors are acknowledged in:
- GitHub Contributors page
- Release notes

**Thank you for helping make emergency communication accessible to everyone!**
