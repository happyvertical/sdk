import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

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

    // Conditionally add SMRT plugin for files that need virtual modules
    // This will be loaded only when testing SMRT modules
    ...(process.env.VITEST_POOL_ID?.includes('smrt') ? [
      // Dynamic import of SMRT plugin only when needed
      // Will be handled by the specialized configs
    ] : [])
  ],

  test: {
    // Global test setup
    setupFiles: ['./vitest.setup.ts'],

    // Comprehensive test discovery patterns
    include: [
      // All core packages only - SMRT modules have standalone configs
      'packages/*/src/**/*.{test,spec}.{js,ts}',
      'packages/*/src/**/*.{test,spec}.{mjs,mts}'
    ],

    // Exclude only what Vitest shouldn't handle
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/docs/**',
      // SMRT modules - handled by standalone configs
      'smrt/**',
      // E2E tests - handled by Playwright
      'e2e-tests/**',
      'test-results/**',
      'playwright-report/**',
      // Test artifacts
      '**/*.d.ts',
      '**/coverage/**'
    ],

    // Environment configuration
    environment: 'node',

    // Timeouts for different test types
    testTimeout: 30000,    // Longer for potential OCR/PDF processing
    hookTimeout: 10000,

    // Reporter configuration
    reporter: process.env.CI ? 'github' : 'default',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: [
        'packages/*/src/**/*.{js,ts}'
      ],
      exclude: [
        'packages/*/src/**/*.{test,spec}.{js,ts}',
        'packages/*/src/**/*.d.ts'
      ]
    },

    // Pool options for parallel execution
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,  // Run tests sequentially to avoid memory issues
        isolate: true
      }
    },

    // Increase memory limit for OCR tests
    maxWorkers: 1
  },

  // Let Node.js module resolution handle workspace packages through package.json exports
  resolve: {
    alias: {
      // Only non-package aliases
      '$lib': '/src/lib'
    }
  },

  // Optimize dependencies for faster test startup
  optimizeDeps: {
    include: [
      'vitest',
      '@have/utils',
      'tesseract.js'
    ]
  }
});