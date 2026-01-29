/**
 * Type definitions for TweetNaCl
 */

declare interface NaClSignKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

declare interface NaClBoxKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

declare interface NaClSign {
  publicKeyLength: number;
  secretKeyLength: number;
  signatureLength: number;
  keyPair: {
    (): NaClSignKeyPair;
    fromSecretKey(secretKey: Uint8Array): NaClSignKeyPair;
    fromSeed(seed: Uint8Array): NaClSignKeyPair;
  };
  (message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  open(signedMessage: Uint8Array, publicKey: Uint8Array): Uint8Array | null;
  detached: {
    (message: Uint8Array, secretKey: Uint8Array): Uint8Array;
    verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean;
  };
}

declare interface NaClBox {
  publicKeyLength: number;
  secretKeyLength: number;
  nonceLength: number;
  overheadLength: number;
  keyPair: {
    (): NaClBoxKeyPair;
    fromSecretKey(secretKey: Uint8Array): NaClBoxKeyPair;
  };
  (message: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
  open(ciphertext: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null;
  before(theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array;
  after(message: Uint8Array, nonce: Uint8Array, sharedKey: Uint8Array): Uint8Array;
  open: {
    (ciphertext: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, mySecretKey: Uint8Array): Uint8Array | null;
    after(ciphertext: Uint8Array, nonce: Uint8Array, sharedKey: Uint8Array): Uint8Array | null;
  };
}

declare interface NaCl {
  sign: NaClSign;
  box: NaClBox;
  hash(message: Uint8Array): Uint8Array;
  randomBytes(n: number): Uint8Array;
  verify(x: Uint8Array, y: Uint8Array): boolean;
  setPRNG(fn: (x: Uint8Array, n: number) => void): void;
}

declare interface NaClUtil {
  decodeUTF8(s: string): Uint8Array;
  encodeUTF8(arr: Uint8Array): string;
  decodeBase64(s: string): Uint8Array;
  encodeBase64(arr: Uint8Array): string;
}

export { NaCl, NaClUtil, NaClSignKeyPair, NaClBoxKeyPair };
