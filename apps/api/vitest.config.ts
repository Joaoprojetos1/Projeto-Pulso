import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@pulso/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@pulso/fixtures': fileURLToPath(new URL('../../fixtures/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    // o banco embutido demora para subir na primeira vez
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
