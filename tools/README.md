# Tools

Development and testing utilities for Lifeline Mesh.

## Tools

### Test Vector Generation

#### `generate-test-vectors.js`
Generates deterministic test vectors for protocol interoperability testing.

**Usage:**
```bash
node generate-test-vectors.js > test-vectors.json
```

**Output:** JSON file with test vectors including:
- Basic message encryption/decryption
- Empty messages
- Unicode content
- Large messages (1KB)
- Public identity format
- Fingerprint derivation

**Purpose:** Ensure different implementations of the protocol are compatible.

#### `validate-test-vectors.js`
Validates an implementation against test vectors.

**Usage:**
```bash
node validate-test-vectors.js test-vectors.json
```

**Tests performed:**
- Message structure validation
- Encryption/decryption round-trip
- Signature verification
- Recipient binding enforcement
- Tampering detection
- Identity format validation
- Fingerprint derivation correctness

**Exit codes:**
- `0`: All tests passed
- `1`: One or more tests failed

### SRI Generation

#### `generate-sri.js`
Generates Subresource Integrity (SRI) hashes for CDN dependencies.

**Usage:**
```bash
node generate-sri.js
```

**Output:**
- HTML script tags with SRI attributes
- Markdown table
- JSON with hashes and metadata

**CDN URLs checked:**
- `https://unpkg.com/tweetnacl@1.0.3/nacl.min.js`
- `https://unpkg.com/tweetnacl-util@0.15.1/nacl-util.min.js`

**Why SRI?**
- Prevents execution of tampered CDN scripts
- Mitigates supply chain attacks
- Required for production security

## Installation

All tools require the crypto module dependencies:

```bash
cd tools
npm install
```

Or use from repository root:

```bash
npm install
```

## Common Workflows

### Generate and validate test vectors
```bash
# Generate
node tools/generate-test-vectors.js > tools/test-vectors.json

# Validate
node tools/validate-test-vectors.js tools/test-vectors.json
```

### Update SRI hashes after CDN version change
```bash
node tools/generate-sri.js

# Copy the HTML output to /app/index.html
```

### Interoperability testing with another implementation
1. Generate test vectors with this implementation
2. Share `test-vectors.json` with other implementation
3. Other implementation runs their validator against the vectors
4. If all tests pass, implementations are compatible

## Security Notes

- **Test vectors use deterministic keys** - NOT for production use
- **SRI hashes must be updated** when CDN versions change
- **Always verify SRI output** before deploying to production
- Consider self-hosting TweetNaCl for critical deployments
