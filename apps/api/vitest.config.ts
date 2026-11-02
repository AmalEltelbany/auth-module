import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC keeps the decorator metadata Nest's dependency injection reads;
  // Vite's default transform drops it.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.e2e-spec.ts'],
    env: {
      // One mongod cache for the repo, wherever vitest is started from. Without
      // it, running from apps/api falls back to ~/.cache and re-downloads ~800 MB.
      MONGOMS_DOWNLOAD_DIR: fileURLToPath(new URL('../../node_modules/.cache/mongodb-memory-server', import.meta.url)),
    },
    hookTimeout: 300_000, // the first run ever downloads the mongod binary
    testTimeout: 30_000,
  },
});
