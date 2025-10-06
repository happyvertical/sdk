/**
 * Vite configuration for Tags package with SMRT integration
 *
 * Enables library build for NPM package distribution
 */

import { defineConfig, type UserConfig } from 'vite';

export default defineConfig(({ command, mode }): UserConfig => {
  const baseConfig: UserConfig = {
    plugins: [],
    resolve: {
      alias: {
        $lib: '/src',
      },
    },
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
            utils: './src/utils.ts',
          },
          formats: ['es'],
          fileName: (format, entryName) => `${entryName}.js`,
        },
        rollupOptions: {
          external: [
            '@have/smrt',
            '@have/smrt/fields',
            '@have/utils',
            'path',
            'os',
            'url',
            'node:path',
            'node:os',
            'node:url',
            'node:fs/promises',
            'fs/promises',
          ],
        },
        outDir: 'dist',
      },
    };
  }

  // Development mode
  return {
    ...baseConfig,
    server: {
      port: 3005,
      host: true,
    },
  };
});
