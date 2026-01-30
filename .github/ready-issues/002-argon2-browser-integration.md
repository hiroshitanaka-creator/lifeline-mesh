# Issue: Integrate argon2-browser for Secure Key Backup

**Labels:** `help wanted`, `security`, `enhancement`

---

## Description

The new `crypto/key-backup.js` module supports Argon2id for key derivation, but currently falls back to PBKDF2 because `argon2-browser` is not included.

## Goal

Add `argon2-browser` as a CDN dependency with SRI hash, so users get the strongest key derivation available.

## Tasks

1. [ ] Add argon2-browser to `app/index.html` with SRI
2. [ ] Test that Argon2id is detected and used
3. [ ] Update documentation
4. [ ] Add UI indicator showing which KDF is in use

## Technical Details

```html
<!-- Add to app/index.html -->
<script src="https://unpkg.com/argon2-browser@1.18.0/dist/argon2-bundled.min.js"
        integrity="sha384-XXXXX"
        crossorigin="anonymous"></script>
```

Generate SRI hash:
```bash
cd tools && npm run generate-sri -- https://unpkg.com/argon2-browser@1.18.0/dist/argon2-bundled.min.js
```

## Testing

```javascript
import { isArgon2Available, encryptKeys } from './crypto/key-backup.js';

console.log('Argon2 available:', isArgon2Available());

const backup = await encryptKeys(keys, 'password', nacl, naclUtil);
console.log('KDF used:', backup.kdf); // Should be 'argon2id'
```

## Skills Needed

- JavaScript
- Basic cryptography knowledge
- Understanding of SRI

## Difficulty

Medium

---

**Files:** `app/index.html`, `crypto/key-backup.js`
