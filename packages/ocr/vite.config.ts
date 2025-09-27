import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      // Single entry point for @have/ocr
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        format: 'es',
        preserveModules: true,
        // Ensure proper directory structure for subpath exports
        entryFileNames: '[name].js',
        // Preserve the exact module structure for clean subpath exports
        preserveModulesRoot: 'src',
      },
      external: [
        // Node.js built-ins
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

        // External dependencies for ocr package
        '@gutenye/ocr-node',
        'jpeg-js',
        'pngjs',
        'tesseract.js',

        // Internal @have/* packages
        '@have/utils',
      ],
    },
    minify: false, // Keep code readable for library usage
    sourcemap: true,
    target: 'es2022',
    reportCompressedSize: false,
  },
  plugins: [
    dts({
      outDir: 'dist',
      include: ['src/**/*.ts'],
      exclude: [
        // Test files
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.*.ts',
        // Exclude config files
        '**/*.config.ts',
        '**/*.config.js',
        // Don't process existing declaration files
        'src/**/*.d.ts',
        // Exclude compiled .js files in source directory
        'src/**/*.js',
      ],
      insertTypesEntry: false, // We handle this in package.json
      rollupTypes: false, // Disable API Extractor to handle virtual modules
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  resolve: {
    alias: {
      '@have/utils': resolve(__dirname, '../utils/src'),
    },
  },
});