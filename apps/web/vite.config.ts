import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') },
  },
  server: {
    // Same origin in dev, so cookies and the API's CSRF check behave as in production.
    // changeOrigin stays false: the API compares Origin with the Host it receives.
    proxy: { '/api': 'http://localhost:3001' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
