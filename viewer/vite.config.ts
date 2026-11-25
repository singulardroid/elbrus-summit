import { defineConfig } from 'vite';

// Pipeline output (data/build/) is served as static files: /elbrus/manifest.json etc.
// In production builds it is copied into dist/ next to the app.
export default defineConfig({
  base: './',
  publicDir: '../data/build',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
