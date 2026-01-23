# Lifeline Mesh 🆘🕸️
**災害時に"落ちない"ための、検証可能・低電力・メッシュ志向SNS。**

ネットワークが壊れ、電池が減り、デマが致命傷になる状況で、
「真正性」「改ざん耐性」「中継耐性」を最小コアで成立させる。

---

# Lifeline Mesh 🆘🕸️
**A disaster-ready, low-power, verifiable social layer for emergency coordination.**

Lifeline Mesh is a lightweight mesh networking SNS for emergencies: when networks are flaky, power is limited, and misinformation is deadly.
It focuses on *verifiable messages*, *offline-first thinking*, and *mesh-friendly protocols*.

> Not "social media for fun" — a **lifeline** when things break.

---

## Why
During disasters, you need:
- **Reliable delivery under unstable connectivity**
- **Low-power operation on phones**
- **Integrity and sender authenticity** (misinformation kills)
- **Simple, auditable cryptography**
- **Mesh network resilience** (no single point of failure)

Lifeline Mesh is designed to keep the core small, portable, and reviewable.

---

## Core Goals
- ✅ **Emergency coordination**: shelters, supplies, safety check-ins, requests/dispatch
- ✅ **Verifiable messaging**: signed messages, tamper-evident payloads
- ✅ **Mesh-compatible architecture**: supports store-and-forward relays
- ✅ **Offline-first UX**: compose, queue, forward when possible
- ✅ **Minimal primitives**: TweetNaCl (Ed25519 + X25519/XSalsa20-Poly1305)
- ✅ **Peer-to-peer routing**: messages find their way through available nodes

Non-goals (for now):
- ❌ "Perfect anonymity" at any cost
- ❌ Heavy dependencies or opaque cryptographic stacks
- ❌ Full Signal-level ratcheting (future work)

---

## Threat Model (short)
We assume:
- Attackers can inject and relay messages
- Networks are monitored, degraded, or partitioned
- Devices might be lost or confiscated
- Misinformation and impersonation are primary risks

We aim for:
- **Authenticity** (who said it)
- **Integrity** (was it modified)
- **Recipient binding** (who it was meant for)
- **Replay resistance** (no resending old valid messages as "new")
- **Mesh reliability** (messages route around failures)

We do *not* claim:
- True forward secrecy under long-term key compromise (unless ratcheting is added)

---

## Crypto Design (v1)
- **Signing**: Ed25519 (`nacl.sign`)
- **Encryption**: X25519 + XSalsa20-Poly1305 (`nacl.box`)
- **Per-message ephemeral key** for "PFS-like" properties
- **Domain-separated binary signing** (no JSON signature ambiguity)
- **Recipient binding** included in signed bytes
- **Replay protection** via (sender_fp + nonce) persistence with TTL

---

## Architecture (planned)
- **Client**: PWA / Web app / mobile wrapper
- **Transport adapters**:
  - WebRTC / Bluetooth / Wi-Fi Direct (mesh peer discovery)
  - QR / audio / manual relay (fallback)
  - HTTP gateway when available
- **Mesh routing layer**:
  - Store & forward relays
  - Multi-hop message delivery
  - Automatic path finding and redundancy

---

## Project Structure (initial)
```
/spec        Protocol + threat model
/app         Client UI (offline-first)
/crypto      Audited crypto routines (NaCl-only)
/relay       Mesh relay node implementation
/routing     Message routing algorithms
/tools       Key export/import, test vectors, SRI helpers
```

---

## Status
🚧 **Prototype**
We have:
- [Planned] Key generation + persistence
- [Planned] Contact exchange (SignPK + BoxPK)
- [Planned] Signed + encrypted messages
- [Planned] TOFU option (explicitly marked as risky)
- [Planned] Replay checks with TTL cleanup
- [Planned] Mesh routing protocol

Next:
- Transport adapters
- Structured emergency message types (SOS, supplies, shelter status)
- Multi-device identity & key rotation
- Optional ratcheting (Double Ratchet)
- Mesh network topology management

---

## Safety Notes (read this)
- If the web app gets XSS'd, local keys can be stolen.
- CDN scripts must be pinned and protected (SRI/CSP) in production builds.
- Cryptography helps against forgery — not against compromised devices.
- Mesh routing reveals some metadata (who is connected to whom).

---

## Contributing
PRs are welcome, especially:
- Security review and test vectors
- Threat model refinements
- UX flows for real emergency scenarios
- Transport adapters and relay implementation
- Mesh routing algorithm improvements

---

## License
MIT (or your choice)

---

### Name meaning
A lifeline is a rope or chain thrown to rescue someone, representing the critical connection that saves lives.
The mesh structure ensures that if one connection breaks, others remain.
Lifeline Mesh is built to stay connected when everything else goes dark.
