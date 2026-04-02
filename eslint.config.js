const sharedLanguageOptions = {
  ecmaVersion: 2022,
  sourceType: "module",
  globals: {
    console: "readonly",
    process: "readonly",
    Buffer: "readonly",
    __dirname: "readonly",
    __filename: "readonly",
    window: "readonly",
    document: "readonly",
    navigator: "readonly",
    indexedDB: "readonly",
    localStorage: "readonly",
    Blob: "readonly",
    URL: "readonly",
    alert: "readonly",
    confirm: "readonly",
    prompt: "readonly",
    TextEncoder: "readonly",
    TextDecoder: "readonly",
    setTimeout: "readonly",
    clearTimeout: "readonly",
    setInterval: "readonly",
    clearInterval: "readonly",
    crypto: "readonly",
    FileReader: "readonly",
    DataView: "readonly",
    Worker: "readonly",
    self: "readonly",
    fetch: "readonly",
    caches: "readonly",
    nacl: "readonly",
    QRCode: "readonly",
    Html5Qrcode: "readonly"
  }
};

const coreRules = {
  "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
  "no-undef": "error",
  "no-console": "off",
  "no-debugger": "error",
  "eqeqeq": ["error", "always"],
  "no-var": "error",
  "prefer-const": "error",
  "no-implicit-coercion": "error",
  "no-throw-literal": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-script-url": "error",
  "curly": ["error", "multi-line"],
  "default-case": "error",
  "dot-notation": "error",
  "no-else-return": "error",
  "no-empty-function": "error",
  "no-floating-decimal": "error",
  "no-lone-blocks": "error",
  "no-self-compare": "error",
  "no-sequences": "error",
  "no-useless-concat": "error",
  "no-useless-return": "error",
  "yoda": "error"
};

export default [
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "*.min.js"
    ]
  },
  {
    files: ["crypto/**/*.js", "tools/**/*.js", "tests/**/*.js", "app/src/**/*.js", "bluetooth/**/*.js"],
    languageOptions: sharedLanguageOptions,
    rules: coreRules
  }
];
