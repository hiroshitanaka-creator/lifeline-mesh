import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: Infinity,
  },
});
