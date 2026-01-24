# Protocol Specification

## Version
Protocol Version: **1** (field `v: 1`)

## Overview
Lifeline Mesh uses a hybrid cryptographic scheme:
- **Signing**: Ed25519 (authentication, non-repudiation)
- **Encryption**: X25519-XSalsa20-Poly1305 (confidentiality, integrity)

Each user maintains **separate** signing and box (encryption) key pairs.

## Message Format

### Public Identity Format
Users exchange public identities for contact registration:

```json
{
  "v": 1,
  "kind": "dmesh-id",
  "name": "Alice",
  "fp": "<base64-fingerprint-16-bytes>",
  "signPK": "<base64-ed25519-public-32-bytes>",
  "boxPK": "<base64-x25519-public-32-bytes>"
}
```

**Fields**:
- `v`: Protocol version (currently `1`)
- `kind`: Message type identifier (`"dmesh-id"`)
- `name`: Display name (user-provided, not authenticated)
- `fp`: Fingerprint derived from `signPK` (first 16 bytes of SHA-512)
- `signPK`: Ed25519 public signing key (32 bytes, base64)
- `boxPK`: X25519 public encryption key (32 bytes, base64)

### Encrypted Message Format

```json
{
  "v": 1,
  "kind": "dmesh-msg",
  "ts": 1706012345678,
  "senderSignPK": "<base64-32-bytes>",
  "senderBoxPK": "<base64-32-bytes>",
  "recipientBoxPK": "<base64-32-bytes>",
  "ephPK": "<base64-32-bytes>",
  "nonce": "<base64-24-bytes>",
  "ciphertext": "<base64-variable>",
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `v`: Protocol version (currently `1`)
- `kind`: Message type (`"dmesh-msg"`)
- `ts`: Timestamp (Unix milliseconds, JavaScript `Date.now()`)
- `senderSignPK`: Sender's Ed25519 public signing key
- `senderBoxPK`: Sender's X25519 public encryption key
- `recipientBoxPK`: Recipient's X25519 public encryption key
- `ephPK`: Ephemeral X25519 public key (generated per-message)
- `nonce`: Random 24-byte nonce for NaCl box
- `ciphertext`: Encrypted payload
- `signature`: Ed25519 detached signature (64 bytes)

## Cryptographic Operations

### Key Generation

#### Signing Key Pair
```javascript
const signKeyPair = nacl.sign.keyPair();
// signKeyPair.publicKey: 32 bytes (Ed25519)
// signKeyPair.secretKey: 64 bytes (seed + public)
```

#### Box Key Pair
```javascript
const boxKeyPair = nacl.box.keyPair();
// boxKeyPair.publicKey: 32 bytes (X25519)
// boxKeyPair.secretKey: 32 bytes
```

### Fingerprint Derivation
```javascript
const signPKu8 = /* 32-byte Uint8Array */;
const hash = nacl.hash(signPKu8); // SHA-512 → 64 bytes
const fingerprint = base64(hash.slice(0, 16)); // First 16 bytes
```

**Rationale**: Fingerprint derived from signing key ensures identity consistency. 16 bytes (128 bits) provides collision resistance for human-scale networks.

### Encryption Process

#### 1. Ephemeral Key Generation
```javascript
const ephKeyPair = nacl.box.keyPair();
const nonce = nacl.randomBytes(24);
```

#### 2. Payload Construction
```javascript
const payload = {
  v: 1,
  ts: Date.now(),
  content: "User message content"
};
const payloadBytes = utf8Encode(JSON.stringify(payload));
```

#### 3. Authenticated Encryption
```javascript
const sharedSecret = nacl.box.before(recipientBoxPK, ephKeyPair.secretKey);
const ciphertext = nacl.box.after(payloadBytes, nonce, sharedSecret);
```

**Algorithm**: X25519 (ECDH) + XSalsa20 (encryption) + Poly1305 (MAC)

#### 4. Signature Generation

Construct `SignBytes` by concatenating:

| Field | Length | Description |
|-------|--------|-------------|
| `DOMAIN` | 12 bytes | `"DMESH_MSG_V1"` (UTF-8) |
| `senderSignPK` | 32 bytes | Sender's Ed25519 public key |
| `senderBoxPK` | 32 bytes | Sender's X25519 public key |
| `recipientBoxPK` | 32 bytes | Recipient's X25519 public key |
| `ephPK` | 32 bytes | Ephemeral X25519 public key |
| `nonce` | 24 bytes | NaCl box nonce |
| `ts` | 8 bytes | Timestamp (big-endian uint64) |
| `ct_len` | 4 bytes | Ciphertext length (big-endian uint32) |
| `ciphertext` | variable | Encrypted payload |

```javascript
const signBytes = concat([
  DOMAIN,              // "DMESH_MSG_V1"
  senderSignPK,        // 32 bytes
  senderBoxPK,         // 32 bytes
  recipientBoxPK,      // 32 bytes
  ephPK,               // 32 bytes
  nonce,               // 24 bytes
  u64be(ts),           // 8 bytes
  u32be(ciphertext.length), // 4 bytes
  ciphertext           // variable
]);

const signature = nacl.sign.detached(signBytes, senderSignSK);
```

**Domain Separation**: `DMESH_MSG_V1` prevents signature reuse in other protocols.

### Decryption Process

#### 1. Input Validation
- Verify all base64 fields decode correctly
- Verify field lengths:
  - `senderSignPK`: 32 bytes
  - `senderBoxPK`: 32 bytes
  - `recipientBoxPK`: 32 bytes
  - `ephPK`: 32 bytes
  - `nonce`: 24 bytes
  - `signature`: 64 bytes
- Verify `ts` is finite number

#### 2. Timestamp Validation
```javascript
const MAX_SKEW_MS = 10 * 60 * 1000; // 10 minutes
if (Math.abs(Date.now() - msg.ts) > MAX_SKEW_MS) {
  reject("Timestamp skew too large");
}
```

#### 3. Recipient Binding Check
```javascript
if (msg.recipientBoxPK !== base64(myBoxPK)) {
  reject("Not intended for this recipient");
}
```

#### 4. Sender Lookup / TOFU
```javascript
const senderFp = fingerprint(msg.senderSignPK);
let contact = lookupContact(senderFp);

if (!contact && tofuEnabled) {
  // First contact: Trust On First Use
  contact = {
    fp: senderFp,
    name: `TOFU-${senderFp}`,
    signPK: msg.senderSignPK,
    boxPK: msg.senderBoxPK
  };
  saveContact(contact);
} else if (contact) {
  // Known contact: Verify key consistency
  if (contact.signPK !== msg.senderSignPK || contact.boxPK !== msg.senderBoxPK) {
    reject("Key mismatch for known sender");
  }
}
```

#### 5. Signature Verification
Reconstruct identical `SignBytes` (same construction as encryption):
```javascript
const signBytes = buildSignBytes({
  senderSignPK,
  senderBoxPK,
  recipientBoxPK,
  ephPK,
  nonce,
  ts,
  ciphertext
});

const verified = nacl.sign.detached.verify(signBytes, signature, senderSignPK);
if (!verified) {
  reject("Invalid signature");
}
```

#### 6. Replay Check
```javascript
const replayKey = `${senderFp}:${base64(nonce)}`;
if (replayDBContains(replayKey)) {
  reject("Replay detected");
}
replayDBInsert(replayKey, Date.now());
```

Replay database cleanup:
- Retention: 30 days
- Periodic cleanup removes entries older than `REPLAY_RETENTION_MS`

#### 7. Decryption
```javascript
const sharedSecret = nacl.box.before(ephPK, myBoxSK);
const plaintext = nacl.box.open.after(ciphertext, nonce, sharedSecret);
if (!plaintext) {
  reject("Decryption failed");
}

const payload = JSON.parse(utf8Decode(plaintext));
```

## Security Considerations

### Key Separation
- **Why separate signing and box keys?**
  - Different mathematical operations (Ed25519 vs X25519)
  - Signing keys exposed in every message; box keys only for encryption
  - Future: Could rotate box keys without changing identity (signing key)

### Ephemeral Keys (Forward Secrecy Approximation)
- Each message uses fresh `ephPK` / `ephSK`
- If long-term `boxSK` compromised, past messages remain secure (if ephemeral keys destroyed)
- **Not perfect forward secrecy**: Signing key compromise allows impersonation but not decryption of past messages

### Recipient Binding
- `recipientBoxPK` in signature prevents message redirection
- Even if attacker has valid signed message, cannot decrypt with different recipient's key

### Replay Protection
- Nonce uniqueness per sender prevents exact replay
- Timestamp prevents delayed replay (>10 minutes)
- Replay DB prevents nonce reuse within 30-day window

### TOFU Trade-offs
- **Pro**: No centralized PKI needed; works offline
- **Con**: First message vulnerable to MITM
- **Mitigation**: Out-of-band fingerprint verification for critical contacts

## Message Size Limits
- **Maximum payload**: 150 KB (raw content before encryption)
- **Rationale**: Balance between usability and relay-friendliness in degraded networks

## Constants

```javascript
const DB_NAME = "disasterMeshComplete";
const DB_VERSION = 1;
const STORE_KEYS = "keys";
const STORE_CONTACTS = "contacts";
const STORE_REPLAY = "replay";

const MAX_BYTES = 150 * 1024;           // 150 KB
const MAX_SKEW_MS = 10 * 60 * 1000;     // 10 minutes
const REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const DOMAIN = "DMESH_MSG_V1";          // Signature domain separator
```

## Wire Format Notes

### Encoding
- All binary data (keys, nonces, ciphertext, signatures) encoded as **base64** in JSON
- Timestamps as **decimal integers** (JavaScript `number`)
- Text content as **UTF-8** inside payload

### Timestamp Format
- Unix milliseconds (JavaScript `Date.now()`)
- 64-bit big-endian in signature construction
- Must fit JavaScript `number` (53-bit precision safe for dates until year ~285,000)

### Length Encoding in Signature
- Ciphertext length as **32-bit big-endian unsigned integer**
- Prevents length extension attacks

## Test Vectors

(To be added in `/tools`)

Example test vector structure:
```json
{
  "description": "Basic message encryption/decryption",
  "senderSignSK": "<base64>",
  "senderSignPK": "<base64>",
  "senderBoxSK": "<base64>",
  "senderBoxPK": "<base64>",
  "recipientBoxSK": "<base64>",
  "recipientBoxPK": "<base64>",
  "ephSK": "<base64>",
  "ephPK": "<base64>",
  "nonce": "<base64>",
  "ts": 1706012345678,
  "payload": {"v": 1, "ts": 1706012345678, "content": "Hello"},
  "ciphertext": "<base64>",
  "signature": "<base64>",
  "message": { /* full JSON message */ }
}
```

## Version History

### v1 (Current)
- Initial protocol
- Ed25519 + X25519-XSalsa20-Poly1305
- Ephemeral encryption keys
- Recipient binding
- Replay protection (nonce + timestamp)
- TOFU contact model

## Future Protocol Changes

Potential v2 considerations:
- Group messaging
- Key rotation mechanism
- Post-quantum hybrid signatures
- Compressed message format
- Multi-recipient encryption
