import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Function to create per-package build configuration
function createPackageBuild(packageName: string, entryPath: string) {
  return {
    lib: {
      entry: resolve(__dirname, entryPath),
      formats: ['es'] as const,
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        dir: `packages/${packageName}/dist`,
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
        'cheerio',
        'crawlee',
        'puppeteer',
        'playwright',
        'playwright-core',
        'sqlite3',
        'better-sqlite3',
        'pg',
        'mysql2',
        'typeorm',
        'prisma',
        '@prisma/client',
        'sharp',
        'canvas',
        'pdf-parse',
        'pdf2pic',
        'tesseract.js',
        'openai',
        /^openai\//,
        'anthropic',
        '@anthropic-ai/sdk',
        '@google/generative-ai',
        '@google/genai',
        '@aws-sdk/client-bedrock-runtime',
        'date-fns',
        'pluralize',
        'uuid',
        '@paralleldrive/cuid2',
        'yaml',
        'jsdom',
        'happy-dom',
        'axios',
        'node-fetch',
        'express',
        'cors',
        'dotenv',
        'typescript',
        '@googlemaps/google-maps-services-js',
        '@google-cloud/translate',
        'deepl-node',
        'redis',
        '@modelcontextprotocol/sdk',
        /^@modelcontextprotocol\//,
        'undici',
        'unpdf',
        'pngjs',
        'jpeg-js',
        '@gutenye/ocr-node',

        // Internal @have/* packages - externalize to avoid cross-package bundling
        '@have/utils',
        '@have/logger',
        '@have/files',
        '@have/sql',
        '@have/ai',
        '@have/cache',
        '@have/config',
        '@have/geo',
        '@have/translator',
        '@have/ocr',
        '@have/pdf',
        '@have/documents',
        '@have/spider',
        '@have/smrt', // Optional dependency for SQL package (SMRT integration)
      ],
    },
    minify: false, // Keep code readable for library usage
    sourcemap: true,
    target: 'es2022',
    reportCompressedSize: false, // Speed up build
  };
}

// Package configurations with entry points
const packages = [
  // Core foundation packages
  { name: 'utils', entry: 'packages/utils/src/index.ts' },
  { name: 'logger', entry: 'packages/logger/src/index.ts' },
  { name: 'files', entry: 'packages/files/src/index.ts' },
  { name: 'sql', entry: 'packages/sql/src/index.ts' },
  { name: 'ai', entry: 'packages/ai/src/index.ts' },

  // Infrastructure packages
  { name: 'config', entry: 'packages/config/src/index.ts' },
  { name: 'cache', entry: 'packages/cache/src/index.ts' },
  { name: 'geo', entry: 'packages/geo/src/index.ts' },
  { name: 'translator', entry: 'packages/translator/src/index.ts' },
  { name: 'ocr', entry: 'packages/ocr/src/index.ts' },
  { name: 'pdf', entry: 'packages/pdf/src/index.ts' },
  { name: 'spider', entry: 'packages/spider/src/index.ts' },
  { name: 'documents', entry: 'packages/documents/src/index.ts' },
];

export default defineConfig(({ command }) => {
  // For build command, build specified package
  if (command === 'build') {
    const targetPackage = process.env.VITE_BUILD_PACKAGE;

    if (targetPackage) {
      const pkg = packages.find((p) => p.name === targetPackage);
      if (!pkg) {
        throw new Error(`Package ${targetPackage} not found`);
      }

      return {
        build: createPackageBuild(pkg.name, pkg.entry),
        plugins: [
          dts({
            outDir: `packages/${pkg.name}/dist`,
            include: [`packages/${pkg.name}/src/**/*.ts`],
            exclude: [
              // Test files
              `packages/${pkg.name}/src/**/*.test.ts`,
              `packages/${pkg.name}/src/**/*.spec.ts`,
              `packages/${pkg.name}/src/**/*.test.*.ts`,
              // Config files
              '**/*.config.ts',
              '**/*.config.js',
              // Declaration files
              `packages/${pkg.name}/src/**/*.d.ts`,
            ],
            insertTypesEntry: false, // We handle this in package.json
            rollupTypes: false,
            // Use package-specific tsconfig
            tsconfigPath: resolve(
              __dirname,
              `packages/${pkg.name}/tsconfig.build.json`,
            ),
          }),
        ],
        resolve: {
          alias: {
            '@have/utils': resolve(__dirname, 'packages/utils/src'),
            '@have/logger': resolve(__dirname, 'packages/logger/src'),
            '@have/files': resolve(__dirname, 'packages/files/src'),
            '@have/sql': resolve(__dirname, 'packages/sql/src'),
            '@have/ai': resolve(__dirname, 'packages/ai/src'),
            '@have/config': resolve(__dirname, 'packages/config/src'),
            '@have/cache': resolve(__dirname, 'packages/cache/src'),
            '@have/geo': resolve(__dirname, 'packages/geo/src'),
            '@have/translator': resolve(__dirname, 'packages/translator/src'),
            '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
            '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
            '@have/documents': resolve(__dirname, 'packages/documents/src'),
            '@have/spider': resolve(__dirname, 'packages/spider/src'),
          },
        },
      };
    }

    // Default: require VITE_BUILD_PACKAGE to be set
    throw new Error(
      'Use package-specific build scripts. Set VITE_BUILD_PACKAGE environment variable.',
    );
  }

  // Development configuration
  return {
    resolve: {
      alias: {
        '@have/utils': resolve(__dirname, 'packages/utils/src'),
        '@have/logger': resolve(__dirname, 'packages/logger/src'),
        '@have/files': resolve(__dirname, 'packages/files/src'),
        '@have/sql': resolve(__dirname, 'packages/sql/src'),
        '@have/ai': resolve(__dirname, 'packages/ai/src'),
        '@have/config': resolve(__dirname, 'packages/config/src'),
        '@have/cache': resolve(__dirname, 'packages/cache/src'),
        '@have/geo': resolve(__dirname, 'packages/geo/src'),
        '@have/translator': resolve(__dirname, 'packages/translator/src'),
        '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
        '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
        '@have/documents': resolve(__dirname, 'packages/documents/src'),
        '@have/spider': resolve(__dirname, 'packages/spider/src'),
      },
    },
    optimizeDeps: {
      include: [
        '@paralleldrive/cuid2',
        'date-fns',
        'pluralize',
        'uuid',
        'yaml',
      ],
    },
  };
});
