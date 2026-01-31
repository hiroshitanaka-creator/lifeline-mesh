import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "app",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "app/index.html")
      }
    },
    // Inline all assets for maximum portability
    assetsInlineLimit: 1024 * 1024, // 1MB
    cssCodeSplit: false,
    // Generate source maps for debugging
    sourcemap: true
  },
  // Resolve crypto modules
  resolve: {
    alias: {
      "tweetnacl": resolve(__dirname, "node_modules/tweetnacl/nacl.js"),
      "tweetnacl-util": resolve(__dirname, "node_modules/tweetnacl-util/nacl-util.js")
    }
  },
  // Development server
  server: {
    port: 3000,
    open: true
  },
  // Preview server for built files
  preview: {
    port: 4173
  }
});
