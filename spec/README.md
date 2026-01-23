# Specification

This directory contains threat models and protocol specifications for Lifeline Mesh.

## Documents

### [THREAT_MODEL.md](./THREAT_MODEL.md)
Comprehensive threat analysis including:
- Threat actors and their capabilities
- Security properties (guaranteed and not guaranteed)
- Specific threats and mitigations (T1-T8)
- Key management risks
- Emergency context considerations

### [PROTOCOL.md](./PROTOCOL.md)
Detailed protocol specification including:
- Message formats (identity and encrypted messages)
- Cryptographic operations (encryption, signing, verification)
- Security considerations
- Constants and parameters
- Wire format details

## Quick Reference

**Cryptographic Primitives**:
- Signing: Ed25519
- Encryption: X25519-XSalsa20-Poly1305
- Hash: SHA-512 (for fingerprints)

**Key Security Properties**:
- ✅ Message confidentiality (only recipient decrypts)
- ✅ Message authenticity (sender verified via signature)
- ✅ Recipient binding (message tied to specific recipient)
- ✅ Replay resistance (30-day window)
- ✅ Forward secrecy approximation (ephemeral encryption keys)
