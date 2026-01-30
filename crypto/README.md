# Crypto Core

Pure cryptographic functions for Lifeline Mesh, extracted from the UI implementation.

## Design Goals
- **Testable**: Pure functions with no UI dependencies
- **Portable**: Works in browser and Node.js
- **Spec-compliant**: Implements PROTOCOL.md exactly
- **Zero state**: All functions are stateless (except key generation using crypto RNG)

## Files

### `core.js`
Core cryptographic operations:
- Key generation (Ed25519, X25519)
- Fingerprint derivation
- Message encryption/signing
- Message verification/decryption
- Public identity creation

### `key-backup.js`
Secure key backup with password-based encryption:
- Argon2id key derivation (with PBKDF2 fallback)
- NaCl secretbox encryption (XSalsa20-Poly1305)
- Password strength checking
- Secure backup/restore workflow

## Usage

### Browser (ES Modules)
```html
<script src="https://unpkg.com/tweetnacl@1.0.3/nacl.min.js"></script>
<script src="https://unpkg.com/tweetnacl-util@0.15.1/nacl-util.min.js"></script>
<script type="module">
  import * as DMesh from './crypto/core.js';

  // Generate keys
  const signKP = DMesh.generateSignKeyPair(nacl);
  const boxKP = DMesh.generateBoxKeyPair(nacl);

  // Create identity
  const id = DMesh.createPublicIdentity({
    name: "Alice",
    signPK: signKP.publicKey,
    boxPK: boxKP.publicKey
  }, nacl, nacl.util);

  console.log(id);
</script>
```

### Node.js
```javascript
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as DMesh from './crypto/core.js';

// Generate keys
const signKP = DMesh.generateSignKeyPair(nacl);
const boxKP = DMesh.generateBoxKeyPair(nacl);

// Encrypt message
const msg = DMesh.encryptMessage({
  content: "Hello, world!",
  senderSignPK: signKP.publicKey,
  senderSignSK: signKP.secretKey,
  senderBoxPK: boxKP.publicKey,
  senderBoxSK: boxKP.secretKey,
  recipientBoxPK: recipientBoxKP.publicKey
}, nacl, naclUtil);

console.log(JSON.stringify(msg, null, 2));
```

### Key Backup (Browser)
```javascript
import {
  encryptKeys,
  decryptKeys,
  checkPasswordStrength
} from './crypto/key-backup.js';

// Check password strength
const strength = checkPasswordStrength('myPassword123!');
console.log(strength); // { score: 5, strength: 'good', ... }

// Encrypt keys for backup
const backup = await encryptKeys({
  signPK: signPKBase64,
  signSK: signSKBase64,
  boxPK: boxPKBase64,
  boxSK: boxSKBase64
}, 'strongPassword', nacl, naclUtil);

// Save backup to file
const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });

// Later: restore from backup
const keys = await decryptKeys(backup, 'strongPassword', nacl, naclUtil);
```

## API Reference

### Key Generation

#### `generateSignKeyPair(nacl)`
Generate Ed25519 signing key pair.
- **Returns**: `{publicKey: Uint8Array, secretKey: Uint8Array}`

#### `generateBoxKeyPair(nacl)`
Generate X25519 box (encryption) key pair.
- **Returns**: `{publicKey: Uint8Array, secretKey: Uint8Array}`

### Fingerprint

#### `fingerprintFromSignPK(signPKu8, nacl)`
Generate 16-byte fingerprint from signing public key.
- **Params**:
  - `signPKu8`: Ed25519 public key (32 bytes)
  - `nacl`: TweetNaCl instance
- **Returns**: `Uint8Array` (16 bytes)

### Encryption

#### `encryptMessage(params, nacl, naclUtil)`
Encrypt and sign a message.

**Params**:
- `content` (string): Message content
- `senderSignPK` (Uint8Array): Sender's Ed25519 public key
- `senderSignSK` (Uint8Array): Sender's Ed25519 secret key
- `senderBoxPK` (Uint8Array): Sender's X25519 public key
- `senderBoxSK` (Uint8Array): Sender's X25519 secret key
- `recipientBoxPK` (Uint8Array): Recipient's X25519 public key
- `ts` (number, optional): Timestamp (defaults to `Date.now()`)

**Returns**: Encrypted message object (see PROTOCOL.md)

**Throws**:
- `"Content too large"` if content exceeds `MAX_BYTES`
- `"Encryption failed"` if NaCl box encryption fails

### Decryption

#### `decryptMessage(params, nacl, naclUtil)`
Verify and decrypt a message.

**Params**:
- `message` (object): Encrypted message object
- `recipientBoxPK` (Uint8Array): Recipient's X25519 public key
- `recipientBoxSK` (Uint8Array): Recipient's X25519 secret key
- `expectedSenderSignPK` (Uint8Array|null): Expected sender's Ed25519 public key (null for TOFU)
- `expectedSenderBoxPK` (Uint8Array|null): Expected sender's X25519 box key (null for TOFU)
- `replayCheck` (Function, optional): `(senderFp, nonceB64) => boolean` (return true if replay check passes)

**Returns**:
```javascript
{
  content: string,
  senderSignPK: Uint8Array,
  senderBoxPK: Uint8Array,
  senderFp: Uint8Array,
  ts: number
}
```

**Throws**:
- `"Invalid message format"` if structure invalid
- `"Base64 decode failed"` if any field malformed
- `"Timestamp skew too large"` if `|now - ts| > MAX_SKEW_MS`
- `"Not intended for this recipient"` if recipient mismatch
- `"Sender signing key mismatch"` if known sender's signing key changed
- `"Sender box key mismatch"` if known sender's box key changed
- `"Invalid signature"` if signature verification fails
- `"Replay detected"` if replay check fails
- `"Decryption failed"` if NaCl box decryption fails

### Identity

#### `createPublicIdentity(params, nacl, naclUtil)`
Create a public identity object.

**Params**:
- `name` (string): Display name
- `signPK` (Uint8Array): Ed25519 public key
- `boxPK` (Uint8Array): X25519 public key

**Returns**: Public identity object (see PROTOCOL.md)

### Utilities

#### `concatU8(arrs)`
Concatenate multiple Uint8Array.
- **Params**: `arrs` (Array<Uint8Array>)
- **Returns**: `Uint8Array`

#### `u32be(n)`
Convert number to 4-byte big-endian Uint8Array.
- **Params**: `n` (number, uint32)
- **Returns**: `Uint8Array` (4 bytes)

#### `u64beFromNumber(ts)`
Convert number to 8-byte big-endian Uint8Array.
- **Params**: `ts` (number, timestamp)
- **Returns**: `Uint8Array` (8 bytes)

#### `buildSignBytes(params, naclUtil)`
Build SignBytes for signature generation/verification (internal use).

**Params**:
- `senderSignPK` (Uint8Array)
- `senderBoxPK` (Uint8Array)
- `recipientBoxPK` (Uint8Array)
- `ephPK` (Uint8Array)
- `nonce` (Uint8Array)
- `ts` (number)
- `ciphertext` (Uint8Array)

**Returns**: `Uint8Array` (SignBytes as specified in PROTOCOL.md)

### Key Backup (`key-backup.js`)

#### `encryptKeys(keys, password, nacl, naclUtil)`
Encrypt keys with password using Argon2id (or PBKDF2 fallback).

**Params**:
- `keys` (object): `{signPK, signSK, boxPK, boxSK}` all base64
- `password` (string): User password
- `nacl`: TweetNaCl instance
- `naclUtil`: TweetNaCl-util instance

**Returns**: Encrypted backup object

#### `decryptKeys(backup, password, nacl, naclUtil)`
Decrypt keys from backup.

**Params**:
- `backup` (object): Encrypted backup from `encryptKeys`
- `password` (string): User password

**Returns**: `{signPK, signSK, boxPK, boxSK}` all base64

**Throws**: `"Decryption failed - wrong password or corrupted backup"`

#### `checkPasswordStrength(password)`
Check password strength.

**Returns**:
```javascript
{
  score: 0-7,
  strength: 'weak' | 'fair' | 'good' | 'strong',
  message: string,
  details: { length, hasLower, hasUpper, hasNumber, hasSymbol }
}
```

#### `isArgon2Available()`
Check if Argon2 library is loaded.

**Returns**: `boolean`

## Constants

```javascript
export const DOMAIN = "DMESH_MSG_V1";
export const MAX_BYTES = 150 * 1024; // 150 KB
export const MAX_SKEW_MS = 10 * 60 * 1000; // 10 minutes
export const REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
```

## Testing

See `/tools` for test vector generation and validation utilities.

## Security Notes

- All functions are **stateless** except RNG-based key generation
- Replay protection requires external state (replay database)
- TOFU trust model: set `expectedSenderSignPK` to `null` for first contact
- Timestamp validation uses local clock (ensure ±10 min accuracy)
- No key rotation or revocation mechanisms (future work)
