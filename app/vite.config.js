import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: '/lifeline-mesh/',
  plugins: [viteSingleFile()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsInlineLimit: Infinity,
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
});
