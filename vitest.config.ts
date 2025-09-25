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
      '@have/utils': resolve(__dirname, 'packages/utils/src'),
      '@have/files': resolve(__dirname, 'packages/files/src'),
      '@have/sql': resolve(__dirname, 'packages/sql/src'),
      '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
      '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
      '@have/ai': resolve(__dirname, 'packages/ai/src'),
      '@have/spider': resolve(__dirname, 'packages/spider/src'),
      '@have/smrt': resolve(__dirname, 'packages/smrt/src'),
      '@have/content': resolve(__dirname, 'packages/content/src'),
      '@have/products': resolve(__dirname, 'packages/products/src'),
      $lib: '/src/lib',
    },
  },

  // Optimize dependencies for faster test startup
  optimizeDeps: {
    include: ['vitest', '@have/utils', 'tesseract.js'],
  },
});
