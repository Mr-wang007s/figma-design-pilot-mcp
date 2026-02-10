import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'bin/**'],
    },
    // Each test file gets its own isolated DB
    pool: 'forks',
    testTimeout: 10_000,
  },
});
