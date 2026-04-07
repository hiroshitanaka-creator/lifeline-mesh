#!/usr/bin/env node
/**
 * Lifeline Mesh - Security Audit Tool
 *
 * Custom security scanner equivalent to Bandit (Python) for JavaScript.
 * Scans the Lifeline Mesh codebase for:
 *
 *   1. Cryptographic vulnerabilities
 *      - Weak algorithms (MD5, SHA1, DES, RC4, 3DES)
 *      - Hardcoded keys / secrets
 *      - Math.random() in security-sensitive contexts
 *      - Missing nonce uniqueness
 *
 *   2. Post-quantum vulnerabilities
 *      - Classical-only key exchange (X25519 without Kyber)
 *      - Missing hybrid_ciphertext field checks
 *
 *   3. Common JS security issues
 *      - eval() usage
 *      - Prototype pollution patterns
 *      - XSS-prone innerHTML with user data
 *      - Command injection (child_process with user input)
 *
 *   4. Backup security
 *      - v1 XOR backup format usage
 *      - Weak KDF parameters
 *
 * Usage:
 *   node crypto/audit.js [--path <dir>] [--format json|text] [--fail-on-high]
 *
 * Exit codes:
 *   0 — no findings
 *   1 — findings found (severity determined by --fail-on-high)
 *   2 — audit error
 *
 * @module crypto/audit
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join, extname } from "path";

// ─── Finding severity levels ──────────────────────────────────────────────────

export const SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
};

// ─── Audit rules ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditRule
 * @property {string} id - Rule ID (e.g. "CRYPTO-001")
 * @property {string} name - Short description
 * @property {string} severity - SEVERITY value
 * @property {RegExp|Function} check - Regex to match OR function (line, fileContent) → boolean
 * @property {string} recommendation - What to do instead
 */

/** @type {AuditRule[]} */
const AUDIT_RULES = [
  // ── Cryptographic issues ──────────────────────────────────────────────────

  {
    id: "CRYPTO-001",
    name: "Weak hash algorithm: MD5",
    severity: SEVERITY.HIGH,
    check: /\b(md5|MD5|createHash\(['"]md5['"]\))/,
    recommendation: "Use SHA-256 or SHA-512 instead of MD5"
  },
  {
    id: "CRYPTO-002",
    name: "Weak hash algorithm: SHA-1",
    severity: SEVERITY.HIGH,
    check: /createHash\(['"]sha1['"]\)|sha1\(|SHA1\b/,
    recommendation: "Use SHA-256 or SHA-512 instead of SHA-1"
  },
  {
    id: "CRYPTO-003",
    name: "Weak cipher: DES / 3DES",
    severity: SEVERITY.CRITICAL,
    check: /createCipheriv\(['"]des|createCipheriv\(['"]3des/i,
    recommendation: "Use AES-256-GCM or XSalsa20-Poly1305 (NaCl secretbox)"
  },
  {
    id: "CRYPTO-004",
    name: "Weak cipher: RC4",
    severity: SEVERITY.CRITICAL,
    check: /createCipheriv\(['"]rc4/i,
    recommendation: "RC4 is broken. Use AES-256-GCM or XSalsa20-Poly1305"
  },
  {
    id: "CRYPTO-005",
    name: "Math.random() in cryptographic context",
    severity: SEVERITY.CRITICAL,
    check: (line) => {
      return /Math\.random\(\)/.test(line) &&
        /key|nonce|salt|secret|token|cipher|crypto|random/i.test(line);
    },
    recommendation: "Use crypto.getRandomValues() or nacl.randomBytes() for cryptographic randomness"
  },
  {
    id: "CRYPTO-006",
    name: "Hardcoded key or secret string",
    severity: SEVERITY.CRITICAL,
    check: (line) => {
      const patterns = [
        /['"](?:key|secret|password|passwd|token|api_key|private_key)['"]\s*[:=]\s*['"][a-zA-Z0-9+/=]{16,}['"]/i,
        /const\s+(?:key|secret|sk|privateKey)\s*=\s*['"][a-zA-Z0-9+/=]{20,}['"]/i
      ];
      return patterns.some((p) => p.test(line)) && !/test|mock|fixture|example|dummy/i.test(line);
    },
    recommendation: "Never hardcode secrets. Use environment variables or a secure key store."
  },
  {
    id: "CRYPTO-007",
    name: "ECB mode encryption (deterministic, insecure)",
    severity: SEVERITY.CRITICAL,
    check: /createCipheriv\(['"]aes-\d+-ecb/i,
    recommendation: "Use AES-256-GCM (authenticated encryption) instead of ECB mode"
  },
  {
    id: "CRYPTO-008",
    name: "Missing nonce validation (static nonce risk)",
    severity: SEVERITY.HIGH,
    check: (line) => {
      return /nonce\s*=\s*(?:0|null|undefined|new Uint8Array\(\d+\)(?!\s*;?\s*\/\/\s*random))/.test(line);
    },
    recommendation: "Always generate nonces with nacl.randomBytes(24) or crypto.getRandomValues()"
  },
  {
    id: "CRYPTO-009",
    name: "Weak PBKDF2 iteration count (< 100,000)",
    severity: SEVERITY.HIGH,
    check: (line) => {
      const match = line.match(/iterations\s*[:=]\s*(\d+)/);
      if (!match) return false;
      const count = parseInt(match[1]);
      return count < 100_000;
    },
    recommendation: "Use at least 600,000 PBKDF2 iterations (OWASP 2023) or use Argon2id"
  },

  // ── Post-quantum issues ───────────────────────────────────────────────────

  {
    id: "PQ-001",
    name: "Classical-only key exchange (v2 requires Kyber hybrid)",
    severity: SEVERITY.MEDIUM,
    check: (line, fileContent) => {
      // Warn in v2 message construction without Kyber
      const isV2File = /v.*=.*2|version.*2/.test(fileContent);
      return isV2File &&
        /nacl\.box\.before\(|nacl\.box\(/.test(line) &&
        !/kyber|Kyber|hybrid_ciphertext/.test(fileContent.slice(0, 2000));
    },
    recommendation: "Use Kyber-1024 + X25519 hybrid encryption for v2 messages (see PROTOCOL.md)"
  },
  {
    id: "PQ-002",
    name: "Missing hybrid_ciphertext in v2 message construction",
    severity: SEVERITY.MEDIUM,
    check: (line) => {
      return /kind.*dmesh-msg.*v.*2|v.*2.*kind.*dmesh-msg/.test(line) &&
        !/hybrid_ciphertext/.test(line);
    },
    recommendation: "v2 messages must include hybrid_ciphertext.kyber_ct and x25519_ephem_pk"
  },

  // ── Backup security ───────────────────────────────────────────────────────

  {
    id: "BACKUP-001",
    name: "v1 XOR backup format usage",
    severity: SEVERITY.HIGH,
    check: /version.*1.*xor|xor.*backup|XOR.*backup/i,
    recommendation: "Use v2 backup format (Argon2id + XSalsa20-Poly1305). See crypto/key-backup.js"
  },
  {
    id: "BACKUP-002",
    name: "Argon2 parameters below OWASP minimums",
    severity: SEVERITY.MEDIUM,
    check: (line) => {
      if (/memoryCost|mem\s*:/.test(line)) {
        const match = line.match(/(?:memoryCost|mem)\s*[=:]\s*(\d+)/);
        if (match && parseInt(match[1]) < 65536) return true;
      }
      if (/timeCost|time\s*:/.test(line)) {
        const match = line.match(/(?:timeCost|time)\s*[=:]\s*(\d+)/);
        if (match && parseInt(match[1]) < 3) return true;
      }
      return false;
    },
    recommendation: "Argon2id minimums: memoryCost=65536 (64MB), timeCost=3, parallelism=4"
  },

  // ── JavaScript security ───────────────────────────────────────────────────

  {
    id: "JS-001",
    name: "eval() usage",
    severity: SEVERITY.CRITICAL,
    check: /\beval\s*\((?!['"][a-zA-Z])/,
    recommendation: "Never use eval(). It executes arbitrary code and enables XSS."
  },
  {
    id: "JS-002",
    name: "innerHTML with potentially untrusted data",
    severity: SEVERITY.HIGH,
    check: (line) => {
      return /\.innerHTML\s*=/.test(line) &&
        !/['"`]<[a-zA-Z]/.test(line) &&
        !/(esc|escape|sanitize)\(/.test(line) &&
        !/\/\/ safe/.test(line);
    },
    recommendation: "Use textContent, esc() helper, or DOMPurify for user-supplied HTML"
  },
  {
    id: "JS-003",
    name: "Prototype pollution via Object.assign or spread with user data",
    severity: SEVERITY.MEDIUM,
    check: /Object\.assign\([^)]*req\.(body|params|query)|__proto__|constructor\[/,
    recommendation: "Validate input before Object.assign. Never allow __proto__ or constructor keys."
  },
  {
    id: "JS-004",
    name: "Child process with user-controlled input",
    severity: SEVERITY.CRITICAL,
    check: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*(?:req\.|input|userInput|argv)/,
    recommendation: "Never pass user input directly to child_process. Use allowlist validation."
  },
  {
    id: "JS-005",
    name: "Unvalidated URL redirect",
    severity: SEVERITY.MEDIUM,
    check: /(?:res\.redirect|location\.href\s*=|window\.location\s*=)\s*[^'"(].*(?:req\.|param|query)/,
    recommendation: "Validate redirect URLs against an allowlist."
  }
];

// ─── File scanner ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".cache",
  "coverage", "__pycache__", ".nyc_output"
]);

const SCAN_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".mts"]);

/** @typedef {{ file: string, line: number, lineContent: string, rule: AuditRule }} Finding */

/**
 * Scan a directory for security issues.
 * @param {string} rootDir
 * @param {Object} [options]
 * @param {string[]} [options.excludeFiles] - File patterns to skip
 * @returns {Finding[]}
 */
export function scanDirectory(rootDir, options = {}) {
  const excludeFiles = options.excludeFiles ?? [];
  const findings = [];

  function scanFile(filePath) {
    let content;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      return;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment-only lines and test fixtures
      if (/^\s*(\/\/|\/\*|\*|#)/.test(line)) continue;

      for (const rule of AUDIT_RULES) {
        let matched = false;

        if (typeof rule.check === "function") {
          try { matched = rule.check(line, content); } catch { /* ignore */ }
        } else {
          matched = rule.check.test(line);
        }

        if (matched) {
          findings.push({
            file: filePath,
            line: i + 1,
            lineContent: line.trim().slice(0, 120),
            rule
          });
        }
      }
    }
  }

  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }

    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      if (excludeFiles.some((p) => name.includes(p))) continue;

      const full = join(dir, name);
      let stat;
      try { stat = statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        walk(full);
      } else if (SCAN_EXTENSIONS.has(extname(name))) {
        scanFile(full);
      }
    }
  }

  walk(rootDir);
  return findings;
}

// ─── Reporting ────────────────────────────────────────────────────────────────

/**
 * Format findings as human-readable text.
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatText(findings) {
  if (findings.length === 0) {
    return "Security audit: 0 findings. All clear.\n";
  }

  const lines = [
    `Security Audit: ${findings.length} finding(s)`,
    "─".repeat(60)
  ];

  const bySeverity = {};
  for (const f of findings) {
    const s = f.rule.severity;
    (bySeverity[s] ??= []).push(f);
  }

  for (const severity of [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW]) {
    const group = bySeverity[severity];
    if (!group) continue;

    lines.push(`\n[${severity.toUpperCase()}] ${group.length} finding(s)`);
    for (const f of group) {
      lines.push(`  ${f.rule.id}: ${f.rule.name}`);
      lines.push(`  File: ${f.file}:${f.line}`);
      lines.push(`  Code: ${f.lineContent}`);
      lines.push(`  Fix:  ${f.rule.recommendation}`);
      lines.push("");
    }
  }

  const counts = Object.entries(bySeverity)
    .map(([s, g]) => `${s}: ${g.length}`)
    .join(", ");
  lines.push(`Summary: ${counts}`);

  return lines.join("\n");
}

/**
 * Format findings as JSON.
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatJSON(findings) {
  return JSON.stringify(
    findings.map((f) => ({
      ruleId: f.rule.id,
      ruleName: f.rule.name,
      severity: f.rule.severity,
      file: f.file,
      line: f.line,
      code: f.lineContent,
      recommendation: f.rule.recommendation
    })),
    null,
    2
  );
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const pathIdx = args.indexOf("--path");
  const rootDir = pathIdx >= 0 ? resolve(args[pathIdx + 1]) : process.cwd();

  const formatIdx = args.indexOf("--format");
  const format = formatIdx >= 0 ? args[formatIdx + 1] : "text";

  const failOnHigh = args.includes("--fail-on-high");
  const failOnAny = args.includes("--fail-on-any");

  if (args.includes("--help")) {
    console.log(`Usage: node crypto/audit.js [options]
  --path <dir>     Root directory to scan (default: cwd)
  --format text|json  Output format (default: text)
  --fail-on-high   Exit 1 if HIGH or CRITICAL findings exist
  --fail-on-any    Exit 1 if any finding exists
  --help           Show this help
`);
    process.exit(0);
  }

  const excludeFiles = [
    "node_modules", ".test.js", ".spec.js",
    "test-vectors.json", "migrate-v1-backup.js"
  ];

  process.stdout.write(`Scanning: ${rootDir}\n`);
  const findings = scanDirectory(rootDir, { excludeFiles });

  if (format === "json") {
    process.stdout.write(formatJSON(findings) + "\n");
  } else {
    process.stdout.write(formatText(findings) + "\n");
  }

  // Exit code logic
  const hasHigh = findings.some(
    (f) => f.rule.severity === SEVERITY.HIGH || f.rule.severity === SEVERITY.CRITICAL
  );

  if (failOnAny && findings.length > 0) process.exit(1);
  if (failOnHigh && hasHigh) process.exit(1);
  process.exit(0);
}

// Run as script
if (process.argv[1]?.includes("audit.js")) {
  main().catch((err) => {
    process.stderr.write(`Audit error: ${err.message}\n`);
    process.exit(2);
  });
}
