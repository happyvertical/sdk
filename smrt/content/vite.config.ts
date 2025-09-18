/**
 * Vite configuration for Content service with SMRT auto-generation
 *
 * Enables auto-generation of REST APIs, MCP tools, and TypeScript clients
 * from @smrt() decorated classes.
 */

import { defineConfig, type UserConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { smrtPlugin } from '@have/smrt/vite-plugin';

export default defineConfig(({ command, mode }): UserConfig => {
  const baseConfig: UserConfig = {
    plugins: [
      smrtPlugin({
        include: ['src/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        baseClasses: ['BaseObject'],
        generateTypes: true,
        watch: command === 'serve',
        hmr: command === 'serve',
        mode: 'server', // Enable file scanning for auto-generation
        typeDeclarationsPath: 'src/types'
      })
    ],
    resolve: {
      alias: {
        '$lib': '/src'
      }
    }
  };

  // Library build mode - for NPM package distribution
  if (mode === 'library') {
    return {
      ...baseConfig,
      build: {
        target: 'node18',
        lib: {
          entry: {
            index: './src/index.ts',
            content: './src/content.ts',
            contents: './src/contents.ts',
            document: './src/document.ts',
            utils: './src/utils.ts'
          },
          formats: ['es', 'cjs']
        },
        rollupOptions: {
          external: [
            '@have/smrt',
            '@have/pdf',
            '@have/spider',
            '@have/files',
            '@have/utils',
            '@have/sql',
            '@have/ai',
            'yaml',
            'path',
            'os',
            'url',
            'node:fs/promises',
            'fs/promises',
            '@smrt/client',
            '@smrt/routes',
            '@smrt/types',
            '@smrt/manifest',
            '@smrt/mcp'
          ]
        },
        outDir: 'dist'
      }
    };
  }

  // Development mode - enable auto-generation and virtual modules
  return {
    ...baseConfig,
    plugins: [
      svelte(),
      ...baseConfig.plugins!
    ],
    server: {
      port: 3003,
      host: true
    }
  };
});