/**
 * Lifeline Mesh - Emergency UI Module
 *
 * Provides a "Panic Mode" interface for sending emergency messages
 * within 30 seconds of opening the app. Designed for high-stress
 * disaster scenarios where users may be injured, disoriented, or
 * operating under extreme time pressure.
 *
 * Features:
 *   - Voice-to-text (Web Speech API)
 *   - Pre-set emergency message templates (one tap to send)
 *   - Large, accessible emergency button
 *   - Automatic location capture (Geolocation API)
 *   - Works offline (no network required)
 *   - Completes initial send within 30 seconds
 *
 * @module app/src/emergency-ui
 */

export { EmergencyUI } from "./panic-mode.js";
export { EMERGENCY_TEMPLATES, URGENCY_LEVELS } from "./panic-mode.js";
