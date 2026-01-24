# Frequently Asked Questions (FAQ)

## General

### What is Lifeline Mesh?

Lifeline Mesh is a browser-based end-to-end encrypted messaging system designed for emergency situations. It works offline, requires no server, and can relay messages through any available network (mesh, Bluetooth, USB, radio, etc.).

### Who is this for?

- Emergency responders coordinating during disasters
- Communities preparing for infrastructure disruption
- Anyone needing secure offline-capable messaging
- Developers building resilient communication systems

### How is this different from Signal/WhatsApp/Telegram?

| Feature | Lifeline Mesh | Signal/WhatsApp |
|---------|---------------|-----------------|
| Server required | ❌ No | ✅ Yes |
| Works offline | ✅ Yes | ❌ No |
| Relay-agnostic | ✅ Any network | ❌ Internet only |
| Installation | ❌ None (browser) | ✅ App install required |
| Focus | Emergency use | Daily messaging |

### Is this production-ready?

**No.** This is a prototype/reference implementation. Before production use:
- Add Subresource Integrity (SRI) for CDN scripts
- Consider self-hosting crypto libraries
- Conduct security audit
- Add key backup/export features
- Implement proper key rotation
- Add post-quantum crypto when available

## Security

### How secure is Lifeline Mesh?

**Cryptography**: Industry-standard (Ed25519 + X25519-XSalsa20-Poly1305)

**Guaranteed**:
- ✅ Message confidentiality (only recipient decrypts)
- ✅ Message authenticity (sender verification)
- ✅ Tamper detection
- ✅ Replay resistance (30-day window)
- ✅ Recipient binding (no message redirection)

**Not guaranteed**:
- ❌ Anonymity (sender/recipient visible to relays)
- ❌ Traffic analysis resistance
- ❌ Post-quantum security
- ❌ Perfect forward secrecy (signing keys are long-term)

See [THREAT_MODEL.md](../spec/THREAT_MODEL.md) for details.

### What crypto libraries are used?

- **TweetNaCl** (1.0.3): Audited, compact NaCl implementation
- **TweetNaCl-util** (0.15.1): Base64/UTF-8 utilities

Both loaded from unpkg.com CDN (SRI recommended for production).

### Can messages be decrypted by relays?

**No.** Messages are end-to-end encrypted. Relays only see:
- Encrypted ciphertext
- Sender public key
- Recipient public key
- Timestamp
- Message size

They **cannot** decrypt content without the recipient's secret key.

### What if someone steals my device?

If an attacker gets your device **unlocked**:
- ❌ They can read decrypted messages in browser
- ❌ They can send messages as you
- ❌ They can export your secret keys

**Mitigation**:
- Use device lock screen
- Clear browser data before lending device
- Use "RESET ALL" if device is recovered from untrusted possession

### What about key compromise?

If your **secret keys** are exposed:
- ❌ Attacker can impersonate you (signing key)
- ❌ Attacker can decrypt future messages to you (box key)
- ❌ Past messages remain safe (ephemeral encryption keys)

**Recovery**:
1. Click "RESET ALL" to delete compromised keys
2. Generate new keys
3. Share new public ID with all contacts
4. Warn contacts about compromise

### Is TOFU (Trust On First Use) safe?

**TOFU trade-off**:
- ✅ Pro: Works without centralized PKI or pre-shared keys
- ❌ Con: First message vulnerable to man-in-the-middle

**When to trust TOFU**:
- Emergency situations where you can't verify fingerprints
- Low-stakes initial contact

**When NOT to trust TOFU**:
- Sensitive communications
- High-value targets
- When attacker is known to be active

**Best practice**:
- Use TOFU for initial contact
- Verify fingerprints out-of-band for critical contacts
- UI clearly marks TOFU-added contacts

## Technical

### Why separate signing and encryption keys?

**Security benefits**:
1. **Key separation**: Different crypto operations (Ed25519 vs X25519)
2. **Limited exposure**: Signing key public, box key only for encryption
3. **Future-proof**: Can rotate box keys without changing identity (signing key)

See [PROTOCOL.md](../spec/PROTOCOL.md) § Key Separation.

### What is an ephemeral key?

Each encrypted message uses a **fresh, one-time encryption key pair**:
- Generated randomly per message
- Public key included in message
- Secret key discarded after encryption

**Benefit**: Approximates forward secrecy - if long-term box key is compromised, past messages (with destroyed ephemeral keys) remain secure.

### Why 150KB message size limit?

**Rationale**:
- **Relay-friendly**: Small enough for constrained networks (LoRa, slow radio)
- **Fragmentation-free**: Fits in most network protocols without splitting
- **Emergency context**: Encourages concise, critical information

For larger data, split into multiple messages or use out-of-band file transfer.

### What's in the signature?

The Ed25519 signature covers:
1. Domain separator (`DMESH_MSG_V1`)
2. Sender signing public key
3. Sender box public key
4. Recipient box public key
5. Ephemeral public key
6. Nonce (24 bytes)
7. Timestamp (8 bytes, big-endian)
8. Ciphertext length (4 bytes, big-endian)
9. Ciphertext (all bytes)

See [PROTOCOL.md](../spec/PROTOCOL.md) § Signature Construction.

### Why is timestamp in the signature?

**Prevents**:
- Attacker changing timestamp to evade replay protection
- Attacker making old messages appear fresh

**Timestamp validation**:
- ±10 minutes tolerance (allows for clock skew)
- Messages outside window are rejected

### How does replay protection work?

**Per-sender nonce tracking**:
- Database key: `{sender_fingerprint}:{nonce_base64}`
- First occurrence: Accepted, recorded
- Repeat: Rejected as replay
- Retention: 30 days (then purged)

**Combined with timestamp**:
- Old messages (>10 min) rejected by timestamp check
- Recent duplicates caught by nonce check

### Can I use this with JavaScript disabled?

**No.** Lifeline Mesh requires JavaScript for:
- Cryptographic operations (TweetNaCl)
- Key management (IndexedDB)
- UI interactions

All crypto runs **client-side in your browser**.

### Why browser-based instead of native app?

**Advantages**:
- ✅ No installation required (critical in emergencies)
- ✅ Cross-platform (Windows, Mac, Linux, Android, iOS)
- ✅ Auditable (view source, no opaque binaries)
- ✅ Portable (save HTML file, works offline)

**Disadvantages**:
- ❌ Requires browser (but browsers are ubiquitous)
- ❌ Key storage in IndexedDB (less secure than OS keychain)
- ❌ No background operation (must keep browser open)

## Usage

### Can I use this without Internet?

**Yes!** Lifeline Mesh works completely offline:
1. Save `/app/index.html` to your device
2. Open in browser (no network needed)
3. Generate keys, encrypt/decrypt locally

**Note**: You still need a way to transfer encrypted messages (USB, Bluetooth, QR code, etc.).

### How do I send messages without Internet?

**Relay methods**:
- **Mesh networks**: WiFi Direct, Bluetooth mesh
- **Local relay**: Local HTTP server on LAN
- **Sneakernet**: USB stick, SD card
- **QR codes**: Display on screen, scan with camera
- **Radio**: LoRa, ham radio (encode JSON as text)
- **Physical**: Print encrypted JSON, hand-deliver

The encrypted JSON message can be transmitted through **any channel**.

### What if I lose my device?

**Keys are lost forever**:
- You cannot decrypt old messages
- You cannot send messages as your old identity

**Recovery**:
1. Get new device
2. Generate new keys (different identity)
3. Share new public ID with contacts
4. Ask contacts to send new messages

**Prevention**:
- Export keys from IndexedDB (advanced)
- Write down public ID for identity continuity
- Pre-share public ID with trusted contacts

### Can I have the same identity on multiple devices?

**Not currently supported.**

Each device generates independent keys. To sync identity across devices, you'd need to:
1. Export secret keys from Device A
2. Import to Device B's IndexedDB

**Security risk**: Secret keys in transit are vulnerable. Only do this over secure channel.

### How do I verify a contact's fingerprint?

**Method 1: In-person**
1. Meet contact in person
2. Both open apps and display "My Public ID"
3. Read fingerprint (`fp` field) aloud and compare
4. If match: Save contact

**Method 2: Phone call**
1. Call contact on **verified phone number**
2. Ask them to read their fingerprint aloud
3. Compare with saved contact
4. If mismatch: Warn of potential impersonation

**Method 3: Secure channel**
1. Use previously verified channel (Signal, PGP email)
2. Exchange fingerprints
3. Verify match

**Fingerprint format**: Base64-encoded, 16 bytes (e.g., `AbC123...`)

### What happens if a contact changes their keys?

**If keys change**:
- Decryption fails with "Sender key mismatch" error
- Their old keys are pinned (stored in your contacts)
- New messages from new keys are rejected

**Legitimate key change** (they clicked "RESET ALL"):
1. They share new public ID
2. You delete old contact
3. You add new contact (new fingerprint)
4. Optionally verify new fingerprint out-of-band

**Illegitimate key change** (impersonation attempt):
- **Do not accept** new keys without verification
- Contact them via separate trusted channel to confirm

## Development

### How do I build my own relay?

Lifeline Mesh is **relay-agnostic**. Implement any relay that:
1. Accepts JSON messages
2. Delivers to recipient (by fingerprint or broadcast)
3. Doesn't require decryption (end-to-end encrypted)

**Example: Simple HTTP relay**
```javascript
// Server (Node.js/Express)
const messages = new Map(); // fingerprint -> [messages]

app.post('/send', (req, res) => {
  const msg = req.body; // encrypted JSON
  const recipientFp = msg.recipientBoxPK; // or extract from UI
  if (!messages.has(recipientFp)) messages.set(recipientFp, []);
  messages.get(recipientFp).push(msg);
  res.send({ ok: true });
});

app.get('/receive/:fp', (req, res) => {
  const msgs = messages.get(req.params.fp) || [];
  res.json(msgs);
  messages.delete(req.params.fp); // one-time delivery
});
```

### Can I integrate Lifeline Mesh into my app?

**Yes!** Use the crypto core:

1. Install dependencies:
```bash
npm install tweetnacl tweetnacl-util
```

2. Import crypto core:
```javascript
import * as DMesh from './crypto/core.js';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
```

3. Use functions:
```javascript
// Generate keys
const signKP = DMesh.generateSignKeyPair(nacl);
const boxKP = DMesh.generateBoxKeyPair(nacl);

// Encrypt
const msg = DMesh.encryptMessage({ /* ... */ }, nacl, naclUtil);

// Decrypt
const result = DMesh.decryptMessage({ /* ... */ }, nacl, naclUtil);
```

See [/crypto/README.md](../crypto/README.md) for full API.

### How do I run tests?

```bash
# Crypto core tests
cd crypto
npm install
npm test

# Test vectors
cd tools
npm install
npm run generate-vectors  # Generate test-vectors.json
npm run validate-vectors  # Validate

# SRI generation
npm run generate-sri
```

### How can I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md).

**Areas needing work**:
- Post-quantum crypto integration
- Key backup/export UI
- Mobile-optimized UI
- Relay implementations (Bluetooth, LoRa, etc.)
- Accessibility improvements
- Translations

### Is there a roadmap?

**Current (v1)**:
- ✅ Core crypto (Ed25519 + X25519)
- ✅ Browser UI
- ✅ Offline support
- ✅ Test vectors

**Future (v2+)**:
- Group messaging
- Key rotation mechanism
- Post-quantum signatures (when standardized)
- Mobile app wrappers (Cordova/Capacitor)
- Built-in relay implementations

See [PROJECT_CHARTER.md](../PROJECT_CHARTER.md) for scope.

## Troubleshooting

### IndexedDB quota exceeded

**Cause**: Too many contacts/replay records

**Solution**:
- Click "RESET ALL" (deletes everything)
- Or use browser tools to clear IndexedDB for this origin

### Keys disappear after closing browser

**Cause**: Using private/incognito mode (doesn't persist storage)

**Solution**: Use normal browser mode

### "CDN script failed to load"

**Cause**: Network issue, CDN down, or CSP blocking

**Solution**:
- Check network connection
- Try different network
- Self-host TweetNaCl (download and serve locally)

### UI is in Japanese, can I change language?

**Currently**: UI has mixed Japanese/English

**Future**: Full i18n support planned

**Workaround**: Edit `/app/index.html` text content directly

## Contact & Support

- **Issues**: [GitHub Issues](https://github.com/hiroshitanaka-creator/lifeline-mesh/issues)
- **Security vulnerabilities**: Use GitHub private vulnerability reporting (see [SECURITY.md](../SECURITY.md))
- **Questions**: Open a GitHub Discussion

**This is a community project.** No official support or warranties provided. Use at your own risk, especially in critical situations.
