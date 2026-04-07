# Threat Model

## Goal
Enable verifiable, tamper-resistant emergency messaging in disaster scenarios where:
- Internet infrastructure may be degraded or intermittent
- Message relay through untrusted intermediaries is necessary
- Device-to-device trust must be established without centralized PKI
- Users may not be cryptography experts
- **Adversaries may possess quantum computers** (v2 threat model extension)

## Assets
1. **Message confidentiality**: Content readable only by intended recipient
2. **Message authenticity**: Receiver can verify sender identity
3. **Message integrity**: Tampering is detectable
4. **Sender identity**: Private keys remain secret
5. **Recipient privacy**: Only intended recipient can decrypt
6. **Long-term harvest resistance**: Ciphertexts collected today cannot be
   decrypted by a future quantum adversary (**harvest-now, decrypt-later**)

## Threat Actors

### Passive Attackers
- **Network eavesdropper**: Observes messages in transit
- **Relay node**: Stores and forwards messages but doesn't modify
- **Capabilities**: Read metadata, traffic analysis, **store ciphertexts for future decryption**
- **Motivation**: Surveillance, intelligence gathering, future intelligence exploitation

### Active Attackers
- **Man-in-the-middle (MITM)**: Intercepts and may modify messages
- **Impersonator**: Attempts to send messages as someone else
- **Replay attacker**: Re-sends previously valid messages
- **Capabilities**: Modify, drop, delay, replay messages
- **Motivation**: Spread misinformation, cause confusion, denial of service

### Quantum Attacker (T9 — v2 addition)
- **Capabilities**: Access to a cryptographically relevant quantum computer
  (CRQC) now or in the near future
- **Classical break**: Can break X25519 (via Shor's algorithm) and Ed25519
  (via variant of Shor's / quantum period finding on elliptic curves)
- **Cannot break**: AES-256, SHA-256, SHA-512, Argon2id, Kyber-1024 (ML-KEM)
- **Strategy**: Harvest encrypted messages today; decrypt when CRQC becomes available
- **Motivation**: Mass surveillance, targeted intelligence, state-level adversaries

### Out of Scope
- **Device compromise**: Attacker has full access to user's device/keys
- **Social engineering**: Tricking users into accepting fake keys
- **Traffic analysis resistance**: Hiding communication patterns
- **Denial of service**: Flooding, resource exhaustion

## Threats and Mitigations

### T1: Message Interception (Confidentiality)
**Threat**: Passive attacker reads message content in transit

**Mitigation**:
- Hybrid authenticated encryption: Kyber-1024 (PQ KEM) + X25519 → XSalsa20-Poly1305
- Ephemeral sender key per message (forward secrecy approximation)
- Only recipient's box private key AND Kyber secret key can decrypt

**Residual Risk**: Metadata (sender/recipient public keys, timestamp) visible

### T2: Message Tampering (Integrity)
**Threat**: Active attacker modifies ciphertext or metadata

**Mitigation**:
- Detached Ed25519-ctx signature covers all message components including
  `kyber_ct`, `recipientKyberPK`, and domain context `"lifeline-mesh-v2"`
- Authenticated encryption (Poly1305 MAC inside NaCl secretbox)
- Hybrid ciphertext binding: substituting either `kyber_ct` or `x25519_ephem_pk`
  invalidates the signature

**Residual Risk**: Attacker can drop messages entirely

### T3: Impersonation (Authenticity)
**Threat**: Attacker sends messages claiming to be someone else

**Mitigation**:
- Ed25519-ctx signature verification with sender's public key and context
  binding `"lifeline-mesh-v2"` (RFC 8032 §5.1)
- Key pinning after first contact (TOFU — Trust On First Use)
- Signature domain separation (`DMESH_MSG_V2_PQ`) prevents cross-protocol attacks

**Residual Risk**:
- First message is vulnerable (TOFU trust assumption)
- User must verify public keys through out-of-band channel for high-security contacts
- Ed25519 is classically secure; quantum break of Ed25519 is a residual risk
  (see T9 below for post-quantum signing roadmap)

### T4: Replay Attacks
**Threat**: Attacker re-sends old valid messages

**Mitigation**:
- Nonce uniqueness tracking per sender (senderFp:nonce)
- Timestamp + expiry validation (v1.1 TTL model)
- Replay database with 30-day retention
- Cleanup of expired replay records

**Residual Risk**:
- If replay DB is reset, old messages could be replayed
- 10-minute window allows limited replay in v1 mode

### T5: Recipient Substitution
**Threat**: Attacker redirects message to different recipient

**Mitigation**:
- Recipient's X25519 box key AND Kyber-1024 public key both bound in signature
- Decryption fails if either recipient key mismatches
- Kyber decapsulation with wrong secret key produces random output
  (implicit rejection by AEAD)

**Residual Risk**: None (cryptographically enforced for both classical and PQ paths)

### T6: Key Confusion Attacks
**Threat**: Attacker causes confusion between signature and encryption keys

**Mitigation**:
- Three distinct key types: Ed25519 (sign), X25519 (classical KEM), Kyber-1024 (PQ KEM)
- All three sender keys included in signed message structure
- Algorithm-specific key length checks enforce separation

**Residual Risk**: None (key separation enforced at protocol level)

### T7: TOFU Initial Trust
**Threat**: Attacker impersonates contact on first message

**Mitigation**:
- Users must verify fingerprints out-of-band for critical contacts
- UI clearly indicates TOFU-registered contacts
- Manual contact addition with verified keys preferred
- v2 identity format includes `kyberPK` — full PQ identity exchange on first contact

**Residual Risk**:
- Users may not verify fingerprints
- Out-of-band channel may be compromised

### T8: Timestamp Manipulation
**Threat**: Attacker changes message timestamp to evade replay protection

**Mitigation**:
- Timestamp included in signed data (both classical and PQ domain)
- Expiry-based validation (v1.1+ model)

**Residual Risk**: Messages can appear within 10-minute window (v1 mode)

### T9: Quantum Computer Attack (v2 — New)
**Threat**: An adversary with a cryptographically relevant quantum computer (CRQC)
targets the confidentiality of Lifeline Mesh messages — either in real-time
or via the **harvest-now, decrypt-later** (HNDL) strategy.

**Attack vectors**:
- Break X25519 (classical KEM) via Shor's algorithm → decrypt archived messages
- Break Ed25519 (signing) via quantum period finding → forge signatures

**Mitigation**:

#### Confidentiality (encryption) — FULLY MITIGATED in v2
- **Kyber-1024 (ML-KEM-1024)**: NIST-standardized lattice-based KEM with
  approximately 256-bit post-quantum security (Category 5 / AES-256 equivalent)
- **Hybrid construction**: `hybridKey = HKDF(kyberSS || x25519SS, "DMESH_HYBRID_V2")`
  — breaking either component alone is insufficient; attacker must break both
  simultaneously
- **HNDL resistance**: Kyber-1024 ciphertexts cannot be decrypted by a future
  CRQC without the Kyber secret key (lattice problems remain hard for quantum computers)

#### Authentication (signing) — PARTIALLY MITIGATED in v2
- **Current**: Ed25519 with context binding (Ed25519-ctx) — NOT quantum-safe
- **Mitigation depth**: Context binding prevents cross-context forgery but
  does not protect against a CRQC that can solve discrete log on Ed25519's curve
- **Planned (v3)**: ML-DSA (CRYSTALS-Dilithium) hybrid: `sign = Ed25519ctx(m) || MLDSA65(m)`
  — post-quantum signing strength without sacrificing classical verifiability
- **Current risk level**: LOW for near-term (5-10 year) quantum timeline;
  message signatures are authenticated per-session; long-term archival forgery
  is the residual risk

**Context binding (Ed25519-ctx) — defense-in-depth**:
- Context string `"lifeline-mesh-v2"` prevents signatures made in one protocol
  version or context from being valid in another
- This is NOT a post-quantum measure; it defends against cross-context replay
  and protocol confusion attacks by classical adversaries

**Residual Risk**:
- Ed25519 signatures remain classically secure; quantum break requires CRQC
  (not yet available as of 2026)
- Message confidentiality is fully protected by Kyber-1024 in v2
- Signature forgery via quantum attack remains a future risk; upgrade to
  ML-DSA is planned for v3

---

## Security Properties

### Guaranteed (v2)
✅ **Confidentiality**: Only recipient can decrypt (Kyber-1024 + X25519 hybrid)
✅ **Integrity**: Tampering detected (Ed25519-ctx + Poly1305)
✅ **Authenticity**: Sender verified (after TOFU, Ed25519-ctx with context binding)
✅ **Recipient binding**: Message tied to specific recipient (both box + Kyber PKs)
✅ **Replay resistance**: Within 30-day window
✅ **Forward secrecy approximation**: Ephemeral X25519 + Kyber encapsulation
✅ **HNDL resistance**: Kyber-1024 ciphertexts safe against harvest-now-decrypt-later

### Not Guaranteed
❌ **Anonymity**: Sender/recipient public keys visible (including Kyber PKs)
❌ **Traffic analysis resistance**: Message patterns observable
❌ **Denial of service resistance**: Attacker can drop messages
❌ **Perfect forward secrecy**: Long-term signing key compromise allows impersonation
❌ **Post-quantum signing**: Ed25519 is not quantum-safe (planned for v3 with ML-DSA)

---

## Key Management Risks

### Risks
- **IndexedDB persistence**: Keys stored in browser storage (vulnerable to XSS, malware)
- **Key backup security**: v1 XOR backups are insecure — migrate to v2 (Argon2id)
- **No key rotation**: Compromised keys must be manually replaced
- **No revocation**: No mechanism to invalidate compromised keys
- **Kyber key size**: Kyber-1024 public keys are 1568 bytes — QR code exchange
  requires larger QR codes or multi-QR workflows

### Mitigations
- Clear warning in UI about key storage risks
- RESET ALL function for emergency key regeneration
- Key backup v2: Argon2id (memory=64MB, time=3, parallelism=4) + XSalsa20-Poly1305
- `tools/migrate-v1-backup.js`: automatic migration from insecure v1 XOR backups
- `npm run validate` enforces backup security check via `--check-all` flag

---

## Assumptions

### Cryptographic
- Ed25519 and X25519 are secure against classical computers
- Kyber-1024 is secure against quantum computers (lattice hard problem)
- HKDF-SHA-256 is a secure KDF for combining shared secrets
- TweetNaCl implementation is correct and constant-time (for classical components)
- Kyber implementation (@noble/post-quantum) is side-channel resistant

### Operational
- Users can exchange public keys through some out-of-band channel initially
- Devices have reasonably accurate clocks
- Browser storage (IndexedDB) is not compromised
- JavaScript execution environment is not tampered with

### Trust
- First contact requires trust (TOFU model)
- Users will verify fingerprints for high-value contacts
- CDN delivering libraries is not compromised (SRI recommended)

---

## Emergency Context Considerations

In disaster scenarios:
- **Degraded infrastructure**: May increase relay through untrusted nodes →
  confidentiality critical; Kyber hybrid provides strong protection
- **Impersonation risk**: Bad actors may spread false information →
  authenticity critical; Ed25519-ctx binding helps
- **Limited verification**: Out-of-band channels may be unavailable →
  TOFU acceptable trade-off
- **Device loss common**: Key backup/recovery essential; use v2 backup format
- **State-level adversaries**: Harvest-now-decrypt-later is a real risk in
  disaster scenarios with high-value communications → Kyber-1024 mandatory in v2

---

## Future Improvements
- **v3 target**: ML-DSA-65 (CRYSTALS-Dilithium) hybrid signing alongside Ed25519-ctx
- Subresource Integrity (SRI) for all CDN dependencies
- Kyber-based key exchange for group SenderKey distribution (replace per-member P2P)
- Better UI for Kyber public key fingerprint verification (multi-QR workflow)
- Traffic analysis resistance via dummy message injection (optional, battery trade-off)
- Key rotation mechanism with CRDT-based revocation propagation
