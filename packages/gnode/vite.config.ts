import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'federation/index': resolve(__dirname, 'src/federation/index.ts'),
        'protocols/index': resolve(__dirname, 'src/protocols/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: (chunkInfo) => {
          const entryName = chunkInfo.name;
          if (entryName.includes('/')) return `${entryName}.js`;
          return `${entryName}.js`;
        },
      },
      external: [
        // Node.js built-ins
        /^node:/,
        'fs',
        'path',
        'url',

        // Internal @have/* packages
        '@have/smrt',
        '@have/sql',
        '@have/utils',
      ],
    },
    minify: false,
    sourcemap: true,
    target: 'es2022',
    reportCompressedSize: false,
  },
  plugins: [
    dts({
      outDir: 'dist',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      insertTypesEntry: false,
      rollupTypes: false,
    }),
  ],
});
