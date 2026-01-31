# Lifeline Mesh Sync Protocol v1.0

Store-carry-forward synchronization protocol for delay-tolerant disaster mesh networking.

## Overview

The Sync Protocol enables two peers to efficiently exchange messages without centralized infrastructure. It operates over any transport (QR, Bluetooth, file, etc.) and is designed for:

- **Extreme delays**: Messages may take hours or days to reach recipients
- **Intermittent connectivity**: Peers connect briefly and infrequently
- **Resource constraints**: Minimal bandwidth, battery, and storage
- **Untrusted relays**: Messages are self-authenticating (signed + encrypted)

## Protocol Phases

```
    Peer A                          Peer B
       |                               |
       |------- 1. HELLO ------------->|
       |<------ 1. HELLO --------------|
       |                               |
       |------- 2. INV --------------->|
       |<------ 2. INV ----------------|
       |                               |
       |<------ 3. GET ----------------|
       |------- 4. DATA -------------->|
       |                               |
       |------- 3. GET --------------->|
       |<------ 4. DATA ---------------|
       |                               |
       |------- 5. ACK --------------->|
       |<------ 5. ACK ----------------|
       |                               |
```

## Frame Format

All frames are JSON objects with a common header:

```json
{
  "v": 1,
  "kind": "sync-<type>",
  "ts": 1706012345678,
  ...
}
```

### 1. HELLO Frame

Exchanged first to establish peer identity and capabilities.

```json
{
  "v": 1,
  "kind": "sync-hello",
  "ts": 1706012345678,
  "peerFp": "<base64-16-bytes>",
  "peerSignPK": "<base64-32-bytes>",
  "capabilities": {
    "maxMsgSize": 153600,
    "maxInvCount": 1000,
    "maxChunks": 50,
    "supportedKinds": ["dmesh-msg", "dmesh-chunk"],
    "protocolVersion": "1.1"
  },
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `peerFp`: Peer's fingerprint (first 16 bytes of SHA-512(signPK))
- `peerSignPK`: Peer's Ed25519 signing public key
- `capabilities`: What this peer can handle
  - `maxMsgSize`: Maximum message size in bytes
  - `maxInvCount`: Maximum inventory items per INV frame
  - `maxChunks`: Maximum chunks to receive at once
  - `supportedKinds`: Message types this peer accepts
  - `protocolVersion`: Lifeline Mesh protocol version
- `signature`: Ed25519 signature of `v || kind || ts || peerFp || peerSignPK || capabilities_json`

**Validation**:
1. Verify signature against `peerSignPK`
2. Verify `peerFp` matches SHA-512(peerSignPK)[0:16]
3. Check `ts` is within reasonable bounds (optional, for freshness)

### 2. INV (Inventory) Frame

Declares which messages this peer has available for sharing.

```json
{
  "v": 1,
  "kind": "sync-inv",
  "ts": 1706012345678,
  "items": [
    {
      "msgId": "<base64-32-bytes>",
      "exp": 1706616000000,
      "size": 1234,
      "priority": 3
    }
  ],
  "bloom": "<base64-bloom-filter>",
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `items`: Array of message metadata (up to `maxInvCount`)
  - `msgId`: Message ID (SHA-256 of ciphertext)
  - `exp`: Expiration timestamp
  - `size`: Message size in bytes
  - `priority`: Delivery priority (0-5, higher = more urgent)
- `bloom`: Optional Bloom filter for larger inventories
- `signature`: Ed25519 signature

**Priority Levels** (based on message type):
| Priority | Type | Example |
|----------|------|---------|
| 5 | critical | `medical`, `need_help` with urgency=critical |
| 4 | high | `need_help` with urgency=high |
| 3 | medium | `shelter_info`, `supplies` |
| 2 | normal | `im_safe` |
| 1 | low | `text` (general messages) |
| 0 | bulk | Large files, non-urgent data |

**Filtering**:
- Exclude expired messages (`exp < now`)
- Exclude messages already sent to this peer (`forwarded` table)
- Exclude messages from this peer (they already have them)

### 3. GET Frame

Request specific messages from peer's inventory.

```json
{
  "v": 1,
  "kind": "sync-get",
  "ts": 1706012345678,
  "want": [
    "<msgId-1>",
    "<msgId-2>"
  ],
  "maxBytes": 50000,
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `want`: Array of msgIds to request
- `maxBytes`: Maximum total bytes to receive in response
- `signature`: Ed25519 signature

**Selection Strategy** (receiver side):
1. Filter out messages already in `seen` table
2. Sort by priority (highest first)
3. Take top N that fit within `maxBytes`

### 4. DATA Frame

Deliver requested messages.

```json
{
  "v": 1,
  "kind": "sync-data",
  "ts": 1706012345678,
  "messages": [
    { /* dmesh-msg or dmesh-chunk */ }
  ],
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `messages`: Array of message objects (dmesh-msg or dmesh-chunk)
- `signature`: Ed25519 signature of frame header + msgId list

**Chunked Messages**:
- If message is too large for transport, send as `dmesh-chunk` objects
- Receiver reassembles using `msgId` and `seq`

### 5. ACK Frame

Acknowledge receipt of messages (enables delivery confirmation).

```json
{
  "v": 1,
  "kind": "sync-ack",
  "ts": 1706012345678,
  "received": [
    "<msgId-1>",
    "<msgId-2>"
  ],
  "signature": "<base64-64-bytes>"
}
```

**Fields**:
- `received`: Array of successfully received msgIds
- `signature`: Ed25519 signature

**On Receipt**:
- Sender marks messages as `forwarded` to this peer
- If ACK reaches original sender, message can be removed from outbox

## Store Integration

### Database Schema Extensions

```javascript
// forwarded: Track which peers have received which messages
{
  key: `${peerFp}:${msgId}`,
  peerFp: "<base64>",
  msgId: "<base64>",
  forwardedAt: 1706012345678
}

// peers: Known sync peers
{
  fp: "<base64-16-bytes>",
  signPK: "<base64-32-bytes>",
  lastSeen: 1706012345678,
  capabilities: { ... },
  trustLevel: "verified" | "unverified"
}

// delivery_receipts: Track delivery confirmations
{
  msgId: "<base64>",
  recipientFp: "<base64>",
  confirmedAt: 1706012345678,
  hopCount: 2
}
```

### Sync State Machine

```
IDLE
  |
  v
HELLO_SENT --> HELLO_RECEIVED
  |                   |
  v                   v
INV_SENT -----> INV_RECEIVED
  |                   |
  v                   v
GET_SENT -----> DATA_RECEIVED
  |                   |
  v                   v
ACK_SENT -----> COMPLETE
```

## Security Considerations

### DoS Protection

1. **Rate Limiting**: Max N sync sessions per minute per peer
2. **Size Limits**: Enforce `maxMsgSize`, `maxInvCount`, `maxChunks`
3. **Expiration Enforcement**: Immediately reject expired messages
4. **Signature Verification**: All frames must be signed

### Spam Prevention

1. **Proof of Contact**: Only sync with peers whose HELLO was verified
2. **Priority Throttling**: Low-priority messages limited per peer per day
3. **Storage Quotas**: Maximum messages per sender fingerprint

### Privacy

1. **Inventory Metadata**: INV reveals what messages you're carrying
   - Mitigation: Use Bloom filter for large inventories
   - Future: Encrypted INV with shared secrets
2. **Traffic Analysis**: Sync patterns reveal social graph
   - Mitigation: Dummy traffic, delayed responses

## Transport Bindings

### QR Code Sync

Sequential QR scanning for low-bandwidth sync:

1. Display HELLO QR, scan peer's HELLO QR
2. Display INV QR (may require multiple scans for chunked INV)
3. Scan GET QR
4. Display DATA QRs (chunked as needed)
5. Scan ACK QR

### File Sync

Bundle exchange via AirDrop, USB, etc.:

```
sync-bundle.dmesh
├── hello.json
├── inv.json
└── messages/
    ├── <msgId-1>.json
    └── <msgId-2>.json
```

### Bluetooth Sync

Using BLE GATT characteristics:
- `SYNC_HELLO_CHAR`: Write HELLO, read peer's HELLO
- `SYNC_INV_CHAR`: Write INV, read peer's INV
- `SYNC_DATA_CHAR`: Write GET, read DATA (chunked via MTU)
- `SYNC_ACK_CHAR`: Write ACK

## Implementation Pseudocode

```javascript
async function performSync(transport, peerFp) {
  // 1. Exchange HELLO
  const myHello = createHello(myKeys, myCapabilities);
  await transport.send(myHello);
  const peerHello = await transport.receive();
  validateHello(peerHello);

  // 2. Exchange INV
  const myInv = createInventory(outbox, seen, peerFp);
  await transport.send(myInv);
  const peerInv = await transport.receive();
  validateInv(peerInv);

  // 3. Determine wants
  const wants = selectWants(peerInv.items, seen, maxBytes);

  // 4. Request messages
  if (wants.length > 0) {
    const get = createGet(wants);
    await transport.send(get);
    const data = await transport.receive();
    validateData(data);

    // Process received messages
    for (const msg of data.messages) {
      if (msg.kind === "dmesh-msg") {
        await processMessage(msg);
      } else if (msg.kind === "dmesh-chunk") {
        await processChunk(msg);
      }
    }

    // Send ACK
    const ack = createAck(data.messages.map(m => m.msgId));
    await transport.send(ack);
  }

  // 5. Handle peer's requests
  const peerGet = await transport.receive();
  if (peerGet) {
    const dataToSend = selectMessages(peerGet.want, outbox);
    await transport.send(createData(dataToSend));
    const peerAck = await transport.receive();
    markForwarded(peerFp, peerAck.received);
  }
}
```

## Future Extensions

### v1.1 Considerations

- **Encrypted INV**: Hide inventory from passive observers
- **Routing Hints**: Include hop count, geographic hints
- **Selective Forwarding**: Reputation-based relay decisions
- **Compression**: zstd for DATA frames
- **Aggregated ACKs**: Batch delivery confirmations

### Multi-hop Delivery Receipts

When message reaches final recipient:
1. Recipient creates signed receipt
2. Receipt propagates back through mesh
3. Original sender receives confirmation
4. Message removed from outbox

```json
{
  "v": 1,
  "kind": "sync-receipt",
  "msgId": "<base64>",
  "recipientFp": "<base64>",
  "receivedAt": 1706012345678,
  "hopCount": 3,
  "signature": "<base64>"
}
```
