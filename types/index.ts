/**
 * Lifeline Mesh - TypeScript Type Definitions
 *
 * Core types for the Lifeline Mesh protocol. These cover:
 * - Public identities and key pairs
 * - Direct (1-to-1) encrypted messages
 * - Group messaging (Sender Keys protocol)
 * - Storage structures (contacts, message store)
 * - BLE mesh routing
 * - Error classification
 */

// ============================================================================
// Primitive Types
// ============================================================================

/** Base64url-encoded string */
export type Base64 = string;

/** 16-byte fingerprint encoded as base64 */
export type Fingerprint = Base64;

/** ISO 8601 datetime string */
export type ISODateString = string;

// ============================================================================
// Key Pairs
// ============================================================================

/** Ed25519 signing key pair */
export interface SignKeyPair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 64 bytes
}

/** Curve25519 box key pair */
export interface BoxKeyPair {
  publicKey: Uint8Array;  // 32 bytes
  secretKey: Uint8Array;  // 32 bytes
}

/** Complete set of keys owned by this node */
export interface OwnKeys {
  signKeyPair: SignKeyPair;
  boxKeyPair: BoxKeyPair;
}

// ============================================================================
// Public Identity (shared with peers)
// ============================================================================

/** Serialized public identity card (safe to share / broadcast) */
export interface PublicIdentity {
  /** Protocol version */
  v: 1;
  /** Object type discriminator */
  kind: "dmesh-id";
  /** Human-readable display name */
  name: string;
  /** 16-byte fingerprint of signPK, base64 */
  fp: Fingerprint;
  /** Ed25519 public key, base64 */
  signPK: Base64;
  /** Curve25519 public key, base64 */
  boxPK: Base64;
}

// ============================================================================
// Direct (1-to-1) Encrypted Messages
// ============================================================================

/** Encrypted message envelope (safe to store and forward) */
export interface EncryptedMessage {
  /** Protocol version */
  v: 1;
  /** Object type discriminator */
  kind: "dmesh-msg";
  /** Message type (e.g. "text", "im_safe") */
  type?: string;
  /** Sender's Ed25519 public key, base64 */
  senderSignPK: Base64;
  /** Sender's Curve25519 public key, base64 */
  senderBoxPK: Base64;
  /** Recipient's Curve25519 public key, base64 */
  recipientBoxPK: Base64;
  /** Ephemeral Curve25519 public key, base64 */
  ephPK: Base64;
  /** XSalsa20 nonce, base64 */
  nonce: Base64;
  /** Encrypted payload (XSalsa20-Poly1305), base64 */
  ciphertext: Base64;
  /** Ed25519 signature over canonical sign bytes, base64 */
  signature: Base64;
  /** Unix timestamp (ms) when the message was created */
  ts: number;
  /** Expiration timestamp (ms); message must be discarded after this time */
  exp?: number;
  /** Unique message identifier (SHA-512[:32] of ciphertext), base64 */
  msgId?: Base64;
  /** Remaining routing TTL (hop count); stripped before delivery */
  _ttl?: number;
}

/** Result of successfully decrypting a direct message */
export interface DecryptResult {
  /** Decrypted plaintext content */
  content: string;
  /** Sender's Ed25519 public key (raw bytes) */
  senderSignPK: Uint8Array;
  /** Sender's Curve25519 public key (raw bytes) */
  senderBoxPK: Uint8Array;
  /** Sender's fingerprint (raw bytes) */
  senderFp: Uint8Array;
  /** Unix timestamp (ms) */
  ts: number;
}

// ============================================================================
// Group Messaging (Sender Keys Protocol)
// ============================================================================

/** A group member */
export interface GroupMember {
  /** Member's fingerprint, base64 */
  fp: Fingerprint;
  /** Member's Ed25519 public key, base64 */
  signPK: Base64;
  /** Member's role in the group */
  role: "admin" | "member";
  /** Unix timestamp (ms) when the member was added */
  addedAt: number;
}

/** Group metadata */
export interface Group {
  /** Unique group identifier (random 16 bytes, base64) */
  id: string;
  /** Human-readable group name */
  name: string;
  /** Unix timestamp (ms) when the group was created */
  createdAt: number;
  /** Fingerprint of the group creator, base64 */
  createdBy: Fingerprint;
  /** Current list of members */
  members: GroupMember[];
  /** Current sender key version */
  senderKeyVersion: number;
}

/** Sender key used to encrypt/decrypt group messages */
export interface SenderKey {
  /** Sender key version (increments on member removal / key rotation) */
  version: number;
  /** Ed25519 key pair dedicated to group message signing */
  signKeyPair: SignKeyPair;
  /** Current chain key (base64); advances with each message sent */
  chainKey: Base64;
}

/** Serialized sender key (for distribution over 1-to-1 encrypted channel) */
export interface SerializedSenderKey {
  version: number;
  /** Ed25519 public key component, base64 */
  signPK: Base64;
  /** Ed25519 secret key component, base64 */
  signSK: Base64;
  /** Current chain key, base64 */
  chainKey: Base64;
}

/** Encrypted group message envelope */
export interface EncryptedGroupMessage {
  v: 1;
  kind: "dmesh-group-msg";
  /** Group identifier */
  groupId: string;
  /** Unix timestamp (ms) */
  ts: number;
  /** Sender's long-term Ed25519 public key, base64 */
  senderSignPK: Base64;
  /** Sender key version used for this message */
  senderKeyVersion: number;
  /** Sender key's Ed25519 public key (for per-message verification), base64 */
  senderKeyPK: Base64;
  /** XSalsa20 nonce, base64 */
  nonce: Base64;
  /** Encrypted payload, base64 */
  ciphertext: Base64;
  /** Ed25519 signature over canonical sign bytes, base64 */
  signature: Base64;
}

/** Result of successfully decrypting a group message */
export interface GroupDecryptResult {
  /** Decrypted plaintext content */
  content: string;
  /** Unix timestamp (ms) */
  ts: number;
  /** Sender's long-term Ed25519 public key (raw bytes) */
  senderSignPK: Uint8Array;
}

// ============================================================================
// Contacts
// ============================================================================

/** A known contact */
export interface Contact {
  /** Contact's fingerprint, base64 */
  fp: Fingerprint;
  /** Display name */
  name: string;
  /** Ed25519 public key, base64 */
  signPK: Base64;
  /** Curve25519 public key, base64 */
  boxPK: Base64;
  /** Unix timestamp (ms) when the contact was added */
  addedAt: number;
  /** Unix timestamp (ms) of most recent interaction */
  lastSeen?: number;
}

// ============================================================================
// Secure Key Backup
// ============================================================================

/** Keys to be backed up */
export interface KeysToBackup {
  signPK: Base64;
  signSK: Base64;
  boxPK: Base64;
  boxSK: Base64;
}

/** Encrypted key backup blob (safe to export/store) */
export interface KeyBackup {
  /** Backup format version (2 = argon2id/pbkdf2) */
  version: 2;
  /** KDF used: "argon2id" (preferred) or "pbkdf2" (fallback) */
  kdf: "argon2id" | "pbkdf2";
  /** KDF parameters used for derivation */
  kdfParams: Record<string, unknown>;
  /** Random salt, base64 */
  salt: Base64;
  /** XSalsa20 nonce, base64 */
  nonce: Base64;
  /** Encrypted keys, base64 */
  ciphertext: Base64;
  /** ISO 8601 export timestamp */
  exported: ISODateString;
}

/** Password strength assessment */
export interface PasswordStrength {
  score: number;
  strength: "weak" | "fair" | "good" | "strong";
  message: string;
  details: {
    length: number;
    hasLower: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

// ============================================================================
// BLE Mesh Routing
// ============================================================================

/** A routing table entry */
export interface RouteEntry {
  /** ID of the next-hop peer */
  peerId: string;
  /** Unix timestamp (ms) of the last update */
  lastSeen: number;
  /** Estimated hop count to the destination */
  hopCount: number;
}

/** A connected peer record */
export interface PeerRecord {
  /** Peer's box public key (base64), or null if not yet exchanged */
  boxPKB64: Base64 | null;
  /** Unix timestamp (ms) of connection */
  connectedAt: number;
}

/** Seen-message cache entry (for duplicate suppression) */
export interface SeenEntry {
  /** Unix timestamp (ms) when the message was first seen */
  ts: number;
  /** Whether the message was delivered to this node */
  delivered: boolean;
}

/** Router status snapshot (for diagnostics / UI) */
export interface RouterStatus {
  peers: number;
  routes: number;
  seenMessages: number;
  peerIds: string[];
}

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorCategory =
  | "CRYPTO"
  | "VALIDATION"
  | "STORAGE"
  | "NETWORK"
  | "FORMAT"
  | "SECURITY";

export type ErrorCode =
  | "DECRYPTION_FAILED"
  | "SIGNATURE_INVALID"
  | "KEY_GENERATION_FAILED"
  | "TIMESTAMP_SKEW"
  | "RECIPIENT_MISMATCH"
  | "REPLAY_DETECTED"
  | "INVALID_MESSAGE_FORMAT"
  | "BASE64_DECODE_FAILED"
  | "JSON_PARSE_FAILED"
  | "KEY_LENGTH_INVALID"
  | "STORAGE_ERROR"
  | "NETWORK_ERROR"
  | "SENDER_KEY_MISMATCH"
  | "GROUP_SIGNATURE_INVALID"
  | "GROUP_KEY_VERSION_MISMATCH"
  | "GROUP_DECRYPTION_FAILED";

// ============================================================================
// Message Store (IndexedDB)
// ============================================================================

/** A stored message (encrypted + metadata) */
export interface StoredMessage {
  /** Unique message ID */
  id: string;
  /** Encrypted message envelope */
  envelope: EncryptedMessage | EncryptedGroupMessage;
  /** Message direction from local node's perspective */
  direction: "sent" | "received";
  /** Whether the message has been decrypted and read */
  read: boolean;
  /** Contact fingerprint (for direct messages) */
  contactFp?: Fingerprint;
  /** Group ID (for group messages) */
  groupId?: string;
  /** Unix timestamp (ms) */
  storedAt: number;
}
