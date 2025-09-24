import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

/**
 * Unified Vitest configuration for the entire HAVE SDK
 *
 * This configuration handles all packages in the monorepo:
 * - Core packages (utils, files, sql, etc.) - fast unit testing
 * - SMRT modules (smrt/products, smrt/content) - with virtual module support
 * - Integration tests requiring Vite plugin capabilities
 *
 * Benefits:
 * - Single test runner for consistency
 * - Virtual module support for SMRT auto-generation
 * - Simplified development workflow
 * - Better IDE integration
 */
export default defineConfig({
  plugins: [
    // Svelte plugin for SMRT modules that need it
    svelte(),
  ],

  test: {
    // Global test setup
    setupFiles: ['./vitest.setup.ts'],

    // Only include TypeScript test files to avoid duplicates
    include: ['packages/*/src/**/*.{test,spec}.{ts,mts}'],

    // Exclude only what Vitest shouldn't handle
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/docs/**',
      'e2e-tests/**',
      'test-results/**',
      'playwright-report/**',
      '**/*.d.ts',
      '**/coverage/**',
    ],

    // Environment configuration
    environment: 'node',

    // Timeouts for different test types
    testTimeout: 30000, // Longer for potential OCR/PDF processing
    hookTimeout: 10000,

    // Reporter configuration
    reporter: process.env.CI ? 'github' : 'default',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{js,ts}'],
      exclude: [
        'packages/*/src/**/*.{test,spec}.{js,ts}',
        'packages/*/src/**/*.d.ts',
      ],
    },

    // Pool options for parallel execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially to avoid memory issues
        isolate: true,
      },
    },

    // Increase memory limit for OCR tests
    maxWorkers: 1,
  },

  // Let Node.js module resolution handle workspace packages through package.json exports
  resolve: {
    alias: {
      // Only non-package aliases
      $lib: '/src/lib',
    },
  },

  // Optimize dependencies for faster test startup
  optimizeDeps: {
    include: ['vitest', '@have/utils', 'tesseract.js'],
  },
});
