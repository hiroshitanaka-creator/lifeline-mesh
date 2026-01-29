/**
 * Lifeline Mesh - Error Handling Module
 *
 * Provides categorized errors with user-friendly messages
 * for better error reporting and debugging.
 */

// Error categories
export const ErrorCategory = {
  CRYPTO: "CRYPTO",
  VALIDATION: "VALIDATION",
  STORAGE: "STORAGE",
  NETWORK: "NETWORK",
  FORMAT: "FORMAT",
  SECURITY: "SECURITY"
};

// Error codes
export const ErrorCode = {
  // Crypto errors
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
  SIGNATURE_INVALID: "SIGNATURE_INVALID",
  KEY_GENERATION_FAILED: "KEY_GENERATION_FAILED",

  // Validation errors
  CONTENT_TOO_LARGE: "CONTENT_TOO_LARGE",
  TIMESTAMP_SKEW: "TIMESTAMP_SKEW",
  RECIPIENT_MISMATCH: "RECIPIENT_MISMATCH",
  SENDER_KEY_MISMATCH: "SENDER_KEY_MISMATCH",
  INVALID_KEY_LENGTH: "INVALID_KEY_LENGTH",

  // Format errors
  INVALID_MESSAGE_FORMAT: "INVALID_MESSAGE_FORMAT",
  BASE64_DECODE_FAILED: "BASE64_DECODE_FAILED",
  JSON_PARSE_FAILED: "JSON_PARSE_FAILED",

  // Security errors
  REPLAY_DETECTED: "REPLAY_DETECTED",
  UNKNOWN_SENDER: "UNKNOWN_SENDER"
};

// User-friendly messages (Japanese)
const userMessages = {
  [ErrorCode.DECRYPTION_FAILED]: "メッセージの復号に失敗しました。鍵が正しいか確認してください。",
  [ErrorCode.SIGNATURE_INVALID]: "署名が無効です。メッセージが改ざんされている可能性があります。",
  [ErrorCode.KEY_GENERATION_FAILED]: "鍵の生成に失敗しました。",
  [ErrorCode.CONTENT_TOO_LARGE]: "コンテンツが大きすぎます（最大150KB）。",
  [ErrorCode.TIMESTAMP_SKEW]: "タイムスタンプが許容範囲外です。送信者の時刻を確認してください。",
  [ErrorCode.RECIPIENT_MISMATCH]: "このメッセージはあなた宛てではありません。",
  [ErrorCode.SENDER_KEY_MISMATCH]: "送信者の鍵が登録されている情報と一致しません。",
  [ErrorCode.INVALID_KEY_LENGTH]: "鍵の長さが無効です。",
  [ErrorCode.INVALID_MESSAGE_FORMAT]: "メッセージ形式が無効です。",
  [ErrorCode.BASE64_DECODE_FAILED]: "Base64デコードに失敗しました。",
  [ErrorCode.JSON_PARSE_FAILED]: "JSONの解析に失敗しました。",
  [ErrorCode.REPLAY_DETECTED]: "リプレイ攻撃が検出されました。このメッセージは既に処理されています。",
  [ErrorCode.UNKNOWN_SENDER]: "不明な送信者です。TOFUを有効にするか、連絡先を追加してください。"
};

// Technical messages (English)
const technicalMessages = {
  [ErrorCode.DECRYPTION_FAILED]: "Decryption failed - box.open returned null",
  [ErrorCode.SIGNATURE_INVALID]: "Signature verification failed",
  [ErrorCode.KEY_GENERATION_FAILED]: "Key pair generation failed",
  [ErrorCode.CONTENT_TOO_LARGE]: "Content exceeds maximum size",
  [ErrorCode.TIMESTAMP_SKEW]: "Timestamp skew exceeds maximum allowed",
  [ErrorCode.RECIPIENT_MISMATCH]: "Message recipientBoxPK does not match",
  [ErrorCode.SENDER_KEY_MISMATCH]: "Sender key does not match expected value",
  [ErrorCode.INVALID_KEY_LENGTH]: "Key length is invalid",
  [ErrorCode.INVALID_MESSAGE_FORMAT]: "Message format is invalid",
  [ErrorCode.BASE64_DECODE_FAILED]: "Failed to decode base64 string",
  [ErrorCode.JSON_PARSE_FAILED]: "Failed to parse JSON payload",
  [ErrorCode.REPLAY_DETECTED]: "Replay attack detected - nonce already seen",
  [ErrorCode.UNKNOWN_SENDER]: "Unknown sender - not in contacts"
};

/**
 * Custom error class for Lifeline Mesh
 */
export class LifelineMeshError extends Error {
  /**
   * @param {string} code - Error code from ErrorCode enum
   * @param {string} category - Error category from ErrorCategory enum
   * @param {string} [details] - Additional technical details
   */
  constructor(code, category, details = "") {
    const technicalMsg = technicalMessages[code] || code;
    const fullMessage = details ? `${technicalMsg}: ${details}` : technicalMsg;

    super(fullMessage);

    this.name = "LifelineMeshError";
    this.code = code;
    this.category = category;
    this.userMessage = userMessages[code] || "エラーが発生しました。";
    this.technicalMessage = fullMessage;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LifelineMeshError);
    }
  }

  /**
   * Get a user-friendly error message
   * @returns {string}
   */
  getUserMessage() {
    return this.userMessage;
  }

  /**
   * Get detailed error information for logging
   * @returns {object}
   */
  toLogObject() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.technicalMessage,
      userMessage: this.userMessage,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * Serialize error for transmission
   * @returns {object}
   */
  toJSON() {
    return {
      code: this.code,
      category: this.category,
      message: this.technicalMessage,
      userMessage: this.userMessage
    };
  }
}

/**
 * Helper function to create categorized errors
 * @param {string} code - Error code
 * @param {string} [details] - Additional details
 * @returns {LifelineMeshError}
 */
export function createError(code, details = "") {
  const categoryMap = {
    [ErrorCode.DECRYPTION_FAILED]: ErrorCategory.CRYPTO,
    [ErrorCode.SIGNATURE_INVALID]: ErrorCategory.SECURITY,
    [ErrorCode.KEY_GENERATION_FAILED]: ErrorCategory.CRYPTO,
    [ErrorCode.CONTENT_TOO_LARGE]: ErrorCategory.VALIDATION,
    [ErrorCode.TIMESTAMP_SKEW]: ErrorCategory.VALIDATION,
    [ErrorCode.RECIPIENT_MISMATCH]: ErrorCategory.VALIDATION,
    [ErrorCode.SENDER_KEY_MISMATCH]: ErrorCategory.SECURITY,
    [ErrorCode.INVALID_KEY_LENGTH]: ErrorCategory.VALIDATION,
    [ErrorCode.INVALID_MESSAGE_FORMAT]: ErrorCategory.FORMAT,
    [ErrorCode.BASE64_DECODE_FAILED]: ErrorCategory.FORMAT,
    [ErrorCode.JSON_PARSE_FAILED]: ErrorCategory.FORMAT,
    [ErrorCode.REPLAY_DETECTED]: ErrorCategory.SECURITY,
    [ErrorCode.UNKNOWN_SENDER]: ErrorCategory.SECURITY
  };

  const category = categoryMap[code] || ErrorCategory.CRYPTO;
  return new LifelineMeshError(code, category, details);
}

/**
 * Check if an error is a LifelineMeshError
 * @param {Error} error
 * @returns {error is LifelineMeshError}
 */
export function isLifelineMeshError(error) {
  return error instanceof LifelineMeshError;
}

/**
 * Convert any error to a LifelineMeshError
 * @param {Error} error
 * @param {string} [defaultCode]
 * @returns {LifelineMeshError}
 */
export function wrapError(error, defaultCode = ErrorCode.DECRYPTION_FAILED) {
  if (isLifelineMeshError(error)) {
    return error;
  }

  // Try to detect error type from message
  const msg = error.message || "";

  if (msg.includes("Content too large")) {
    return createError(ErrorCode.CONTENT_TOO_LARGE, msg);
  }
  if (msg.includes("Timestamp skew")) {
    return createError(ErrorCode.TIMESTAMP_SKEW, msg);
  }
  if (msg.includes("Invalid signature")) {
    return createError(ErrorCode.SIGNATURE_INVALID, msg);
  }
  if (msg.includes("Replay detected")) {
    return createError(ErrorCode.REPLAY_DETECTED, msg);
  }
  if (msg.includes("Decryption failed")) {
    return createError(ErrorCode.DECRYPTION_FAILED, msg);
  }
  if (msg.includes("Not intended for this recipient")) {
    return createError(ErrorCode.RECIPIENT_MISMATCH, msg);
  }
  if (msg.includes("Sender") && msg.includes("mismatch")) {
    return createError(ErrorCode.SENDER_KEY_MISMATCH, msg);
  }
  if (msg.includes("Invalid message format") || msg.includes("Invalid format")) {
    return createError(ErrorCode.INVALID_MESSAGE_FORMAT, msg);
  }
  if (msg.includes("Base64 decode failed")) {
    return createError(ErrorCode.BASE64_DECODE_FAILED, msg);
  }
  if (msg.includes("JSON parse failed") || msg.includes("Payload JSON")) {
    return createError(ErrorCode.JSON_PARSE_FAILED, msg);
  }

  return createError(defaultCode, msg);
}
