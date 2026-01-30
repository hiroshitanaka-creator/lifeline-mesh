/**
 * Lifeline Mesh - Secure Key Backup
 *
 * Provides secure password-based encryption for key backup using
 * Argon2id (when available) or a secure fallback with PBKDF2.
 *
 * Security Properties:
 * - Memory-hard key derivation (Argon2id) resists GPU/ASIC attacks
 * - Authenticated encryption (NaCl secretbox) prevents tampering
 * - Random salt prevents rainbow table attacks
 * - Version field allows future upgrades
 *
 * @module crypto/key-backup
 */

// Argon2id parameters (OWASP recommended for password storage)
const ARGON2_CONFIG = {
  type: 2,         // Argon2id
  timeCost: 3,     // iterations
  memoryCost: 65536, // 64 MB
  parallelism: 4,
  hashLength: 32,  // 256 bits for secretbox key
};

// PBKDF2 fallback parameters (when Argon2 unavailable)
const PBKDF2_CONFIG = {
  iterations: 600000, // OWASP 2023 recommendation
  hash: 'SHA-256',
  keyLength: 32,
};

// Backup format version
const BACKUP_VERSION = 2;

/**
 * Check if Argon2 is available
 * @returns {boolean}
 */
export function isArgon2Available() {
  return typeof window !== 'undefined' && typeof window.argon2 !== 'undefined';
}

/**
 * Derive encryption key from password using Argon2id
 * @param {string} password - User password
 * @param {Uint8Array} salt - Random salt (16 bytes)
 * @param {Object} nacl - TweetNaCl instance
 * @returns {Promise<Uint8Array>} - 32-byte key
 */
async function deriveKeyArgon2(password, salt, nacl) {
  const argon2 = window.argon2;

  const result = await argon2.hash({
    pass: password,
    salt: salt,
    type: ARGON2_CONFIG.type,
    time: ARGON2_CONFIG.timeCost,
    mem: ARGON2_CONFIG.memoryCost,
    parallelism: ARGON2_CONFIG.parallelism,
    hashLen: ARGON2_CONFIG.hashLength,
  });

  return new Uint8Array(result.hash);
}

/**
 * Derive encryption key from password using PBKDF2 (fallback)
 * @param {string} password - User password
 * @param {Uint8Array} salt - Random salt (16 bytes)
 * @returns {Promise<Uint8Array>} - 32-byte key
 */
async function deriveKeyPBKDF2(password, salt) {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_CONFIG.iterations,
      hash: PBKDF2_CONFIG.hash,
    },
    keyMaterial,
    PBKDF2_CONFIG.keyLength * 8
  );

  return new Uint8Array(derivedBits);
}

/**
 * Derive encryption key from password
 * Uses Argon2id if available, falls back to PBKDF2
 *
 * @param {string} password - User password
 * @param {Uint8Array} salt - Random salt (16 bytes)
 * @param {Object} nacl - TweetNaCl instance
 * @returns {Promise<{key: Uint8Array, kdf: string}>}
 */
export async function deriveKey(password, salt, nacl) {
  if (isArgon2Available()) {
    const key = await deriveKeyArgon2(password, salt, nacl);
    return { key, kdf: 'argon2id' };
  } else {
    const key = await deriveKeyPBKDF2(password, salt);
    return { key, kdf: 'pbkdf2' };
  }
}

/**
 * Encrypt keys with password
 *
 * @param {Object} keys - Keys to encrypt
 * @param {string} keys.signPK - Signing public key (base64)
 * @param {string} keys.signSK - Signing secret key (base64)
 * @param {string} keys.boxPK - Box public key (base64)
 * @param {string} keys.boxSK - Box secret key (base64)
 * @param {string} password - User password
 * @param {Object} nacl - TweetNaCl instance
 * @param {Object} naclUtil - TweetNaCl-util instance
 * @returns {Promise<Object>} - Encrypted backup object
 */
export async function encryptKeys(keys, password, nacl, naclUtil) {
  // Validate input
  if (!keys.signPK || !keys.signSK || !keys.boxPK || !keys.boxSK) {
    throw new Error('Missing required keys');
  }

  if (!password || password.length < 1) {
    throw new Error('Password is required');
  }

  // Generate random salt and nonce
  const salt = nacl.randomBytes(16);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

  // Derive encryption key
  const { key, kdf } = await deriveKey(password, salt, nacl);

  // Serialize keys to JSON
  const plaintext = naclUtil.decodeUTF8(JSON.stringify(keys));

  // Encrypt with NaCl secretbox (XSalsa20-Poly1305)
  const ciphertext = nacl.secretbox(plaintext, nonce, key);

  if (!ciphertext) {
    throw new Error('Encryption failed');
  }

  return {
    version: BACKUP_VERSION,
    kdf: kdf,
    kdfParams: kdf === 'argon2id' ? ARGON2_CONFIG : PBKDF2_CONFIG,
    salt: naclUtil.encodeBase64(salt),
    nonce: naclUtil.encodeBase64(nonce),
    ciphertext: naclUtil.encodeBase64(ciphertext),
    exported: new Date().toISOString(),
  };
}

/**
 * Decrypt keys from backup
 *
 * @param {Object} backup - Encrypted backup object
 * @param {string} password - User password
 * @param {Object} nacl - TweetNaCl instance
 * @param {Object} naclUtil - TweetNaCl-util instance
 * @returns {Promise<Object>} - Decrypted keys
 */
export async function decryptKeys(backup, password, nacl, naclUtil) {
  // Validate backup format
  if (!backup || !backup.version) {
    throw new Error('Invalid backup format');
  }

  if (backup.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${backup.version}`);
  }

  // Decode components
  const salt = naclUtil.decodeBase64(backup.salt);
  const nonce = naclUtil.decodeBase64(backup.nonce);
  const ciphertext = naclUtil.decodeBase64(backup.ciphertext);

  // Derive key using same KDF
  let key;
  if (backup.kdf === 'argon2id') {
    if (!isArgon2Available()) {
      throw new Error(
        'This backup was encrypted with Argon2id, which is not available. ' +
        'Please use a browser with Argon2 support or load the argon2-browser library.'
      );
    }
    key = await deriveKeyArgon2(password, salt, nacl);
  } else if (backup.kdf === 'pbkdf2') {
    key = await deriveKeyPBKDF2(password, salt);
  } else {
    throw new Error(`Unknown KDF: ${backup.kdf}`);
  }

  // Decrypt
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key);

  if (!plaintext) {
    throw new Error('Decryption failed - wrong password or corrupted backup');
  }

  // Parse JSON
  const keys = JSON.parse(naclUtil.encodeUTF8(plaintext));

  // Validate decrypted keys
  if (!keys.signPK || !keys.signSK || !keys.boxPK || !keys.boxSK) {
    throw new Error('Decrypted data is missing required keys');
  }

  // Validate key lengths
  const signPKBytes = naclUtil.decodeBase64(keys.signPK);
  const signSKBytes = naclUtil.decodeBase64(keys.signSK);
  const boxPKBytes = naclUtil.decodeBase64(keys.boxPK);
  const boxSKBytes = naclUtil.decodeBase64(keys.boxSK);

  if (signPKBytes.length !== 32 ||
      signSKBytes.length !== 64 ||
      boxPKBytes.length !== 32 ||
      boxSKBytes.length !== 32) {
    throw new Error('Invalid key lengths in decrypted data');
  }

  return keys;
}

/**
 * Get information about the backup security
 * @param {Object} backup - Backup object
 * @returns {Object} - Security information
 */
export function getBackupSecurityInfo(backup) {
  if (!backup || !backup.version) {
    return {
      secure: false,
      message: 'Invalid or legacy backup format',
    };
  }

  if (backup.version === 1) {
    return {
      secure: false,
      message: 'Legacy backup (XOR encryption) - NOT SECURE. Re-export recommended.',
    };
  }

  if (backup.version === BACKUP_VERSION) {
    const kdfInfo = backup.kdf === 'argon2id'
      ? 'Argon2id (recommended)'
      : 'PBKDF2 (fallback - Argon2id recommended)';

    return {
      secure: true,
      kdf: backup.kdf,
      message: `Secure backup using ${kdfInfo}`,
    };
  }

  return {
    secure: false,
    message: `Unknown backup version: ${backup.version}`,
  };
}

/**
 * Check password strength
 * @param {string} password
 * @returns {Object} - Strength assessment
 */
export function checkPasswordStrength(password) {
  const length = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  const score =
    (length >= 8 ? 1 : 0) +
    (length >= 12 ? 1 : 0) +
    (length >= 16 ? 1 : 0) +
    (hasLower ? 1 : 0) +
    (hasUpper ? 1 : 0) +
    (hasNumber ? 1 : 0) +
    (hasSymbol ? 1 : 0);

  let strength, message;
  if (score <= 2) {
    strength = 'weak';
    message = 'Very weak - add length and variety';
  } else if (score <= 4) {
    strength = 'fair';
    message = 'Fair - consider adding more characters';
  } else if (score <= 5) {
    strength = 'good';
    message = 'Good password';
  } else {
    strength = 'strong';
    message = 'Strong password';
  }

  return {
    score,
    strength,
    message,
    details: {
      length,
      hasLower,
      hasUpper,
      hasNumber,
      hasSymbol,
    },
  };
}
