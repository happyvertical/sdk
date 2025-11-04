import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        cli: resolve(__dirname, 'src/cli.ts'),
      },
      formats: ['es'] as const,
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
      },
      external: [
        // Node.js built-ins
        /^node:/,
        'fs',
        'path',
        'url',
        'os',
        'crypto',
        'stream',
        'util',
        'events',
        'child_process',
        'buffer',
        'http',
        'https',
        'net',
        'tls',
        // Internal packages
        /^@happyvertical\//,
        /^@have\//,
      ],
    },
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [
    dts({
      outDir: resolve(__dirname, 'dist'),
      include: [resolve(__dirname, 'src/**/*.ts')],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
});
