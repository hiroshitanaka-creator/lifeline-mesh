import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  // In dev mode (used by E2E tests via playwright webServer), serve from root.
  // In build mode, use the GitHub Pages sub-path so deployed assets resolve correctly.
  base: command === "build" ? "/lifeline-mesh/" : "/",
  plugins: [viteSingleFile()],
  publicDir: "public",
  build: {
    outDir: "dist",
    assetsInlineLimit: Infinity
  },
  server: {
    fs: {
      allow: [".."]
    }
  }
}));
