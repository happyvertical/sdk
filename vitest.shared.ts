import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Test-runner defaults shared by root and package-local Vitest invocations.
 * Keep package discovery and package-specific overrides in their own configs.
 */
export const sharedVitestConfig = defineConfig({
  test: {
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
  },
});
