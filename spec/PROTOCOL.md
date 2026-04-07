# Protocol Specification

## Version
Protocol Version: **2** (field `v: 2`)

Backwards-compatible with v1/v1.1 readers — v2 adds mandatory post-quantum hybrid
key exchange while retaining all v1.1 message fields.

## Overview
Lifeline Mesh v2 uses a **post-quantum hybrid** cryptographic scheme:

- **Signing**: Ed25519 with context binding (Ed25519-ctx, RFC 8032 §5.1)
- **Encryption**: Kyber-1024 KEM + X25519 ECDH → XSalsa20-Poly1305
  - Both ciphertext components are required; either alone is insufficient.
- **Hash**: SHA-512 (fingerprint derivation), SHA-256 (message ID)

Each user maintains **three** key pairs:
| Key Pair | Algorithm | Purpose |
|----------|-----------|---------|
| `signKP` | Ed25519 | Identity, authentication, non-repudiation |
| `boxKP` | X25519 | Classical half of hybrid key exchange |
| `kyberKP` | Kyber-1024 | Post-quantum half of hybrid key exchange |

---

## Message Format

### Public Identity Format (v2)
```json
{
  "v": 2,
  "kind": "dmesh-id",
  "name": "Alice",
  "fp": "<base64-fingerprint-16-bytes>",
  "signPK": "<base64-ed25519-public-32-bytes>",
  "boxPK": "<base64-x25519-public-32-bytes>",
  "kyberPK": "<base64-kyber1024-public-1568-bytes>"
}
```

**Additional field (v2)**:
- `kyberPK`: Kyber-1024 public key (1568 bytes, base64). Required for v2 senders.
  Receivers that do not yet support Kyber MUST treat `kyberPK` as opaque and
  fall back to classical-only decryption (see §Backwards Compatibility).

### Encrypted Message Format (v2)

```json
{
  "v": 2,
  "kind": "dmesh-msg",
  "ts": 1706012345678,
  "exp": 1706616000000,
  "msgId": "<base64-sha256-32-bytes>",
  "senderSignPK": "<base64-32-bytes>",
  "senderBoxPK": "<base64-32-bytes>",
  "senderKyberPK": "<base64-1568-bytes>",
  "recipientBoxPK": "<base64-32-bytes>",
  "recipientKyberPK": "<base64-1568-bytes>",
  "ephPK": "<base64-32-bytes>",
  "hybrid_ciphertext": {
    "kyber_ct": "<base64-kyber1024-ciphertext-1568-bytes>",
    "x25519_ephem_pk": "<base64-32-bytes>"
  },
  "nonce": "<base64-24-bytes>",
  "ciphertext": "<base64-variable>",
  "signature": "<base64-64-bytes>"
}
```

**New fields in v2**:
- `senderKyberPK`: Sender's Kyber-1024 public key (1568 bytes, base64)
- `recipientKyberPK`: Recipient's Kyber-1024 public key (bound in signature)
- `hybrid_ciphertext`: Object containing:
  - `kyber_ct`: Kyber-1024 encapsulation ciphertext (1568 bytes, base64)
  - `x25519_ephem_pk`: Ephemeral X25519 public key (32 bytes, base64)
- `ephPK`: retained for backwards compatibility (equals `hybrid_ciphertext.x25519_ephem_pk`)

---

## Cryptographic Operations (v2)

### Key Generation

#### Signing Key Pair (unchanged)
```javascript
const signKeyPair = nacl.sign.keyPair();
// signKeyPair.publicKey: 32 bytes (Ed25519)
// signKeyPair.secretKey: 64 bytes (seed + public)
```

#### Box Key Pair (unchanged)
```javascript
const boxKeyPair = nacl.box.keyPair();
// boxKeyPair.publicKey: 32 bytes (X25519)
// boxKeyPair.secretKey: 32 bytes
```

#### Kyber-1024 Key Pair (v2)
```javascript
// Using @noble/post-quantum kyber1024
import { kyber1024 } from "@noble/post-quantum/ml-kem";
const kyberKeyPair = kyber1024.keygen();
// kyberKeyPair.publicKey:  1568 bytes (Kyber-1024 pk)
// kyberKeyPair.secretKey:  3168 bytes (Kyber-1024 sk)
```

### Fingerprint Derivation (unchanged)
```javascript
const hash = nacl.hash(signPKu8); // SHA-512 → 64 bytes
const fingerprint = base64(hash.slice(0, 16)); // First 16 bytes
```

### Hybrid Encryption Process (v2)

#### Step 1: Kyber-1024 Key Encapsulation
```javascript
// Encapsulate a 32-byte shared secret from recipient's Kyber public key
const { cipherText: kyber_ct, sharedSecret: kyberSS } =
  kyber1024.encapsulate(recipientKyberPK);
// kyber_ct: 1568 bytes (sent in hybrid_ciphertext.kyber_ct)
// kyberSS:  32 bytes  (combined below)
```

#### Step 2: X25519 Key Agreement
```javascript
const ephKeyPair = nacl.box.keyPair(); // ephemeral X25519 pair
const x25519SS = nacl.scalarMult(ephKeyPair.secretKey, recipientBoxPK); // 32 bytes
// ephKeyPair.publicKey sent in hybrid_ciphertext.x25519_ephem_pk
```

#### Step 3: Hybrid Key Combination (HKDF-SHA-256)
```javascript
// Combine both secrets via HKDF-SHA-256
// IKM = kyberSS || x25519SS (64 bytes)
// Info = "DMESH_HYBRID_V2" (UTF-8, 15 bytes)
// Salt = random 32 bytes (included in hybrid_ciphertext if non-default)
const hybridKey = hkdf_sha256(
  concat(kyberSS, x25519SS),     // IKM: 64 bytes
  "DMESH_HYBRID_V2",             // context label
  32                             // output key length
);
// hybridKey: 32 bytes — used as NaCl secretbox key
```

#### Step 4: Authenticated Encryption
```javascript
const nonce = nacl.randomBytes(24);
const ciphertext = nacl.secretbox(payloadBytes, nonce, hybridKey);
```

#### Step 5: Signature Generation (Ed25519-ctx)

SignBytes construction:

| Field | Length | Description |
|-------|--------|-------------|
| `DOMAIN` | 15 bytes | `"DMESH_MSG_V2_PQ"` (UTF-8) |
| `senderSignPK` | 32 bytes | Sender's Ed25519 public key |
| `senderBoxPK` | 32 bytes | Sender's X25519 public key |
| `senderKyberPK` | 1568 bytes | Sender's Kyber-1024 public key |
| `recipientBoxPK` | 32 bytes | Recipient's X25519 public key |
| `recipientKyberPK` | 1568 bytes | Recipient's Kyber-1024 public key |
| `x25519_ephem_pk` | 32 bytes | Ephemeral X25519 public key |
| `kyber_ct` | 1568 bytes | Kyber encapsulation ciphertext |
| `nonce` | 24 bytes | NaCl secretbox nonce |
| `ts` | 8 bytes | Timestamp (big-endian uint64) |
| `ct_len` | 4 bytes | Ciphertext length (big-endian uint32) |
| `ciphertext` | variable | Encrypted payload |

```javascript
const signBytes = concat([
  utf8("DMESH_MSG_V2_PQ"),  // domain separator
  senderSignPK,              // 32 bytes
  senderBoxPK,               // 32 bytes
  senderKyberPK,             // 1568 bytes
  recipientBoxPK,            // 32 bytes
  recipientKyberPK,          // 1568 bytes
  x25519_ephem_pk,           // 32 bytes
  kyber_ct,                  // 1568 bytes
  nonce,                     // 24 bytes
  u64be(ts),                 // 8 bytes
  u32be(ciphertext.length),  // 4 bytes
  ciphertext                 // variable
]);

// Ed25519-ctx with context binding (RFC 8032 §5.1)
const ctx = utf8("lifeline-mesh-v2"); // 16-byte context string
const signature = ed25519ctx.sign(signBytes, senderSignSK, ctx);
```

**Ed25519-ctx context binding**: prevents cross-context signature reuse.
Context is `"lifeline-mesh-v2"` (16 bytes, ASCII). All v2 messages MUST use
this context. Verifiers MUST reject signatures with incorrect context.

### Hybrid Decryption Process (v2)

#### 1. Input Validation
Verify all required fields are present and have correct byte lengths.
New v2 checks:
- `senderKyberPK`: 1568 bytes
- `recipientKyberPK`: 1568 bytes
- `hybrid_ciphertext.kyber_ct`: 1568 bytes
- `hybrid_ciphertext.x25519_ephem_pk`: 32 bytes

#### 2. Recipient Binding Checks
```javascript
// Classical check (unchanged)
if (msg.recipientBoxPK !== base64(myBoxPK)) reject("Recipient box key mismatch");

// Post-quantum check (new v2)
if (msg.recipientKyberPK !== base64(myKyberPK)) reject("Recipient Kyber key mismatch");
```

#### 3. Signature Verification (Ed25519-ctx)
```javascript
const ctx = utf8("lifeline-mesh-v2");
const valid = ed25519ctx.verify(signBytes, signature, senderSignPK, ctx);
if (!valid) reject("Invalid Ed25519-ctx signature");
```

#### 4. Kyber-1024 Decapsulation
```javascript
const kyberSS = kyber1024.decapsulate(kyber_ct, myKyberSK); // 32 bytes
```

#### 5. X25519 Key Agreement
```javascript
const x25519SS = nacl.scalarMult(myBoxSK, x25519_ephem_pk); // 32 bytes
```

#### 6. Hybrid Key Reconstruction
```javascript
const hybridKey = hkdf_sha256(concat(kyberSS, x25519SS), "DMESH_HYBRID_V2", 32);
```

#### 7. Decryption
```javascript
const plaintext = nacl.secretbox.open(ciphertext, nonce, hybridKey);
if (!plaintext) reject("Decryption failed");
```

---

## Security Considerations

### Post-Quantum Threat Model
Kyber-1024 (NIST ML-KEM-1024) provides approximately 256-bit post-quantum security.
An adversary with a cryptographically relevant quantum computer can break X25519
but not Kyber-1024. The hybrid scheme ensures that:
- Classical security ≥ min(X25519, Kyber-1024)
- Post-quantum security ≥ Kyber-1024 strength

### Key Separation
Three distinct key types prevent cross-algorithm confusion:
- `signKP`: Ed25519 — signing only, never used for encryption
- `boxKP`: X25519 — classical half of hybrid encryption
- `kyberKP`: Kyber-1024 — post-quantum half of hybrid encryption

### Signature Domain Separation
The v2 domain `"DMESH_MSG_V2_PQ"` is distinct from `"DMESH_MSG_V1"`.
A v2 signature cannot be replayed as v1 or vice versa.

### Hybrid Ciphertext Binding
Both `kyber_ct` and `x25519_ephem_pk` are included in the signed data.
An adversary cannot substitute either component without invalidating the signature.

### Backwards Compatibility
- v1/v1.1 receivers MUST ignore unknown fields (`senderKyberPK`, `recipientKyberPK`,
  `hybrid_ciphertext`) to avoid breakage.
- v1/v1.1 receivers that encounter `v: 2` SHOULD display a warning and attempt
  classical-path decryption (stripping hybrid fields), or prompt the user to upgrade.
- v2 senders SHOULD include a v1.1-compatible fallback message for mixed networks
  during the transition period (optional `_v1_fallback` envelope).

---

## Message Size Limits
- **Maximum payload**: 150 KB (raw content before encryption)
- **Kyber overhead**: +1568 bytes (kyber_ct) + 1568 bytes (recipientKyberPK) per message
- **Signature overhead**: increases from ~220 bytes to ~3480 bytes (due to Kyber PK fields)

---

## Constants (v2)

```javascript
const DOMAIN_V2    = "DMESH_MSG_V2_PQ";    // 15 bytes
const CTX_V2       = "lifeline-mesh-v2";   // Ed25519-ctx context, 16 bytes

const KYBER_PK_LEN = 1568;  // Kyber-1024 public key length (bytes)
const KYBER_CT_LEN = 1568;  // Kyber-1024 encapsulation ciphertext length (bytes)
const KYBER_SS_LEN = 32;    // Kyber-1024 shared secret length (bytes)

const HKDF_LABEL   = "DMESH_HYBRID_V2";  // HKDF info string

const MAX_BYTES       = 150 * 1024;
const DEFAULT_TTL_MS  = 7 * 24 * 60 * 60 * 1000;
const SEEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
```

---

## Wire Format Notes

### Encoding (unchanged)
All binary data encoded as **base64** in JSON. Timestamps as **decimal integers**.

### Version Negotiation
Receivers check `v` field first:
- `v === 1` → v1/v1.1 classical path
- `v === 2` → v2 hybrid path (this spec)
- `v > 2` → unknown, receivers SHOULD reject with `"unsupported version"` error

### Field Size Summary

| Field | v1 size | v2 size | Delta |
|-------|---------|---------|-------|
| `senderSignPK` | 32 B | 32 B | — |
| `senderBoxPK` | 32 B | 32 B | — |
| `senderKyberPK` | — | 1568 B | +1568 B |
| `recipientBoxPK` | 32 B | 32 B | — |
| `recipientKyberPK` | — | 1568 B | +1568 B |
| `ephPK` | 32 B | 32 B | — |
| `hybrid_ciphertext.kyber_ct` | — | 1568 B | +1568 B |
| `hybrid_ciphertext.x25519_ephem_pk` | — | 32 B | +32 B |
| `nonce` | 24 B | 24 B | — |
| `signature` | 64 B | 64 B | — |
| **Header total** | ~260 B | ~3420 B | +3160 B |

---

## Protocol v1.1 Extensions (Retained)

All v1.1 extensions remain valid in v2:
- **Message ID** (`msgId`): SHA-256 of ciphertext
- **TTL/Expiration** (`exp`): delay-tolerant networking
- **Chunking** (`dmesh-chunk`): constrained transport support
- **Disaster payload types**: structured emergency formats
- **Group messages** (`dmesh-group-msg`): SenderKey ratchet

Chunked message transport for Kyber-aware nodes MUST account for the larger
v2 header size. Recommended chunk sizes are reduced accordingly:
| Transport | v1.1 chunk | v2 chunk | Notes |
|-----------|------------|----------|-------|
| LoRa | 200 B | 200 B | Header split across multiple chunks |
| BLE GATT | 512 B | 512 B | More chunks per message |
| SMS | 1200 B | 1200 B | More segments required |
| QR (M) | 2048 B | 2048 B | Header may need 2 QR codes |

---

## Group Message Wire Format (v2 extension)

Group messages use a SenderKey ratchet (see spec/group-crdt.md for CRDT integration).

```json
{
  "v": 2,
  "kind": "dmesh-group-msg",
  "groupId": "<base64-16-bytes>",
  "ts": 1706012345678,
  "senderSignPK": "<base64-32-bytes>",
  "senderKyberPK": "<base64-1568-bytes>",
  "senderKeyVersion": 5,
  "nonce": "<base64-24-bytes>",
  "ciphertext": "<base64-variable>",
  "signature": "<base64-64-bytes>",
  "crdt_delta": "<base64-encoded-Yjs-delta>"
}
```

**`crdt_delta`** (v2 extension): Optional Yjs-encoded delta encoding the state
change this message represents. Receivers that understand CRDT MUST apply the
delta to the group's Y.Doc. Receivers that don't understand CRDT MUST ignore
this field.

**Signing domain** for v2 group messages: `"DMESH_GROUP_V2_PQ"`

---

## Relay and Mesh Routing

### Phase 3 Router (v2 — ETX-based)

`bluetooth/mesh-router.js` Phase 3 implementation:

- **ETX (Expected Transmission Count)**: Each link tracks delivery success/fail ratio.
  ETX = 1 / delivery_ratio. Lower ETX = better link quality.
- **Egress selection**: Minimum cumulative ETX to destination (Dijkstra over ETX graph).
- **Loop prevention**: Bloom filter (16-bit, 3 hash functions) + persistent seen-set
  (IndexedDB) for N-hop networks. Bloom filter provides O(1) probabilistic check;
  IndexedDB provides authoritative deduplication on collision.
- **Route advertisement**: ETX values included in `dmesh-route-adv` messages.

```json
{
  "kind": "dmesh-route-adv",
  "src": "<fingerprint>",
  "seq": 42,
  "ts": 1706012345678,
  "routes": [
    { "dst": "<fp>", "hops": 2, "etx": 1.25 }
  ]
}
```

---

## Version History

### v2 (Current)
- Post-quantum hybrid key exchange: Kyber-1024 (ML-KEM-1024) + X25519
- `hybrid_ciphertext` field: carries `kyber_ct` + `x25519_ephem_pk`
- `senderKyberPK` and `recipientKyberPK` bound in signature
- Ed25519-ctx signature with `"lifeline-mesh-v2"` context binding
- Domain separator updated to `"DMESH_MSG_V2_PQ"`
- HKDF-SHA-256 hybrid key derivation (`"DMESH_HYBRID_V2"`)
- CRDT delta field for group messages
- ETX-based routing in Phase 3 mesh router

### v1.1
- Message ID (SHA-256 of ciphertext)
- TTL/Expiration for delay-tolerant networking
- Chunking for constrained transports
- Disaster payload types
- Group messaging (SenderKey ratchet)

### v1.0 (Base)
- Ed25519 signing + X25519-XSalsa20-Poly1305 encryption
- Ephemeral encryption keys
- Recipient binding
- Replay protection (nonce + timestamp)
- TOFU contact model
