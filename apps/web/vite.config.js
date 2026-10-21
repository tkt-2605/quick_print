import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // PDF.js is big; keep it in its own file so it caches separately from app code.
      output: { manualChunks: { pdfjs: ['pdfjs-dist'] } },
    },
  },
  server: {
    port: 5173,
    host: true, // reachable from phones on the shop Wi-Fi
    proxy: { '/api': process.env.API_PROXY || 'http://localhost:4000' },
  },
});
