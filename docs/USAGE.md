# Usage Guide

Complete guide for using Lifeline Mesh for emergency messaging.

## Quick Start

### 1. Access the Demo

Open `/app/index.html` in your web browser (Chrome, Firefox, Safari, or Edge).

**No installation required** - it runs entirely in your browser.

### 2. Generate Your Keys

Click **"Generate / Load Keys"** button.

Your keys are generated and stored locally in your browser's IndexedDB. They include:
- **Signing keys** (Ed25519): For message authentication
- **Box keys** (X25519): For message encryption
- **Fingerprint**: Derived from your signing public key (for identity verification)

**Your public ID** will be displayed in JSON format:

```json
{
  "v": 1,
  "kind": "dmesh-id",
  "name": "(optional)",
  "fp": "abc123...",
  "signPK": "...",
  "boxPK": "..."
}
```

### 3. Share Your Public ID

Click **"Copy My Public ID"** and share it with your contacts through any channel:
- QR code (display on screen, scan with phone)
- Text message
- Email
- Physical paper (write down or print)

**Important**: Only share your **Public ID**, never share the secret keys!

### 4. Add Contacts

When someone shares their Public ID with you:

1. Paste their Public ID JSON into the **"連絡先登録"** textarea
2. Click **"Add / Update Contact"**
3. Their contact appears in the dropdown list

**Security Note**: The first time you add a contact, you should verify their fingerprint through an out-of-band channel (phone call, in-person meeting, etc.) to prevent impersonation.

### 5. Send Encrypted Message

1. Type your message in the **"Content"** textarea (max 150KB)
2. Select the recipient from the dropdown
3. Click **"Encrypt"**
4. Copy the encrypted JSON message

**Share the encrypted message** with the recipient through any relay method:
- Mesh network
- Bluetooth
- USB stick
- Public bulletin board
- Radio transmission (if using text encoding)

## Emergency Mode (Simplified)

Emergency Mode is designed for stressed conditions and reduces the path to a small set of form inputs.

1. In **Mode**, choose **Emergency Mode (Simplified)**.
2. In **Emergency Quick Message**, select a structured template:
   - Safety check
   - Supply request
   - Evacuation notice
   - Medical assistance
   - Shelter status
3. Fill the form fields (name/team, location, status/need, people count, details).
4. Click **Create Emergency Message** to populate the main message content.
5. Select recipient and click **Encrypt**.

Notes:
- If message content already exists, the app shows an in-app overwrite panel (no browser confirm dialog).
- Mode selection is saved locally, so the app reopens in the last used mode.
- **Advanced Mode** remains available for full contact/group/BLE workflows.

### 6. Receive and Decrypt Messages

When you receive an encrypted message:

1. Paste the encrypted JSON into the **"Decrypt"** section
2. (Optional) Enable **TOFU** if you want to auto-accept unknown senders
3. Click **"Decrypt"**

The message will be:
- ✅ Verified for authenticity (sender is who they claim to be)
- ✅ Checked for tampering (signature valid)
- ✅ Checked for replay (not a re-sent old message)
- ✅ Decrypted and displayed

## Advanced Features

### TOFU (Trust On First Use)

**What is TOFU?**
- Automatically accepts and saves unknown senders on first message
- Subsequent messages from that sender must use the same keys (key pinning)

**When to use:**
- Emergency situations where you can't verify fingerprints
- Initial setup with many contacts

**Security trade-off:**
- First message is vulnerable to impersonation
- After first contact, key switching is detected and rejected

**Best practice:**
- Use TOFU for initial contact
- Verify fingerprints out-of-band for critical contacts later

### Replay Protection

Every message is checked against a replay database:
- **Nonce uniqueness**: Each sender+nonce combination can only be used once
- **Timestamp validation**: Messages more than ±10 minutes old are rejected
- **Retention**: Replay records kept for 30 days

### Reset All Data

**"RESET ALL"** button deletes:
- Your keys (irreversible!)
- All contacts
- Replay protection database

Use only if:
- You want to start fresh
- Your keys are compromised
- Testing/development

**Warning**: After reset, you cannot decrypt old messages and must share new public ID with all contacts.

## Message Flow

```
Alice                          Relay Network                    Bob
  |                                  |                           |
  | 1. Encrypt message               |                           |
  |    - Generate ephemeral key      |                           |
  |    - ECDH with Bob's boxPK       |                           |
  |    - Encrypt with XSalsa20       |                           |
  |    - Sign with Ed25519           |                           |
  |                                  |                           |
  | 2. Send encrypted JSON --------> | 3. Forward ------------> |
  |                                  |                           |
  |                                  |                      4. Receive
  |                                  |                           |
  |                                  |                      5. Verify
  |                                  |                         - Timestamp
  |                                  |                         - Recipient
  |                                  |                         - Signature
  |                                  |                         - Replay
  |                                  |                           |
  |                                  |                      6. Decrypt
  |                                  |                         - ECDH
  |                                  |                         - XSalsa20
  |                                  |                           |
  |                                  |                      7. Read message
```

## Security Best Practices

### Key Management

1. **Backup your keys** (optional, but recommended):
   - Use browser's IndexedDB export tools
   - Store encrypted backup in secure location
   - **Never** share secret keys

2. **Verify fingerprints** for critical contacts:
   - Compare fingerprints in person or over trusted channel
   - Write down verified fingerprints
   - Check regularly for key changes

3. **Rotate keys** if compromised:
   - Click "RESET ALL"
   - Generate new keys
   - Redistribute new public ID

### Message Security

1. **Keep messages short**: 150KB limit enforces brevity
2. **Don't include sensitive metadata**: Message timestamps are visible
3. **Assume relays can see**:
   - Sender public key
   - Recipient public key
   - Message size
   - Timestamp

4. **Use multiple relays**: Don't rely on single point of failure

### Operational Security

1. **Device security**:
   - Use trusted devices only
   - Keep browser updated
   - Enable screen lock
   - Clear sensitive data before lending device

2. **Network security**:
   - Assume all networks are monitored
   - Messages are encrypted end-to-end regardless of network
   - Metadata (who talks to whom) may leak

3. **Emergency procedures**:
   - Pre-share public IDs with trusted contacts before emergency
   - Print public ID on paper as backup
   - Memorize or write down key contacts' fingerprints

## Troubleshooting

### "Invalid signature" error
- Sender's keys have changed (security risk!)
- Message was tampered with
- Corrupted transmission
- **Action**: Ask sender to resend, verify their current public ID

### "Timestamp skew too large" error
- Your device clock is wrong (>10 minutes off)
- Message is very old (>10 minutes)
- **Action**: Sync your clock, ask sender to resend fresh message

### "Replay detected" error
- Same message was received before
- Legitimate resend by sender (they should create new message instead)
- Replay attack attempt
- **Action**: Ask sender to create new message, not resend old one

### "Not intended for this recipient" error
- Message was sent to someone else
- You're using wrong keys
- **Action**: Verify you loaded correct keys, ask sender to verify recipient

### "Decryption failed" error
- Corrupted ciphertext
- Wrong recipient keys
- Transmission error
- **Action**: Ask sender to resend

### Keys not loading
- Browser's IndexedDB disabled
- Private/incognito mode (doesn't persist)
- Browser storage quota exceeded
- **Action**: Use normal browser mode, clear some storage

## Offline Usage

Lifeline Mesh works completely offline:

## Storage Migration (lifelineMesh → lifelineMeshV2)

Recent versions migrate browser data from the legacy IndexedDB (`lifelineMesh`) to the new database (`lifelineMeshV2`) on startup.

### What gets migrated

- Your key entries (`my_sign_pk`, `my_sign_sk`, `my_box_pk`, `my_box_sk`)
- Contacts from the legacy `contacts` store
- Replay-protection entries from `replay` into the new `seen` store

### Safety characteristics

- Migration is **non-destructive** and only fills missing data in `lifelineMeshV2`
- A migration marker is stored to avoid repeated writes
- Legacy DB is left intact so rollback/recovery remains possible

### Recommended upgrade procedure

1. Open the updated app once while online or offline (migration runs locally in browser).
2. Confirm your public ID and contacts are visible.
3. Send and decrypt one test message.
4. Export keys as backup after confirming successful migration.

If something looks wrong, do **not** reset data immediately. First export what is visible and compare against your previous backup.

### Rollback and re-run procedure (when migration fails)

If the startup migration fails or `lifelineMeshV2` appears incomplete, use this operational runbook:

1. **Stop writes immediately**: keep the app open in one tab only and do not press `RESET ALL`.
2. **Preserve evidence**: export browser console logs and take screenshots of missing contacts/keys.
3. **Backup both databases**:
   - `lifelineMeshV2` (new DB)
   - `lifelineMesh` (legacy DB)
4. **Rollback to legacy read path**:
   - Use the previous app build that still reads `lifelineMesh` directly.
   - Verify keys, contacts, and a decrypt operation from legacy data.
5. **Fix forward and re-run migration**:
   - Return to the latest build after the migration issue is fixed.
   - Reload once so migration runs again (idempotent for already-copied records).
   - Re-verify public ID, contact count, and one send/decrypt roundtrip.
6. **Escalate if mismatch remains**: attach exported logs + DB snapshots to incident ticket before any manual data edits.

**Important**: only clear storage after maintainers confirm both DB backups are safely captured and no further recovery path remains.

### Offline operation steps

1. **Open `/app/index.html` locally** (save HTML file to device)
2. **Generate keys offline** (uses browser's crypto API)
3. **Encrypt messages offline**
4. **Transfer encrypted messages** via any method:
   - QR codes
   - Bluetooth file transfer
   - USB stick
   - Mesh network when available
   - Radio (encode as text/hex)

5. **Decrypt offline** (no network required)

## Integration with Relay Networks

Lifeline Mesh is **relay-agnostic**. Encrypted messages are JSON objects that can be transmitted through:

### Manual Relay
- Copy/paste encrypted JSON
- Share via any messaging app
- Store on shared drive

### Automated Relay
- HTTP POST to relay server
- MQTT pub/sub
- WebSocket
- Bluetooth mesh
- LoRa/radio packet networks

### Example: HTTP Relay
```javascript
// Send
const encrypted = /* ... encrypted message from UI ... */;
await fetch('https://relay.example.com/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(encrypted)
});

// Receive
const messages = await fetch('https://relay.example.com/messages/for/MY_FINGERPRINT').then(r => r.json());
// Paste each message into decrypt UI
```

## Performance Notes

- **Key generation**: ~100ms (one-time)
- **Encryption**: ~1-10ms (depends on message size)
- **Decryption**: ~1-10ms (includes signature verification)
- **Max message size**: 150KB (keeps relay-friendly)

## Browser Compatibility

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Requires:
- Web Crypto API (for secure random numbers)
- IndexedDB (for key storage)
- ES6+ JavaScript

## Next Steps

- Read [FAQ](./FAQ.md) for common questions
- Review [THREAT_MODEL.md](../spec/THREAT_MODEL.md) for security details
- Check [PROTOCOL.md](../spec/PROTOCOL.md) for technical specification
