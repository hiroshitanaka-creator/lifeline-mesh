#!/usr/bin/env node
/**
 * Generate Subresource Integrity (SRI) hashes for CDN dependencies
 *
 * Fetches CDN files and generates SHA-384 hashes for integrity attributes.
 * This ensures that CDN-loaded scripts haven't been tampered with.
 *
 * Usage: node generate-sri.js
 */

import https from 'https';
import crypto from 'crypto';

const CDN_URLS = [
  'https://unpkg.com/tweetnacl@1.0.3/nacl.min.js',
  'https://unpkg.com/tweetnacl-util@0.15.1/nacl-util.min.js'
];

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function generateSRI(buffer, algorithm = 'sha384') {
  const hash = crypto.createHash(algorithm).update(buffer).digest('base64');
  return `${algorithm}-${hash}`;
}

async function generateAllSRI() {
  console.log('Generating SRI hashes for CDN dependencies...\n');

  const results = [];

  for (const url of CDN_URLS) {
    try {
      console.log(`Fetching: ${url}`);
      const content = await fetchUrl(url);
      const sri = generateSRI(content);
      const size = (content.length / 1024).toFixed(2);

      results.push({
        url,
        sri,
        size: `${size} KB`,
        algorithm: 'sha384'
      });

      console.log(`  Size: ${size} KB`);
      console.log(`  SRI:  ${sri}\n`);
    } catch (e) {
      console.error(`  Error: ${e.message}\n`);
      results.push({
        url,
        error: e.message
      });
    }
  }

  return results;
}

function generateHTML(results) {
  console.log('='.repeat(70));
  console.log('HTML Script Tags with SRI:');
  console.log('='.repeat(70));
  console.log('');

  for (const result of results) {
    if (result.error) {
      console.log(`<!-- Error fetching ${result.url}: ${result.error} -->`);
    } else {
      const scriptTag = `<script src="${result.url}" integrity="${result.sri}" crossorigin="anonymous"></script>`;
      console.log(scriptTag);
    }
  }

  console.log('');
}

function generateJSON(results) {
  console.log('='.repeat(70));
  console.log('JSON Output:');
  console.log('='.repeat(70));
  console.log('');
  console.log(JSON.stringify(results, null, 2));
  console.log('');
}

function generateMarkdown(results) {
  console.log('='.repeat(70));
  console.log('Markdown Table:');
  console.log('='.repeat(70));
  console.log('');
  console.log('| URL | Size | SRI Hash |');
  console.log('|-----|------|----------|');

  for (const result of results) {
    if (result.error) {
      console.log(`| ${result.url} | - | Error: ${result.error} |`);
    } else {
      console.log(`| ${result.url} | ${result.size} | \`${result.sri}\` |`);
    }
  }

  console.log('');
}

// Main
(async () => {
  try {
    const results = await generateAllSRI();
    generateHTML(results);
    generateMarkdown(results);
    generateJSON(results);

    console.log('='.repeat(70));
    console.log('Security Notes:');
    console.log('='.repeat(70));
    console.log('');
    console.log('1. Always use SRI with crossorigin="anonymous" for CDN scripts');
    console.log('2. If SRI verification fails, the browser will refuse to execute the script');
    console.log('3. Update SRI hashes whenever you update CDN versions');
    console.log('4. Consider self-hosting critical dependencies for production');
    console.log('');
  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  }
})();
