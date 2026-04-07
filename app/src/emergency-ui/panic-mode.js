/**
 * Lifeline Mesh - Panic Mode UI
 *
 * Emergency-first interface: designed to get the first emergency
 * message sent within 30 seconds of the user opening the app.
 *
 * Design principles:
 *   - Huge touch targets (min 64px × 64px)
 *   - High-contrast colors (red/yellow on dark)
 *   - Single action per screen (reduce cognitive load)
 *   - No required reading — icons + short labels
 *   - Voice input by default (hands may be shaking)
 *   - Pre-filled templates for common disaster scenarios
 *
 * @module app/src/emergency-ui/panic-mode
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const URGENCY_LEVELS = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

/** Pre-set emergency message templates (translatable via i18n). */
export const EMERGENCY_TEMPLATES = [
  {
    id: "im_safe",
    type: "im_safe",
    urgency: URGENCY_LEVELS.LOW,
    icon: "✅",
    labelKey: "emergency.template.im_safe",
    defaultLabel: "I AM SAFE",
    defaultContent: "I am safe. No injuries.",
    color: "#22c55e"
  },
  {
    id: "need_rescue",
    type: "need_help",
    urgency: URGENCY_LEVELS.CRITICAL,
    icon: "🆘",
    labelKey: "emergency.template.need_rescue",
    defaultLabel: "NEED RESCUE",
    defaultContent: "I need rescue. Please send help immediately.",
    needs: ["rescue"],
    color: "#ef4444"
  },
  {
    id: "need_medical",
    type: "medical",
    urgency: URGENCY_LEVELS.CRITICAL,
    icon: "🏥",
    labelKey: "emergency.template.need_medical",
    defaultLabel: "MEDICAL EMERGENCY",
    defaultContent: "Medical emergency. Need medical assistance now.",
    color: "#f97316"
  },
  {
    id: "trapped",
    type: "need_help",
    urgency: URGENCY_LEVELS.CRITICAL,
    icon: "🚨",
    labelKey: "emergency.template.trapped",
    defaultLabel: "TRAPPED",
    defaultContent: "I am trapped and cannot move. Please send rescue.",
    needs: ["rescue"],
    color: "#ef4444"
  },
  {
    id: "shelter_info",
    type: "shelter_info",
    urgency: URGENCY_LEVELS.MEDIUM,
    icon: "🏠",
    labelKey: "emergency.template.shelter",
    defaultLabel: "SHELTER HERE",
    defaultContent: "There is shelter available at my location.",
    color: "#3b82f6"
  },
  {
    id: "need_water",
    type: "need_help",
    urgency: URGENCY_LEVELS.HIGH,
    icon: "💧",
    labelKey: "emergency.template.need_water",
    defaultLabel: "NEED WATER",
    defaultContent: "Urgently need clean water and food.",
    needs: ["water", "food"],
    color: "#f59e0b"
  }
];

// ─── EmergencyUI ─────────────────────────────────────────────────────────────

/**
 * Emergency UI controller.
 *
 * Usage:
 *   const ui = new EmergencyUI({
 *     container: document.getElementById("emergency-ui"),
 *     onSend: async (payload) => { await sendMessage(payload); },
 *     i18n: (key, fallback) => translations[key] || fallback,
 *     contacts: [...],  // recipients (defaults to broadcast)
 *   });
 *
 *   ui.activate();  // Switch to panic mode
 *   ui.deactivate(); // Return to normal mode
 */
export class EmergencyUI {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container       - Mount point
   * @param {Function}    options.onSend          - async (payload: Object) → void
   * @param {Function}    [options.i18n]          - (key, fallback) → string
   * @param {Array}       [options.contacts]      - Recipient list (empty = broadcast)
   * @param {boolean}     [options.voiceEnabled]  - Enable voice input (default: true)
   * @param {Object}      [options.location]      - Pre-fetched location { lat, lng, accuracy }
   */
  constructor(options = {}) {
    if (!options.container) throw new Error("EmergencyUI: container is required");
    if (!options.onSend) throw new Error("EmergencyUI: onSend is required");

    this.container = options.container;
    this.onSend = options.onSend;
    this.i18n = options.i18n ?? ((_, fb) => fb);
    this.contacts = options.contacts ?? [];
    this.voiceEnabled = options.voiceEnabled ?? true;
    this._location = options.location ?? null;

    this._active = false;
    this._sending = false;
    this._recognition = null;
    this._sendTimer = null;
    this._activatedAt = null;

    this._el = null;
    this._voiceTextarea = null;
    this._statusEl = null;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Activate panic mode. Renders the emergency UI over the normal app. */
  activate() {
    if (this._active) return;
    this._active = true;
    this._activatedAt = Date.now();

    this._render();
    this._startLocationCapture();
    if (this.voiceEnabled) this._startVoiceInput();
  }

  /** Deactivate panic mode and restore normal UI. */
  deactivate() {
    this._active = false;
    this._stopVoiceInput();
    if (this._sendTimer) clearTimeout(this._sendTimer);

    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }

  // ─── Rendering ──────────────────────────────────────────────────────────────

  _render() {
    const el = document.createElement("div");
    el.id = "lifeline-panic-mode";
    el.setAttribute("role", "main");
    el.setAttribute("aria-label", this.i18n("emergency.aria.label", "Emergency mode"));

    el.innerHTML = `
      <style>
        #lifeline-panic-mode {
          position: fixed;
          inset: 0;
          background: #0f0f0f;
          color: #fff;
          font-family: system-ui, sans-serif;
          z-index: 99999;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 0;
        }
        #lifeline-panic-mode .lpm-header {
          background: #ef4444;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        #lifeline-panic-mode .lpm-header .lpm-timer {
          margin-left: auto;
          font-size: 16px;
          opacity: 0.85;
          font-variant-numeric: tabular-nums;
        }
        #lifeline-panic-mode .lpm-section-title {
          color: #9ca3af;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 16px 20px 8px;
        }
        #lifeline-panic-mode .lpm-templates {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          padding: 0 16px;
        }
        #lifeline-panic-mode .lpm-template-btn {
          border: none;
          border-radius: 12px;
          padding: 20px 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          min-height: 96px;
          touch-action: manipulation;
          transition: transform 0.1s, opacity 0.1s;
        }
        #lifeline-panic-mode .lpm-template-btn:active {
          transform: scale(0.97);
          opacity: 0.85;
        }
        #lifeline-panic-mode .lpm-template-icon {
          font-size: 28px;
          line-height: 1;
        }
        #lifeline-panic-mode .lpm-voice-area {
          padding: 16px;
        }
        #lifeline-panic-mode .lpm-voice-btn {
          width: 100%;
          padding: 20px;
          background: #1d4ed8;
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          touch-action: manipulation;
        }
        #lifeline-panic-mode .lpm-voice-btn.active {
          background: #dc2626;
          animation: pulse 1s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        #lifeline-panic-mode .lpm-textarea {
          width: 100%;
          min-height: 80px;
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 8px;
          color: #fff;
          font-size: 16px;
          padding: 12px;
          margin-top: 8px;
          box-sizing: border-box;
          resize: vertical;
        }
        #lifeline-panic-mode .lpm-send-btn {
          margin: 16px;
          padding: 24px;
          background: #ef4444;
          border: none;
          border-radius: 16px;
          color: #fff;
          font-size: 20px;
          font-weight: 900;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          touch-action: manipulation;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        #lifeline-panic-mode .lpm-send-btn:disabled {
          background: #374151;
          cursor: not-allowed;
        }
        #lifeline-panic-mode .lpm-status {
          padding: 0 16px 8px;
          font-size: 13px;
          color: #6b7280;
          text-align: center;
          min-height: 20px;
        }
        #lifeline-panic-mode .lpm-status.success { color: #22c55e; }
        #lifeline-panic-mode .lpm-status.error { color: #ef4444; }
        #lifeline-panic-mode .lpm-close-btn {
          margin: 8px 16px 24px;
          padding: 16px;
          background: transparent;
          border: 1px solid #374151;
          border-radius: 12px;
          color: #9ca3af;
          font-size: 14px;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      </style>

      <div class="lpm-header">
        <span>🆘</span>
        <span>${this.i18n("emergency.header", "EMERGENCY")}</span>
        <span class="lpm-timer" id="lpm-timer">0:00</span>
      </div>

      <div class="lpm-section-title">
        ${this.i18n("emergency.tap_to_send", "TAP TO SEND")}
      </div>

      <div class="lpm-templates" id="lpm-templates"></div>

      <div class="lpm-voice-area">
        <div class="lpm-section-title" style="padding:0 0 8px">
          ${this.i18n("emergency.or_type", "OR TYPE / SPEAK YOUR MESSAGE")}
        </div>
        <button class="lpm-voice-btn" id="lpm-voice-btn" aria-label="${this.i18n("emergency.voice_btn", "Hold to speak")}">
          <span>🎙️</span>
          <span id="lpm-voice-label">${this.i18n("emergency.voice_btn", "TAP TO SPEAK")}</span>
        </button>
        <textarea
          class="lpm-textarea"
          id="lpm-voice-text"
          placeholder="${this.i18n("emergency.text_placeholder", "Type your message here...")}"
          rows="3"
        ></textarea>
      </div>

      <div class="lpm-status" id="lpm-status" role="status" aria-live="polite"></div>

      <button class="lpm-send-btn" id="lpm-send-btn" aria-label="${this.i18n("emergency.send_btn", "Send emergency message")}">
        <span>📡</span>
        <span>${this.i18n("emergency.send_btn", "SEND SOS")}</span>
      </button>

      <button class="lpm-close-btn" id="lpm-close-btn">
        ${this.i18n("emergency.exit_panic", "Exit Emergency Mode")}
      </button>
    `;

    this.container.appendChild(el);
    this._el = el;
    this._voiceTextarea = el.querySelector("#lpm-voice-text");
    this._statusEl = el.querySelector("#lpm-status");

    this._renderTemplates();
    this._bindEvents();
    this._startElapsedTimer();
  }

  _renderTemplates() {
    const container = this._el.querySelector("#lpm-templates");
    for (const tmpl of EMERGENCY_TEMPLATES) {
      const btn = document.createElement("button");
      btn.className = "lpm-template-btn";
      btn.style.background = tmpl.color;
      btn.setAttribute("data-template-id", tmpl.id);
      btn.setAttribute("aria-label", this.i18n(tmpl.labelKey, tmpl.defaultLabel));
      btn.innerHTML = `
        <span class="lpm-template-icon">${tmpl.icon}</span>
        <span>${this.i18n(tmpl.labelKey, tmpl.defaultLabel)}</span>
      `;
      btn.addEventListener("click", () => this._sendTemplate(tmpl));
      container.appendChild(btn);
    }
  }

  _bindEvents() {
    // Voice button
    const voiceBtn = this._el.querySelector("#lpm-voice-btn");
    const voiceLabel = this._el.querySelector("#lpm-voice-label");

    voiceBtn.addEventListener("click", () => {
      if (this._recognition && this._recognizing) {
        this._stopVoiceInput();
        voiceLabel.textContent = this.i18n("emergency.voice_btn", "TAP TO SPEAK");
        voiceBtn.classList.remove("active");
      } else {
        this._startVoiceInput();
        voiceLabel.textContent = this.i18n("emergency.voice_listening", "LISTENING...");
        voiceBtn.classList.add("active");
      }
    });

    // Custom send button
    const sendBtn = this._el.querySelector("#lpm-send-btn");
    sendBtn.addEventListener("click", () => {
      const text = this._voiceTextarea?.value?.trim();
      if (!text) {
        this._setStatus(this.i18n("emergency.error.empty", "Please type or speak a message"), "error");
        return;
      }
      this._sendCustomMessage(text);
    });

    // Close button
    this._el.querySelector("#lpm-close-btn").addEventListener("click", () => {
      this.deactivate();
    });
  }

  // ─── Send logic ─────────────────────────────────────────────────────────────

  async _sendTemplate(template) {
    if (this._sending) return;
    this._sending = true;

    const payload = {
      v: 2,
      ts: Date.now(),
      type: template.type,
      urgency: template.urgency,
      content: template.defaultContent,
      people: 1
    };

    if (template.needs) payload.needs = template.needs;
    if (this._location) payload.location = this._location;

    this._setStatus(this.i18n("emergency.sending", "Sending..."));

    try {
      await this.onSend(payload);
      this._setStatus(
        this.i18n("emergency.sent", "✓ Message sent via mesh network"),
        "success"
      );
    } catch (err) {
      this._setStatus(
        this.i18n("emergency.send_failed", "Send failed — queued for retry when connected"),
        "error"
      );
      console.error("[EmergencyUI] send failed:", err);
    } finally {
      this._sending = false;
    }
  }

  async _sendCustomMessage(text) {
    if (this._sending) return;
    this._sending = true;

    const sendBtn = this._el?.querySelector("#lpm-send-btn");
    if (sendBtn) sendBtn.disabled = true;

    const payload = {
      v: 2,
      ts: Date.now(),
      type: "need_help",
      urgency: URGENCY_LEVELS.HIGH,
      content: text
    };
    if (this._location) payload.location = this._location;

    this._setStatus(this.i18n("emergency.sending", "Sending..."));

    try {
      await this.onSend(payload);
      this._setStatus(
        this.i18n("emergency.sent", "✓ Message sent via mesh network"),
        "success"
      );
      if (this._voiceTextarea) this._voiceTextarea.value = "";
    } catch (err) {
      this._setStatus(
        this.i18n("emergency.send_failed", "Send failed — queued for retry"),
        "error"
      );
    } finally {
      this._sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // ─── Voice input ─────────────────────────────────────────────────────────────

  _recognizing = false;

  _startVoiceInput() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      console.warn("[EmergencyUI] Speech recognition not supported");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (this._voiceTextarea) {
        this._voiceTextarea.value = transcript;
      }
    };

    recognition.onerror = (event) => {
      console.warn("[EmergencyUI] Speech recognition error:", event.error);
      this._recognizing = false;
    };

    recognition.onend = () => {
      this._recognizing = false;
    };

    try {
      recognition.start();
      this._recognition = recognition;
      this._recognizing = true;
    } catch (err) {
      console.warn("[EmergencyUI] Could not start speech recognition:", err);
    }
  }

  _stopVoiceInput() {
    if (this._recognition) {
      try { this._recognition.stop(); } catch { /* ignore */ }
      this._recognition = null;
      this._recognizing = false;
    }
  }

  // ─── Location capture ─────────────────────────────────────────────────────────

  _startLocationCapture() {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._location = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        this._setStatus(
          this.i18n("emergency.location_captured", "Location captured"),
          "success"
        );
        setTimeout(() => this._setStatus(""), 2000);
      },
      (err) => {
        console.warn("[EmergencyUI] Geolocation error:", err.message);
      },
      { timeout: 10000, maximumAge: 30000 }
    );
  }

  // ─── Elapsed timer ─────────────────────────────────────────────────────────────

  _startElapsedTimer() {
    const timerEl = this._el?.querySelector("#lpm-timer");
    if (!timerEl) return;

    const tick = () => {
      if (!this._active) return;
      const elapsed = Math.floor((Date.now() - this._activatedAt) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      timerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ─── Status helpers ──────────────────────────────────────────────────────────

  _setStatus(msg, type = "") {
    if (!this._statusEl) return;
    this._statusEl.textContent = msg;
    this._statusEl.className = `lpm-status ${type}`;
  }
}
