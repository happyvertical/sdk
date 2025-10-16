import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unified Vitest configuration for the entire HAVE SDK
 *
 * This configuration handles all SDK packages in the monorepo:
 * - Infrastructure packages (utils, files, sql, ai, cache, etc.)
 * - Service packages (ocr, pdf, spider, geo, translator, documents, logger)
 *
 * Benefits:
 * - Single test runner for consistency
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
    hookTimeout: 30000, // Match testTimeout for slow CI environments

    // Reporter configuration
    reporters: ['default'],

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

  // Resolve workspace packages for testing
  resolve: {
    alias: {
      '@have/config': resolve(__dirname, 'packages/config/src'),
      '@have/utils': resolve(__dirname, 'packages/utils/src'),
      '@have/files': resolve(__dirname, 'packages/files/src'),
      '@have/cache': resolve(__dirname, 'packages/cache/src'),
      '@have/sql': resolve(__dirname, 'packages/sql/src'),
      '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
      '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
      '@have/ai': resolve(__dirname, 'packages/ai/src'),
      '@have/spider': resolve(__dirname, 'packages/spider/src'),
      '@have/geo': resolve(__dirname, 'packages/geo/src'),
      '@have/translator': resolve(__dirname, 'packages/translator/src'),
      '@have/documents': resolve(__dirname, 'packages/documents/src'),
      '@have/logger': resolve(__dirname, 'packages/logger/src'),
    },
  },

  // Optimize dependencies for faster test startup
  optimizeDeps: {
    include: ['vitest', '@have/utils', 'tesseract.js'],
  },
});
