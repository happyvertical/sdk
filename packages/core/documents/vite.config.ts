import { defineConfig, type UserConfig } from 'vite';

export default defineConfig(({ mode }): UserConfig => {
  // Library build mode - for NPM package distribution
  if (mode === 'library') {
    return {
      build: {
        target: 'node18',
        lib: {
          entry: './src/index.ts',
          formats: ['es'],
          fileName: () => 'index.js',
        },
        rollupOptions: {
          external: [
            '@have/files',
            '@have/pdf',
            '@have/spider',
            '@have/ocr',
            '@have/utils',
            'uuid',
            'path',
            'os',
            'url',
            'node:path',
            'node:os',
            'node:url',
            'node:fs',
            'node:fs/promises',
            'fs',
            'fs/promises',
          ],
        },
        outDir: 'dist',
        emitAssets: true,
        emitDeclarationOnly: false,
      },
    };
  }

  // Development mode
  return {
    server: {
      port: 3004,
      host: true,
    },
  };
});
