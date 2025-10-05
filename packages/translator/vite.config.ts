import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    ssr: true,
    rollupOptions: {
      output: {
        format: 'es',
        preserveModules: true,
        entryFileNames: '[name].js',
        preserveModulesRoot: 'src',
      },
      external: (id) => {
        // Node.js built-ins
        if (/^node:|^bun:/.test(id)) return true;
        if (['fs', 'path', 'url', 'os', 'crypto', 'stream', 'util', 'events', 'child_process', 'buffer', 'Buffer', 'zlib', 'assert', 'http', 'https', 'net', 'tls', 'dns', 'cluster', 'worker_threads', 'perf_hooks', 'readline', 'repl', 'vm', 'v8', 'inspector'].includes(id)) return true;

        // External dependencies
        if (id.startsWith('@google-cloud/')) return true;
        if (id.startsWith('deepl-node')) return true;

        // Internal @have/* packages
        if (id.startsWith('@have/')) return true;

        return false;
      },
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
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.*.ts',
        '**/*.config.ts',
        '**/*.config.js',
        'src/**/*.d.ts',
        'src/**/*.js',
      ],
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
    }),
  ],
  resolve: {
    alias: {
      '@have/utils': resolve(__dirname, '../utils/src'),
    },
    conditions: ['node', 'import'],
  },
});
