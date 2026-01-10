import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const packageDir = __dirname;

/**
 * Custom Vite configuration for utils package with dual entry points:
 * - index.ts: Full Node.js-compatible exports
 * - browser.ts: Browser-safe exports (no Node.js built-ins)
 */
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(packageDir, 'src/index.ts'),
        browser: resolve(packageDir, 'src/browser.ts'),
      },
      formats: ['es'] as const,
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        dir: resolve(packageDir, 'dist'),
        format: 'es' as const,
        preserveModules: false,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
      external: [
        // Node.js built-ins - externalize completely
        /^node:/,
        /^bun:/,
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
        'Buffer',
        'zlib',
        'assert',
        'http',
        'https',
        'net',
        'tls',
        'dns',
        'cluster',
        'worker_threads',
        'perf_hooks',
        'readline',
        'repl',
        'vm',
        'v8',
        'inspector',

        // External dependencies - don't bundle these
        'date-fns',
        'pluralize',
        'uuid',
        '@paralleldrive/cuid2',

        // Internal @happyvertical/* packages
        /^@happyvertical\//,
      ],
    },
    minify: false,
    sourcemap: true,
    target: 'es2022',
    reportCompressedSize: false,
  },
  plugins: [
    dts({
      outDir: resolve(packageDir, 'dist'),
      include: [resolve(packageDir, 'src/**/*.ts')],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.test.*.ts',
        '**/*.config.ts',
        '**/*.config.js',
        '**/*.d.ts',
      ],
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: resolve(packageDir, 'tsconfig.json'),
    }),
  ],
});
