import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC keeps the decorator metadata Nest's dependency injection reads;
  // Vite's default transform drops it.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.e2e-spec.ts'],
    hookTimeout: 120_000, // first run downloads a mongod binary
    testTimeout: 30_000,
  },
});
