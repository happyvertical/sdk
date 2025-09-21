import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { smrtPlugin } from '@have/smrt/vite-plugin';

/**
 * Standalone Vitest configuration for SMRT Content template
 *
 * This is a self-contained configuration that includes:
 * - SMRT plugin for virtual module generation
 * - Svelte support for UI components
 * - Full test environment setup
 *
 * This template can be copied to other repositories as a complete example
 * of testing SMRT-based content management systems.
 */
export default defineConfig({
  plugins: [
    svelte(),
    smrtPlugin({
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      baseClasses: ['BaseObject', 'BaseCollection'],
      generateTypes: true,
      watch: true,
      hmr: true,
      mode: 'server', // Enable file scanning for auto-generation
      typeDeclarationsPath: 'src/types'
    })
  ],

  test: {
    // Test environment
    environment: 'node',

    // Test discovery patterns for this template
    include: [
      'src/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{mjs,mts}'
    ],

    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/docs/**',
      '**/*.d.ts'
    ],

    // Timeouts for async operations
    testTimeout: 30000,
    hookTimeout: 10000,

    // Setup files (if needed for this template)
    setupFiles: ['../../vitest.setup.ts'],

    // Reporter
    reporter: process.env.CI ? 'github' : 'default',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'src/**/*.{test,spec}.{js,ts}',
        'src/**/*.d.ts',
        'src/types/**'
      ]
    }
  },

  resolve: {
    alias: {
      '$lib': '/workspaces/sdk/smrt/content/src',
      // Map workspace packages for development
      // These would be npm packages in a standalone repo
      '@have/smrt': '/workspaces/sdk/packages/smrt/src',
      '@have/pdf': '/workspaces/sdk/packages/pdf/src',
      '@have/spider': '/workspaces/sdk/packages/spider/src',
      '@have/files': '/workspaces/sdk/packages/files/src',
      '@have/utils': '/workspaces/sdk/packages/utils/src',
      '@have/sql': '/workspaces/sdk/packages/sql/src',
      '@have/ai': '/workspaces/sdk/packages/ai/src'
    }
  },

  // Server configuration for development
  server: {
    port: 3003,
    host: true
  }
});