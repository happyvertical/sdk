import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      // Multiple entry points for tree-shaking support
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        utils: resolve(__dirname, 'src/utils.ts'),
        'generators/index': resolve(__dirname, 'src/generators/index.ts'),
        'generators/cli': resolve(__dirname, 'src/generators/cli.ts'),
        'generators/rest': resolve(__dirname, 'src/generators/rest.ts'),
        'generators/mcp': resolve(__dirname, 'src/generators/mcp.ts'),
        'generators/swagger': resolve(__dirname, 'src/generators/swagger.ts'),
        'manifest/index': resolve(__dirname, 'src/manifest/index.ts'),
        'vite-plugin/index': resolve(__dirname, 'src/vite-plugin/index.ts'),
        'runtime/index': resolve(__dirname, 'src/runtime/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        format: 'es',
        preserveModules: false,
        // Ensure proper directory structure
        entryFileNames: '[name].js',
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

        // External dependencies
        'cheerio',
        'yaml',
        'fast-glob',
        'minimatch',
        '@langchain/community',

        // TypeScript compiler (build-time only, not bundled)
        'typescript',

        // Internal @have/* packages
        '@have/utils',
        '@have/files',
        '@have/sql',
        '@have/ai',

        // Virtual modules from SMRT framework
        '@smrt/types',
        '@smrt/routes',
        '@smrt/client',
        '@smrt/mcp',
        '@smrt/manifest',
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
      '@have/files': resolve(__dirname, '../files/src'),
      '@have/sql': resolve(__dirname, '../sql/src'),
      '@have/ai': resolve(__dirname, '../ai/src'),
    },
  },
});