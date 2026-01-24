# Threat Model

## Goal
Enable verifiable, tamper-resistant emergency messaging in disaster scenarios where:
- Internet infrastructure may be degraded or intermittent
- Message relay through untrusted intermediaries is necessary
- Device-to-device trust must be established without centralized PKI
- Users may not be cryptography experts

## Assets
1. **Message confidentiality**: Content readable only by intended recipient
2. **Message authenticity**: Receiver can verify sender identity
3. **Message integrity**: Tampering is detectable
4. **Sender identity**: Private keys remain secret
5. **Recipient privacy**: Only intended recipient can decrypt

## Threat Actors

### Passive Attackers
- **Network eavesdropper**: Observes messages in transit
- **Relay node**: Stores and forwards messages but doesn't modify
- **Capabilities**: Read metadata, traffic analysis
- **Motivation**: Surveillance, intelligence gathering

### Active Attackers
- **Man-in-the-middle (MITM)**: Intercepts and may modify messages
- **Impersonator**: Attempts to send messages as someone else
- **Replay attacker**: Re-sends previously valid messages
- **Capabilities**: Modify, drop, delay, replay messages
- **Motivation**: Spread misinformation, cause confusion, denial of service

### Out of Scope
- **Device compromise**: Attacker has full access to user's device/keys
- **Social engineering**: Tricking users into accepting fake keys
- **Traffic analysis resistance**: Hiding communication patterns
- **Denial of service**: Flooding, resource exhaustion
- **Post-quantum attacks**: Quantum computer breaking current crypto

## Threats and Mitigations

### T1: Message Interception (Confidentiality)
**Threat**: Passive attacker reads message content in transit

**Mitigation**:
- Authenticated encryption (NaCl box: X25519-XSalsa20-Poly1305)
- Ephemeral sender key per message (forward secrecy approximation)
- Only recipient's box private key can decrypt

**Residual Risk**: Metadata (sender/recipient public keys, timestamp) visible

### T2: Message Tampering (Integrity)
**Threat**: Active attacker modifies ciphertext or metadata

**Mitigation**:
- Detached signature (Ed25519) covers all message components:
  - Domain separator (`DMESH_MSG_V1`)
  - Sender's sign & box public keys
  - Recipient's box public key
  - Ephemeral public key
  - Nonce
  - Timestamp (8-byte big-endian)
  - Ciphertext length (4-byte big-endian)
  - Ciphertext
- Authenticated encryption (Poly1305 MAC)

**Residual Risk**: Attacker can drop messages entirely

### T3: Impersonation (Authenticity)
**Threat**: Attacker sends messages claiming to be someone else

**Mitigation**:
- Ed25519 signature verification with sender's public key
- Key pinning after first contact (TOFU - Trust On First Use)
- Signature domain separation prevents cross-protocol attacks

**Residual Risk**:
- First message is vulnerable (TOFU trust assumption)
- User must verify public keys through out-of-band channel for high-security contacts

### T4: Replay Attacks
**Threat**: Attacker re-sends old valid messages

**Mitigation**:
- Nonce uniqueness tracking per sender (sender_fp:nonce)
- Timestamp skew check (±10 minutes)
- Replay database with 30-day retention
- Cleanup of expired replay records

**Residual Risk**:
- If replay DB is reset, old messages could be replayed
- 10-minute window allows limited replay

### T5: Recipient Substitution
**Threat**: Attacker redirects message to different recipient

**Mitigation**:
- Recipient's box public key bound in signature
- Decryption fails if recipient mismatch

**Residual Risk**: None (cryptographically enforced)

### T6: Key Confusion Attacks
**Threat**: Attacker causes confusion between signature and encryption keys

**Mitigation**:
- Separate Ed25519 signing keys and X25519 box keys
- Both included in signed message structure

**Residual Risk**: None (key separation enforced)

### T7: TOFU Initial Trust
**Threat**: Attacker impersonates contact on first message

**Mitigation**:
- Users must verify fingerprints out-of-band for critical contacts
- UI clearly indicates TOFU-registered contacts
- Manual contact addition with verified keys preferred

**Residual Risk**:
- Users may not verify fingerprints
- Out-of-band channel may be compromised

### T8: Timestamp Manipulation
**Threat**: Attacker changes message timestamp to evade replay protection

**Mitigation**:
- Timestamp included in signed data
- Skew tolerance limited to ±10 minutes

**Residual Risk**: Messages can appear within 10-minute window

## Security Properties

### Guaranteed
✅ **Confidentiality**: Only recipient can decrypt
✅ **Integrity**: Tampering detected
✅ **Authenticity**: Sender verified (after TOFU)
✅ **Recipient binding**: Message tied to specific recipient
✅ **Replay resistance**: Within 30-day window
✅ **Forward secrecy approximation**: Ephemeral encryption keys

### Not Guaranteed
❌ **Anonymity**: Sender/recipient public keys visible
❌ **Traffic analysis resistance**: Message patterns observable
❌ **Denial of service resistance**: Attacker can drop messages
❌ **Post-quantum security**: Vulnerable to quantum computers
❌ **Perfect forward secrecy**: Long-term signing keys used

## Key Management Risks

### Risks
- **IndexedDB persistence**: Keys stored in browser storage (vulnerable to XSS, malware)
- **No key backup**: Device loss = permanent key loss
- **No key rotation**: Compromised keys must be manually replaced
- **No revocation**: No mechanism to invalidate compromised keys

### Mitigations
- Clear warning in UI about key storage risks
- RESET ALL function for emergency key regeneration
- SRI (Subresource Integrity) for CDN-loaded crypto libraries (when implemented)

## Assumptions

### Cryptographic
- Ed25519 and X25519 are secure against classical computers
- TweetNaCl implementation is correct and constant-time
- Random number generator (browser crypto API) is secure

### Operational
- Users can exchange public keys through some out-of-band channel initially
- Devices have reasonably accurate clocks (±10 minutes acceptable)
- Browser storage (IndexedDB) is not compromised
- JavaScript execution environment is not tampered with

### Trust
- First contact requires trust (TOFU model)
- Users will verify fingerprints for high-value contacts
- CDN delivering TweetNaCl is not compromised (or SRI will be added)

## Emergency Context Considerations

In disaster scenarios:
- **Degraded infrastructure**: May increase relay through untrusted nodes → confidentiality critical
- **Impersonation risk**: Bad actors may spread false information → authenticity critical
- **Limited verification**: Out-of-band channels may be unavailable → TOFU acceptable trade-off
- **Device loss common**: Key backup/recovery out of scope (users warned)

## Future Improvements
- Subresource Integrity (SRI) for CDN dependencies
- Key backup/export mechanism (user-controlled)
- Group messaging with consistent key bindings
- Hybrid post-quantum signatures (when standardized)
- Better UI for fingerprint verification
