# Group CRDT Specification

## Overview

This document specifies the **Conflict-free Replicated Data Type (CRDT)** layer
for Lifeline Mesh group messaging. The design is **Yjs-compatible** and follows
the **delta-CRDT** model, enabling offline-first synchronization across an
intermittently connected mesh network.

## Goals

- Causal consistency without a central server
- Offline composition: messages created offline merge correctly upon reconnection
- Eventual convergence: all peers that receive the same set of deltas converge
  to the same state, regardless of delivery order
- Sender Key ratchet integration: CRDT deltas carry SenderKey ratchet state
- Integration with IndexedDB: Y.Doc persistence via `y-indexeddb` provider

---

## Data Model

A group is represented as a single **Y.Doc** containing two shared data structures:

### 1. `messages` — Y.Array (message log)

Each element is a **Y.Map** with the following schema:

```
{
  msgId:        string        // SHA-256 of ciphertext, base64 (unique per message)
  ts:           number        // Unix ms (Lamport-calibrated, see §Ordering)
  lamport:      number        // Lamport timestamp (monotonically increasing)
  vectorClock:  object        // { [senderFp: string]: number } — causal clock
  senderFp:     string        // Sender fingerprint (Ed25519 pubkey hash)
  kind:         string        // "dmesh-group-msg" | "system-event"
  ciphertext:   string        // base64 encrypted payload
  senderKeyVer: number        // SenderKey chain version at time of send
  delivered:    boolean       // local delivery flag (non-replicated via CRDT)
}
```

**Ordering semantics**:
1. Primary sort: `lamport` (strict causal order)
2. Secondary sort: `ts` (wall-clock tiebreak)
3. Tertiary sort: `msgId` lexicographic (deterministic, avoids split-brain rendering)

### 2. `membership` — Y.Map (group roster)

Key: `senderFp` (string)
Value: **Y.Map** with:
```
{
  name:       string   // Display name at join time
  joinedAt:   number   // Unix ms
  addedBy:    string   // Fingerprint of peer who added this member (or "self")
  status:     string   // "active" | "removed"
  removedAt?: number   // Unix ms (if removed)
  removedBy?: string   // Fingerprint of peer who removed them
  kyberPK:    string   // base64 Kyber-1024 public key (for sender key distribution)
  boxPK:      string   // base64 X25519 public key
  signPK:     string   // base64 Ed25519 signing key
}
```

---

## Vector Clock + Lamport Timestamp Ordering

Each node maintains:
- A **Lamport clock** `L` initialized to 0
- A **vector clock** `VC` mapping `senderFp → max_lamport_seen`

### Rules

**On send**:
```
L = max(L, max(VC.values())) + 1
msg.lamport = L
msg.vectorClock = { ...VC, [selfFp]: L }
VC[selfFp] = L
```

**On receive** (message `m` from peer):
```
L = max(L, m.lamport) + 1
For each (fp, t) in m.vectorClock:
    VC[fp] = max(VC[fp] ?? 0, t)
VC[selfFp] = L
```

**Causal delivery gate**: A message `m` from `senderFp` is **causally ready** to
deliver when:
```
for all (fp, t) in m.vectorClock where fp !== senderFp:
    VC[fp] >= t
```

Messages that are not yet causally ready are buffered in the **causal buffer** and
re-evaluated on each new message arrival.

---

## Delta-CRDT Synchronization Protocol

### Delta Generation

Each state change produces a **delta** — a minimal Y.Doc update that contains
only the changed Y.Map entries. Deltas are encoded using `Y.encodeStateAsUpdateV2`.

```javascript
// Generating a delta after inserting a new message
const beforeSV = Y.encodeStateVector(ydoc);
// ... apply changes to ydoc ...
const delta = Y.encodeStateAsUpdateV2(ydoc, beforeSV);
// delta: Uint8Array — this is the CRDT delta to broadcast
```

### Delta Integration

Receivers apply deltas using `Y.applyUpdateV2`:
```javascript
Y.applyUpdateV2(ydoc, incomingDelta);
// Yjs handles merging automatically; no conflict resolution needed
```

### Wire Transport

CRDT deltas are piggy-backed on group messages in the `crdt_delta` field
(see PROTOCOL.md §Group Message Wire Format). They can also be sent as
standalone `dmesh-crdt-sync` messages during sync:

```json
{
  "v": 2,
  "kind": "dmesh-crdt-sync",
  "groupId": "<base64-16-bytes>",
  "ts": 1706012345678,
  "senderFp": "<fingerprint>",
  "stateVector": "<base64-Y-state-vector>",
  "delta": "<base64-Yjs-updateV2>"
}
```

**Sync handshake**:
1. Peer A sends `dmesh-crdt-sync` with its `stateVector` (no `delta`).
2. Peer B responds with a `delta` = `Y.encodeStateAsUpdateV2(ydoc, peerA_stateVector)`.
3. Peer A applies the delta. Optionally sends its own delta back.

---

## SenderKey Ratchet Integration with CRDT Delta

The SenderKey ratchet state (chain key version) is embedded in CRDT deltas to
enable consistent ratchet advancement across the distributed group.

### SenderKey State in Y.Doc

A third Y.Map `senderKeys` stores ratchet state per member:

Key: `senderFp`
Value: Y.Map:
```
{
  version:    number   // Current chain key version
  chainKey:   string   // base64 current chain key (encrypted to self for local storage)
  updatedAt:  number   // Unix ms of last ratchet step
}
```

### Ratchet Advancement Rule

When a message is sent:
1. Derive message key from `chainKey` at `version V`
2. Advance: `chainKey = HMAC-SHA256(chainKey, "ratchet")`, `version = V + 1`
3. Update `senderKeys[selfFp]` in the Y.Doc
4. Include the resulting CRDT delta (which carries the new `version`) in the
   message's `crdt_delta` field.

Receivers use `senderKeyVersion` from the wire message to locate the correct
derived message key. If `senderKeyVersion` is ahead of local state, the receiver
must await delivery of intermediate CRDT deltas (causal buffer applies).

---

## Membership Changes and SenderKey Rotation

### Member Add
1. Creator generates new `groupId`-scoped SenderKey set.
2. Distributes encrypted SenderKey to each current member (P2P, not broadcast).
3. Adds new member entry to `membership` Y.Map.
4. Broadcasts `membership` delta to all peers.

### Member Remove
1. Set `status = "removed"` and `removedAt` in `membership[fp]`.
2. **Rotate** entire group SenderKey (new chain key for self, redistribute to
   remaining active members).
3. New SenderKey version is reflected in `senderKeys` CRDT delta.

### Why rotation is mandatory on remove
A removed member retains their old chain key. Without rotation, they could
decrypt future messages if they were replayed or if they retained the derivation
chain. After rotation, their chain key is invalidated.

---

## IndexedDB Persistence

The Y.Doc is persisted using `y-indexeddb` with the following store names:

| Y.Doc name | IndexedDB store | Contents |
|------------|----------------|----------|
| `group-<groupId>-doc` | `crdt-ydocs` | Full Y.Doc binary (regular snapshots) |
| `group-<groupId>-updates` | `crdt-updates` | Pending unmerged updates (append-only log) |

**Compaction**: Periodically merge pending updates into the main snapshot:
```javascript
const snapshot = Y.encodeStateAsUpdateV2(ydoc);
await idb.put("crdt-ydocs", snapshot, docName);
await idb.clear("crdt-updates", docName);
```
Compaction is triggered when `crdt-updates` exceeds 500 entries or 1 MB.

---

## Outbox CRDT-Delta Serialization

When a group message is queued in the outbox (IndexedDB `outbox` store), the
associated CRDT delta is stored alongside it:

```javascript
{
  msgId:     "<msgId>",
  message:   { /* dmesh-group-msg envelope */ },
  crdtDelta: "<base64-encoded-Yjs-updateV2>",  // new field
  groupId:   "<groupId>",
  priority:  OUTBOX_PRIORITY.NORMAL,
  status:    DELIVERY_STATUS.PENDING,
  // ... other outbox fields
}
```

On delivery, the `crdtDelta` is decoded and appended to the `crdt_delta` field
of the outgoing message. If the connection was lost and the message is retried,
the stored delta ensures idempotent state: applying the same delta twice is safe
(Yjs updates are idempotent by design).

---

## Causal Buffer Algorithm

```javascript
class CausalBuffer {
  constructor() {
    this.buffer = [];  // { message, delta, receivedAt }
  }

  add(message, delta) {
    this.buffer.push({ message, delta, receivedAt: Date.now() });
  }

  // Returns [ready[], stillBuffered[]]
  drain(localVC) {
    const ready = [];
    const buffered = [];
    for (const entry of this.buffer) {
      if (isCausallyReady(entry.message.vectorClock, localVC, entry.message.senderFp)) {
        ready.push(entry);
      } else {
        buffered.push(entry);
      }
    }
    this.buffer = buffered;
    return ready;
  }

  // Evict messages buffered > 5 minutes (assume permanent partition)
  evictStale(maxAgeMs = 5 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    this.buffer = this.buffer.filter(e => e.receivedAt > cutoff);
  }
}

function isCausallyReady(msgVC, localVC, senderFp) {
  for (const [fp, t] of Object.entries(msgVC)) {
    if (fp === senderFp) continue;
    if ((localVC[fp] ?? 0) < t) return false;
  }
  return true;
}
```

---

## Merge Semantics Summary

| Data structure | CRDT type | Merge rule |
|----------------|-----------|-----------|
| `messages` | Y.Array | Append-only; ordering by Lamport + ts + msgId |
| `membership` | Y.Map | Last-write-wins per member field (Y.Map semantics) |
| `senderKeys` | Y.Map | Last-write-wins per field; `version` is monotone |

**Important**: Y.Array in Yjs uses a List CRDT (based on YATA algorithm) that
guarantees:
- Insert operations are commutative and associative
- Concurrent inserts at the same position are ordered deterministically
- No element is ever lost on merge

---

## Compatibility

- **Yjs version**: Requires Yjs ≥ 13.6.0 (Y.Doc updateV2 API)
- **y-indexeddb**: Requires ≥ 9.0.0
- **Non-CRDT peers**: Peers that don't implement this spec MUST ignore `crdt_delta`
  fields. They remain functional but lose eventual consistency guarantees for
  group state.
- **Wire format**: `crdt_delta` is always base64-encoded `Uint8Array` (Yjs updateV2
  binary). The `kind: "dmesh-crdt-sync"` message is independent of encrypted
  group messages and may be sent over any transport.

---

## Test Vectors

See `tests/integration/group-crdt.test.js` for:
- Concurrent message insertion from 3 peers → identical final order
- Member add/remove with SenderKey rotation → no member can decrypt after removal
- Causal buffer: message with unmet dependency → buffered until dependency arrives
- Delta sync handshake: two peers with divergent state → converge after one round
- IndexedDB persistence: doc survives page reload with identical state
