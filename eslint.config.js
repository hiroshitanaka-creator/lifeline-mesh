import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        indexedDB: "readonly",
        Blob: "readonly",
        URL: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        // External libraries
        nacl: "readonly",
        QRCode: "readonly",
        Html5Qrcode: "readonly"
      }
    },
    rules: {
      // Error prevention
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-undef": "error",
      "no-console": "off",
      "no-debugger": "error",

      // Code quality
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-implicit-coercion": "error",
      "no-throw-literal": "error",
      "no-return-await": "error",
      "require-await": "error",

      // Security
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Best practices
      "curly": ["error", "multi-line"],
      "default-case": "error",
      "dot-notation": "error",
      "no-else-return": "error",
      "no-empty-function": "error",
      "no-floating-decimal": "error",
      "no-lone-blocks": "error",
      "no-multi-spaces": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-useless-concat": "error",
      "no-useless-return": "error",
      "yoda": "error",

      // Style consistency
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true, "allowTemplateLiterals": true }],
      "indent": ["error", 2, { "SwitchCase": 1 }],
      "comma-dangle": ["error", "never"],
      "no-trailing-spaces": "error",
      "no-multiple-empty-lines": ["error", { "max": 2 }]
    }
  },
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "app/**",
      "*.min.js"
    ]
  }
];
