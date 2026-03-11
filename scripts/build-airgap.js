#!/usr/bin/env node
/**
 * Lifeline Mesh - Air-Gap Build Script
 *
 * Generates a single HTML file with ALL dependencies inlined:
 * - JavaScript (TweetNaCl, QR libraries, app code)
 * - CSS (already inline)
 * - No external network requests required
 *
 * Usage: node scripts/build-airgap.js
 * Output: dist/lifeline-mesh-airgap.html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

console.log("🔧 Lifeline Mesh Air-Gap Builder");
console.log("================================\n");

// Ensure dist directory exists
const distDir = resolve(ROOT, "dist");
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Read source files
function readFile(path) {
  const fullPath = resolve(ROOT, path);
  console.log(`  Reading: ${path}`);
  return readFileSync(fullPath, "utf-8");
}

// Load all JavaScript dependencies
console.log("📦 Loading dependencies...");

let tweetnacl, tweetnaclUtil;
try {
  tweetnacl = readFile("node_modules/tweetnacl/nacl.js");
  tweetnaclUtil = readFile("node_modules/tweetnacl-util/nacl-util.js");
} catch (e) {
  console.error("❌ Dependencies not found. Run 'npm install' first.");
  process.exit(1);
}

// Load app modules
console.log("\n📄 Loading app modules...");
const cryptoCore = readFile("crypto/core.js");
const bleConstants = readFile("bluetooth/constants.js");
const bleManager = readFile("bluetooth/ble-manager.js");

// Load HTML template
console.log("\n📄 Loading HTML template...");
const htmlTemplate = readFile("app/index.html");

// Build inline script
console.log("\n🔨 Building inline script...");

const inlineScript = `
// ============================================
// Lifeline Mesh - Air-Gap Bundle
// Generated: ${new Date().toISOString()}
// All dependencies inlined - zero network required
// ============================================

(function() {
  "use strict";

  // ============ TweetNaCl ============
  ${tweetnacl}

  // ============ TweetNaCl-Util ============
  (function() {
    ${tweetnaclUtil.replace(/module\.exports\s*=\s*/, "window.naclUtil = ")}
  })();

  // Attach util to nacl
  if (typeof nacl !== "undefined" && typeof naclUtil !== "undefined") {
    nacl.util = naclUtil;
  }

  // ============ BLE Constants ============
  const BLE_CONSTANTS = (function() {
    ${bleConstants
    .replace(/export const /g, "const ")
    .replace(/export \{[^}]*\};?/g, "")}
    return { SERVICE_UUID, CHARACTERISTICS, MSG_TYPE, CONFIG, BLE_ERROR };
  })();

  window.BLE_CONSTANTS = BLE_CONSTANTS;

  // ============ BLE Manager ============
  window.BLEManager = (function() {
    const { SERVICE_UUID, CHARACTERISTICS, MSG_TYPE, CONFIG, BLE_ERROR } = BLE_CONSTANTS;

    ${bleManager
    .replace(/import \{[^}]+\} from [^;]+;/g, "")
    .replace(/export class BLEManager/g, "class BLEManager")
    .replace(/export default BLEManager;?/g, "")}

    return BLEManager;
  })();

  // ============ Crypto Core (DMesh) ============
  window.DMesh = (function() {
    const exports = {};

    ${cryptoCore
    .replace(/export (const|function|class) /g, "exports.$1 = $1 ")
    .replace(/export \{[^}]*\};?/g, "")}

    return exports;
  })();

  // ============ QR Code (minimal implementation) ============
  // Using a simplified QR code generator for air-gap mode
  // For full QR functionality, use the bundled build with npm dependencies

  window.QRCode = function(element, options) {
    const text = options.text || "";
    const size = options.width || 256;

    // Create a simple text fallback for air-gap mode
    const container = document.createElement("div");
    container.style.cssText = "padding: 20px; background: #fff; border: 2px solid #333; border-radius: 8px; text-align: center;";

    const label = document.createElement("div");
    label.style.cssText = "font-size: 12px; color: #666; margin-bottom: 10px;";
    label.textContent = "📋 Copy this text to share your ID:";

    const textArea = document.createElement("textarea");
    textArea.style.cssText = "width: 100%; height: 80px; font-family: monospace; font-size: 10px; resize: none;";
    textArea.value = text;
    textArea.readOnly = true;
    textArea.onclick = function() { this.select(); };

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy to Clipboard";
    copyBtn.style.cssText = "margin-top: 10px; padding: 8px 16px; cursor: pointer;";
    copyBtn.onclick = async function() {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "✓ Copied!";
      setTimeout(() => { copyBtn.textContent = "📋 Copy to Clipboard"; }, 2000);
    };

    const note = document.createElement("div");
    note.style.cssText = "font-size: 10px; color: #999; margin-top: 10px;";
    note.textContent = "(Air-gap mode: QR code disabled. Use copy/paste instead.)";

    container.appendChild(label);
    container.appendChild(textArea);
    container.appendChild(copyBtn);
    container.appendChild(note);
    element.appendChild(container);
  };
  window.QRCode.CorrectLevel = { L: "L", M: "M", Q: "Q", H: "H" };

  // ============ QR Scanner (disabled in air-gap mode) ============
  window.Html5Qrcode = class Html5Qrcode {
    constructor(elementId) {
      this.elementId = elementId;
      this.isScanning = false;
    }

    async start(config, settings, onSuccess, onError) {
      const element = document.getElementById(this.elementId);
      if (element) {
        element.innerHTML = \`
          <div style="padding: 20px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; text-align: center;">
            <p style="color: #856404; margin: 0;">⚠️ QR Scanner not available in air-gap mode</p>
            <p style="color: #856404; font-size: 12px; margin-top: 8px;">
              Ask sender to copy their ID as text, then paste it in the contact input field.
            </p>
          </div>
        \`;
      }
      this.isScanning = true;
    }

    async stop() {
      this.isScanning = false;
    }
  };

  console.log("[Lifeline Mesh] Air-gap bundle loaded - fully offline capable");
})();
`;

// Generate the air-gap HTML
console.log("\n📝 Generating air-gap HTML...");

// Replace CDN scripts with inline script
let airgapHtml = htmlTemplate
  // Remove CDN script tags
  .replace(/<!-- CDN dependencies.*?-->/s, "<!-- All dependencies inlined below -->")
  .replace(/<script src="https:\/\/unpkg\.com\/tweetnacl[^>]+><\/script>/g, "")
  .replace(/<script src="https:\/\/unpkg\.com\/qrcodejs[^>]+><\/script>/g, "")
  .replace(/<script src="https:\/\/unpkg\.com\/html5-qrcode[^>]+><\/script>/g, "")
  // Remove QR Code libraries comments
  .replace(/<!-- QR Code libraries with SRI -->/g, "");

// Find the position to insert our inline script (before the module script)
const moduleScriptStart = airgapHtml.indexOf('<script type="module">');
if (moduleScriptStart === -1) {
  console.error("❌ Could not find module script in HTML");
  process.exit(1);
}

// Insert inline dependencies before the module script
airgapHtml = airgapHtml.slice(0, moduleScriptStart) +
  `<!-- Air-Gap Bundle: All dependencies inlined -->
<script>
${inlineScript}
</script>

` + airgapHtml.slice(moduleScriptStart);

// Update the module script to use window globals instead of imports
airgapHtml = airgapHtml
  .replace(
    /import \* as DMesh from '\.\.\/crypto\/core\.js';/g,
    "const DMesh = window.DMesh;"
  )
  .replace(
    /import \{ BLEManager \} from '\.\.\/bluetooth\/ble-manager\.js';/g,
    "const BLEManager = window.BLEManager;"
  );

// Add air-gap indicator to the title and header
airgapHtml = airgapHtml
  .replace(
    "<title>Lifeline Mesh - Emergency Messaging</title>",
    "<title>Lifeline Mesh - Emergency Messaging [AIR-GAP]</title>"
  )
  .replace(
    "<h1>🌐 Lifeline Mesh</h1>",
    '<h1>🌐 Lifeline Mesh <span style="font-size: 12px; background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; margin-left: 8px;">AIR-GAP</span></h1>'
  );

// Write output
const outputPath = resolve(distDir, "lifeline-mesh-airgap.html");
writeFileSync(outputPath, airgapHtml, "utf-8");

const fileSizeKB = (Buffer.byteLength(airgapHtml, "utf-8") / 1024).toFixed(1);

console.log("\n✅ Air-gap build complete!");
console.log(`   Output: ${outputPath}`);
console.log(`   Size: ${fileSizeKB} KB`);
console.log("\n📋 Usage:");
console.log("   1. Copy lifeline-mesh-airgap.html to any device");
console.log("   2. Open in any modern browser (Chrome, Firefox, Safari, Edge)");
console.log("   3. Works completely offline - no internet required!");
console.log("\n⚠️  Note: QR code scanning is disabled in air-gap mode.");
console.log("   Use copy/paste for contact exchange instead.");
