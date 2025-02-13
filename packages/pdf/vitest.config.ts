import { defineConfig, mergeConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    exclude: [],
    include: ['src/**/*.spec.ts'],
    // globalSetup: "vitest.setup.js",
  },
});
