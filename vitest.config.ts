import { resolve } from 'node:path';
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
    // Core packages don't need Svelte plugin for testing
    // Individual packages can add their own plugins if needed
  ],

  test: {
    // Global test setup
    setupFiles: ['./vitest.setup.ts'],

    // Only include TypeScript test files to avoid duplicates
    include: [
      'packages/core/*/src/**/*.{test,spec}.{ts,mts}',
      'packages/modules/*/src/**/*.{test,spec}.{ts,mts}',
    ],

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
    reporters: ['default'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/*/src/**/*.{js,ts}',
        'packages/modules/*/src/**/*.{js,ts}',
      ],
      exclude: [
        'packages/core/*/src/**/*.{test,spec}.{js,ts}',
        'packages/modules/*/src/**/*.{test,spec}.{js,ts}',
        'packages/core/*/src/**/*.d.ts',
        'packages/modules/*/src/**/*.d.ts',
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

  // Resolve workspace packages for testing
  resolve: {
    alias: {
      '@have/utils': resolve(__dirname, 'packages/core/utils/src'),
      '@have/files': resolve(__dirname, 'packages/core/files/src'),
      '@have/cache': resolve(__dirname, 'packages/core/cache/src'),
      '@have/sql': resolve(__dirname, 'packages/core/sql/src'),
      '@have/ocr': resolve(__dirname, 'packages/core/ocr/src'),
      '@have/pdf': resolve(__dirname, 'packages/core/pdf/src'),
      '@have/ai': resolve(__dirname, 'packages/core/ai/src'),
      '@have/spider': resolve(__dirname, 'packages/core/spider/src'),
      '@have/smrt': resolve(__dirname, 'packages/core/smrt/src'),
      '@have/tags': resolve(__dirname, 'packages/modules/tags/src'),
      '@have/places': resolve(__dirname, 'packages/modules/places/src'),
      '@have/profiles': resolve(__dirname, 'packages/modules/profiles/src'),
      '@have/events': resolve(__dirname, 'packages/modules/events/src'),
      '@have/assets': resolve(__dirname, 'packages/modules/assets/src'),
      '@have/accounts': resolve(__dirname, 'packages/modules/accounts/src'),
      '@have/gnode': resolve(__dirname, 'packages/modules/gnode/src'),
      '@have/content': resolve(__dirname, 'packages/modules/content/src'),
      '@have/products': resolve(__dirname, 'packages/modules/products/src'),
      $lib: '/src/lib',
    },
  },

  // Optimize dependencies for faster test startup
  optimizeDeps: {
    include: ['vitest', '@have/utils', 'tesseract.js'],
  },
});
