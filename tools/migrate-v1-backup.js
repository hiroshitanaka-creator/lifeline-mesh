#!/usr/bin/env node
/**
 * Lifeline Mesh - v1 Backup Migration Tool
 *
 * Migrates legacy v1 XOR-encrypted key backups to the current v2 format
 * (Argon2id + XSalsa20-Poly1305 / NaCl secretbox).
 *
 * Usage:
 *   node tools/migrate-v1-backup.js --input old-backup.json --output new-backup.json
 *   node tools/migrate-v1-backup.js --validate backup.json
 *   node tools/migrate-v1-backup.js --check-all   # used by npm run validate
 *
 * Exit codes:
 *   0 — success / all backups valid
 *   1 — migration error / insecure backup detected
 *   2 — usage error
 *
 * @module tools/migrate-v1-backup
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";
import { createHmac } from "crypto";

// ─── V1 XOR backup constants ─────────────────────────────────────────────────

const V1_MAGIC = "DMESH_BACKUP_V1";
const V1_FIELD_ORDER = ["signPK", "signSK", "boxPK", "boxSK"];

// ─── V2 backup parameters (must match crypto/key-backup.js) ─────────────────

const BACKUP_VERSION = 2;

const ARGON2_CONFIG = {
  type: 2,           // Argon2id
  timeCost: 3,
  memoryCost: 65536, // 64 MB
  parallelism: 4,
  hashLength: 32
};

const PBKDF2_CONFIG = {
  iterations: 600000,
  hash: "SHA-256",
  keyLength: 32
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function b64decode(s) {
  return Buffer.from(s, "base64");
}

function b64encode(buf) {
  return Buffer.from(buf).toString("base64");
}

function log(msg) {
  process.stdout.write(msg + "\n");
}

function warn(msg) {
  process.stderr.write("[WARN] " + msg + "\n");
}

function fail(msg, code = 1) {
  process.stderr.write("[ERROR] " + msg + "\n");
  process.exit(code);
}

// ─── V1 XOR Decryption ───────────────────────────────────────────────────────

/**
 * Derive V1 XOR mask from password.
 * V1 used a simple HMAC-SHA256 stretch — NOT memory-hard.
 *
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} length
 * @returns {Buffer}
 */
function deriveV1Mask(password, salt, length) {
  // V1 stretched the password with repeated HMAC-SHA256 blocks
  const blocks = [];
  let counter = 0;
  while (blocks.reduce((s, b) => s + b.length, 0) < length) {
    const hmac = createHmac("sha256", salt);
    hmac.update(password);
    hmac.update(Buffer.from([counter & 0xff]));
    blocks.push(hmac.digest());
    counter++;
  }
  return Buffer.concat(blocks).slice(0, length);
}

/**
 * Decrypt a v1 XOR backup.
 *
 * @param {Object} backup - Parsed v1 backup JSON
 * @param {string} password
 * @returns {{ signPK: string, signSK: string, boxPK: string, boxSK: string }}
 */
function decryptV1Backup(backup, password) {
  if (!backup || backup.version !== 1) {
    throw new Error("Not a v1 backup");
  }

  const magic = b64decode(backup.magic || "");
  const expectedMagic = Buffer.from(V1_MAGIC, "utf8");
  if (!magic.equals(expectedMagic)) {
    throw new Error(
      "V1 magic mismatch — this may not be a Lifeline Mesh v1 backup"
    );
  }

  const salt = b64decode(backup.salt);
  const ciphertext = b64decode(backup.ciphertext);

  // Derive XOR mask from password + salt
  const mask = deriveV1Mask(password, salt, ciphertext.length);

  // XOR decrypt
  const plaintext = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plaintext[i] = ciphertext[i] ^ mask[i];
  }

  // Parse JSON
  let keys;
  try {
    keys = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error(
      "V1 decryption failed — wrong password or corrupted backup"
    );
  }

  for (const field of V1_FIELD_ORDER) {
    if (!keys[field]) {
      throw new Error(`V1 backup missing field: ${field}`);
    }
  }

  return keys;
}

// ─── V2 Encryption (Node.js native — no argon2-browser needed) ──────────────

/**
 * Derive v2 encryption key using PBKDF2-SHA256 (Node-native fallback).
 * For production use, prefer Argon2id via the browser's argon2-browser lib.
 * This tool uses PBKDF2 because argon2-browser is not available in Node.js.
 *
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Promise<Buffer>}
 */
async function deriveV2Key(password, salt) {
  const { pbkdf2 } = await import("crypto");
  return new Promise((resolve, reject) => {
    pbkdf2(
      password,
      salt,
      PBKDF2_CONFIG.iterations,
      PBKDF2_CONFIG.keyLength,
      "sha256",
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

/**
 * Encrypt keys using v2 format (PBKDF2 + NaCl secretbox equivalent).
 * Uses Node.js `crypto` module (AES-256-GCM) as NaCl secretbox substitute
 * for CLI migration — the resulting JSON is tagged with kdf=pbkdf2 so
 * the browser's decryptKeys() function can handle it.
 *
 * @param {Object} keys
 * @param {string} password
 * @returns {Promise<Object>}
 */
async function encryptV2Backup(keys, password) {
  const { randomBytes, createCipheriv } = await import("crypto");

  const salt = randomBytes(16);
  const nonce = randomBytes(24); // NaCl secretbox nonce length

  const derivedKey = await deriveV2Key(password, salt);

  // Use AES-256-GCM as a stand-in for XSalsa20-Poly1305 (same security level).
  // The browser's nacl.secretbox uses XSalsa20-Poly1305; since this is a
  // migration utility for offline use, we produce a v2 JSON tagged for
  // re-import where the browser will re-derive the key and use NaCl secretbox.
  //
  // Strategy: produce the v2 JSON structure but mark it migration=true so
  // the user must re-export from the browser with Argon2id after import.
  const plaintext = Buffer.from(JSON.stringify(keys), "utf8");

  // AES-256-GCM encryption (Node-native)
  const iv = nonce.slice(0, 12); // GCM standard IV length
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine: encrypted || authTag (matches NaCl secretbox layout convention)
  const ciphertextWithTag = Buffer.concat([encrypted, authTag]);

  return {
    version: BACKUP_VERSION,
    kdf: "pbkdf2",
    kdfParams: PBKDF2_CONFIG,
    salt: b64encode(salt),
    nonce: b64encode(nonce),
    ciphertext: b64encode(ciphertextWithTag),
    exported: new Date().toISOString(),
    migrated: true,                // Flag: was migrated from v1 XOR
    migrationNote:
      "Migrated from v1 XOR backup by migrate-v1-backup.js. " +
      "Re-export from the browser app with Argon2id for maximum security."
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a backup file's security level.
 * Exits with code 1 if backup is insecure (v1 / unknown format).
 *
 * @param {string} filePath
 * @returns {{ secure: boolean, version: number, kdf?: string }}
 */
function validateBackupFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    fail(`Cannot read file: ${filePath}: ${err.message}`);
  }

  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    fail(`Invalid JSON in backup file: ${filePath}`);
  }

  if (!backup || typeof backup.version !== "number") {
    return { secure: false, version: 0, reason: "Missing version field" };
  }

  if (backup.version === 1) {
    return {
      secure: false,
      version: 1,
      reason: "V1 XOR backup — NOT SECURE. Run migration."
    };
  }

  if (backup.version === BACKUP_VERSION) {
    const kdf = backup.kdf || "unknown";
    const secure = kdf === "argon2id" || kdf === "pbkdf2";
    return {
      secure,
      version: BACKUP_VERSION,
      kdf,
      migrated: backup.migrated || false,
      reason: secure
        ? kdf === "argon2id"
          ? "Secure (Argon2id + XSalsa20-Poly1305)"
          : "Acceptable (PBKDF2 — re-export with Argon2id recommended)"
        : `Unknown KDF: ${kdf}`
    };
  }

  return {
    secure: false,
    version: backup.version,
    reason: `Unknown backup version: ${backup.version}`
  };
}

// ─── Check-all mode ──────────────────────────────────────────────────────────

/**
 * Scan the repository for any *.backup.json or *-backup.json files and
 * validate them. Used by `npm run validate`.
 *
 * @param {string} rootDir
 * @returns {boolean} true if all backups are secure
 */
function checkAllBackups(rootDir) {
  const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

  function scan(dir) {
    const results = [];
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return results;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        results.push(...scan(full));
      } else if (
        name.endsWith(".backup.json") ||
        name.endsWith("-backup.json") ||
        name.endsWith("-keybackup.json")
      ) {
        results.push(full);
      }
    }
    return results;
  }

  const backupFiles = scan(rootDir);

  if (backupFiles.length === 0) {
    log("check-all: No backup files found. OK.");
    return true;
  }

  let allSecure = true;
  for (const file of backupFiles) {
    const result = validateBackupFile(file);
    const status = result.secure ? "OK  " : "FAIL";
    log(`[${status}] ${file} — v${result.version} ${result.kdf || ""} ${result.reason}`);
    if (!result.secure) {
      allSecure = false;
    }
  }

  return allSecure;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    log(`
Lifeline Mesh v1→v2 Backup Migration Tool

Usage:
  node tools/migrate-v1-backup.js --input <old.json> --output <new.json> [--password <pw>]
  node tools/migrate-v1-backup.js --validate <backup.json>
  node tools/migrate-v1-backup.js --check-all [--root <dir>]

Options:
  --input    Path to v1 XOR backup JSON
  --output   Path for migrated v2 backup JSON
  --password Password for decrypting v1 backup (prompted if omitted)
  --validate Validate backup security level (exit 1 if insecure)
  --check-all Scan repository for any v1 backups (used by npm run validate)
  --root     Root directory to scan (default: current working directory)
  --help     Show this help
    `.trim());
    process.exit(0);
  }

  // --check-all mode
  if (args.includes("--check-all")) {
    const rootIdx = args.indexOf("--root");
    const rootDir = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : process.cwd();
    const ok = checkAllBackups(rootDir);
    if (!ok) {
      fail(
        "One or more backup files are insecure (v1 XOR format).\n" +
        "Run: node tools/migrate-v1-backup.js --input <old.json> --output <new.json>\n" +
        "Then re-export from the browser with Argon2id enabled."
      );
    }
    log("All backups validated successfully.");
    process.exit(0);
  }

  // --validate mode
  if (args.includes("--validate")) {
    const idx = args.indexOf("--validate");
    const filePath = args[idx + 1];
    if (!filePath) fail("--validate requires a file path", 2);

    const result = validateBackupFile(resolve(filePath));
    log(`Backup: ${filePath}`);
    log(`Version: ${result.version}`);
    log(`KDF: ${result.kdf || "n/a"}`);
    log(`Secure: ${result.secure}`);
    log(`Status: ${result.reason}`);

    if (!result.secure) {
      process.exit(1);
    }
    process.exit(0);
  }

  // --input / --output migration mode
  const inputIdx = args.indexOf("--input");
  const outputIdx = args.indexOf("--output");

  if (inputIdx < 0 || outputIdx < 0) {
    fail("Usage: --input <file> --output <file>  (or --validate / --check-all)", 2);
  }

  const inputPath = resolve(args[inputIdx + 1]);
  const outputPath = resolve(args[outputIdx + 1]);

  // Read input backup
  let rawInput;
  try {
    rawInput = readFileSync(inputPath, "utf8");
  } catch (err) {
    fail(`Cannot read input file: ${inputPath}: ${err.message}`);
  }

  let inputBackup;
  try {
    inputBackup = JSON.parse(rawInput);
  } catch {
    fail("Input file is not valid JSON");
  }

  if (inputBackup.version === BACKUP_VERSION) {
    log("Input backup is already v2 format. No migration needed.");
    const result = validateBackupFile(inputPath);
    log(`Security status: ${result.reason}`);
    process.exit(0);
  }

  if (inputBackup.version !== 1) {
    fail(`Unknown backup version: ${inputBackup.version}. Cannot migrate.`);
  }

  // Get password
  let password;
  const pwIdx = args.indexOf("--password");
  if (pwIdx >= 0) {
    password = args[pwIdx + 1];
  } else {
    // Prompt interactively
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr
    });
    password = await new Promise((resolve) => {
      rl.question("Password for v1 backup: ", (pw) => {
        rl.close();
        resolve(pw);
      });
    });
  }

  if (!password) {
    fail("Password is required for migration");
  }

  log(`Migrating v1 backup: ${inputPath}`);
  log("Decrypting v1 XOR backup...");

  let keys;
  try {
    keys = decryptV1Backup(inputBackup, password);
  } catch (err) {
    fail(`V1 decryption failed: ${err.message}`);
  }

  log("V1 decryption successful. Validating key lengths...");

  const signPKLen = b64decode(keys.signPK).length;
  const signSKLen = b64decode(keys.signSK).length;
  const boxPKLen = b64decode(keys.boxPK).length;
  const boxSKLen = b64decode(keys.boxSK).length;

  if (signPKLen !== 32 || signSKLen !== 64 || boxPKLen !== 32 || boxSKLen !== 32) {
    fail(
      `Invalid key lengths in v1 backup: signPK=${signPKLen} signSK=${signSKLen} boxPK=${boxPKLen} boxSK=${boxSKLen}`
    );
  }

  log("Key lengths valid. Encrypting with v2 format (PBKDF2 + AES-256-GCM)...");

  let v2Backup;
  try {
    v2Backup = await encryptV2Backup(keys, password);
  } catch (err) {
    fail(`V2 encryption failed: ${err.message}`);
  }

  try {
    writeFileSync(outputPath, JSON.stringify(v2Backup, null, 2), "utf8");
  } catch (err) {
    fail(`Cannot write output file: ${outputPath}: ${err.message}`);
  }

  log(`Migration complete! Output: ${outputPath}`);
  log("");
  log("IMPORTANT: This migration used PBKDF2 (Node-native fallback).");
  log("For maximum security, import this backup into the Lifeline Mesh browser");
  log("app and immediately re-export it — the browser will use Argon2id.");
  log("");
  log("The original v1 backup file has NOT been deleted.");
  log("Delete it manually after verifying the migrated backup: " + inputPath);
}

main().catch((err) => {
  process.stderr.write(`Unhandled error: ${err.message}\n`);
  process.exit(1);
});
