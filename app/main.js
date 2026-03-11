/**
 * Lifeline Mesh - Main Entry Point for Bundled Build
 *
 * This file imports all dependencies from npm packages instead of CDN,
 * enabling fully offline operation without any external dependencies.
 */

// Import TweetNaCl
import nacl from "tweetnacl";
import * as naclUtil from "tweetnacl-util";

// Attach util methods to nacl (like CDN version does)
nacl.util = naclUtil;

// Import QR libraries
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";

// Import crypto core
import * as DMesh from "../crypto/core.js";

// Import BLE manager
import { BLEManager } from "../bluetooth/ble-manager.js";

// Export everything for global access
window.nacl = nacl;
window.DMesh = DMesh;
window.BLEManager = BLEManager;
window.Html5Qrcode = Html5Qrcode;

// QRCode wrapper for compatibility with qrcodejs API
window.QRCode = function(element, options) {
  const canvas = document.createElement("canvas");
  element.appendChild(canvas);
  QRCode.toCanvas(canvas, options.text, {
    width: options.width || 256,
    errorCorrectionLevel: options.correctLevel === "M" ? "M" : "L"
  });
};
window.QRCode.CorrectLevel = { L: "L", M: "M", Q: "Q", H: "H" };

console.log("[Lifeline Mesh] Bundled version loaded - fully offline capable");
