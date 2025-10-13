import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Function to create per-package build configuration
function createPackageBuild(
  packageName: string,
  entryPath: string,
  directory: 'core' | 'modules',
) {
  return {
    lib: {
      entry: resolve(__dirname, entryPath),
      formats: ['es'] as const,
      fileName: () => 'index.js',
    },
    rollupOptions: {
      output: {
        dir: `packages/${directory}/${packageName}/dist`,
        format: 'es' as const,
        preserveModules: true,
        preserveModulesRoot: `packages/${directory}/${packageName}/src`,
      },
      external: [
        // Node.js built-ins - externalize completely to avoid api-extractor issues
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
        'svelte',
        'vite',
        'vitest',
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
        '@langchain/core',
        '@langchain/openai',
        '@langchain/anthropic',
        '@langchain/community',
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

        // Internal @have/* packages - externalize to avoid cross-package bundling issues
        '@have/types',
        '@have/config',
        '@have/utils',
        '@have/logger',
        '@have/files',
        '@have/cache',
        '@have/geo',
        '@have/translator',
        '@have/sql',
        '@have/ocr',
        '@have/pdf',
        '@have/documents',
        '@have/ai',
        '@have/spider',
        '@have/smrt',
        '@have/agents',
        '@have/tags',
        '@have/places',
        '@have/profiles',
        '@have/events',
        '@have/assets',
        '@have/accounts',
        '@have/gnode',
        '@have/content',
        '@have/products',

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
    reportCompressedSize: false, // Speed up build
  };
}

// Package configurations with entry points
const packages = [
  // Core packages
  {
    name: 'types',
    entry: 'packages/core/types/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'config',
    entry: 'packages/core/config/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'utils',
    entry: 'packages/core/utils/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'logger',
    entry: 'packages/core/logger/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'files',
    entry: 'packages/core/files/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'cache',
    entry: 'packages/core/cache/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'geo',
    entry: 'packages/core/geo/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'translator',
    entry: 'packages/core/translator/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'sql',
    entry: 'packages/core/sql/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'ocr',
    entry: 'packages/core/ocr/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'pdf',
    entry: 'packages/core/pdf/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'documents',
    entry: 'packages/core/documents/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'ai',
    entry: 'packages/core/ai/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'spider',
    entry: 'packages/core/spider/src/index.ts',
    directory: 'core' as const,
  },
  {
    name: 'smrt',
    entry: 'packages/core/smrt/src/index.ts',
    directory: 'core' as const,
  },
  // SMRT modules
  {
    name: 'agents',
    entry: 'packages/modules/agents/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'tags',
    entry: 'packages/modules/tags/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'places',
    entry: 'packages/modules/places/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'profiles',
    entry: 'packages/modules/profiles/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'events',
    entry: 'packages/modules/events/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'assets',
    entry: 'packages/modules/assets/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'accounts',
    entry: 'packages/modules/accounts/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'gnode',
    entry: 'packages/modules/gnode/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'content',
    entry: 'packages/modules/content/src/index.ts',
    directory: 'modules' as const,
  },
  {
    name: 'products',
    entry: 'packages/modules/products/src/lib/models/index.ts',
    directory: 'modules' as const,
  },
];

export default defineConfig(({ command, mode }) => {
  // For build command, build all packages
  if (command === 'build') {
    // Build first package by default, use env variable to specify which package
    const targetPackage = process.env.VITE_BUILD_PACKAGE;

    if (targetPackage) {
      const pkg = packages.find((p) => p.name === targetPackage);
      if (!pkg) {
        throw new Error(`Package ${targetPackage} not found`);
      }

      return {
        build: createPackageBuild(pkg.name, pkg.entry, pkg.directory),
        plugins: [
          dts({
            outDir: `packages/${pkg.directory}/${pkg.name}/dist`,
            include: [
              // For products, only include library files; for others, include all src files
              pkg.name === 'products'
                ? `packages/${pkg.directory}/${pkg.name}/src/lib/**/*.ts`
                : `packages/${pkg.directory}/${pkg.name}/src/**/*.ts`,
            ],
            exclude: [
              // Test files
              `packages/${pkg.directory}/${pkg.name}/src/**/*.test.ts`,
              `packages/${pkg.directory}/${pkg.name}/src/**/*.spec.ts`,
              `packages/${pkg.directory}/${pkg.name}/src/**/*.test.*.ts`,
              // Exclude config files
              '**/*.config.ts',
              '**/*.config.js',
              // Don't process existing declaration files
              `packages/${pkg.directory}/${pkg.name}/src/**/*.d.ts`,
            ],
            insertTypesEntry: false, // We handle this in package.json
            rollupTypes: false, // Disable API Extractor to handle virtual modules
            // Use package-specific tsconfig to avoid root config interference
            tsconfigPath: resolve(
              __dirname,
              `packages/${pkg.directory}/${pkg.name}/tsconfig.build.json`,
            ),
          }),
        ],
        resolve: {
          alias: {
            '@have/types': resolve(__dirname, 'packages/core/types/src'),
            '@have/config': resolve(__dirname, 'packages/core/config/src'),
            '@have/utils': resolve(__dirname, 'packages/core/utils/src'),
            '@have/files': resolve(__dirname, 'packages/core/files/src'),
            '@have/cache': resolve(__dirname, 'packages/core/cache/src'),
            '@have/geo': resolve(__dirname, 'packages/core/geo/src'),
            '@have/translator': resolve(
              __dirname,
              'packages/core/translator/src',
            ),
            '@have/sql': resolve(__dirname, 'packages/core/sql/src'),
            '@have/ocr': resolve(__dirname, 'packages/core/ocr/src'),
            '@have/pdf': resolve(__dirname, 'packages/core/pdf/src'),
            '@have/documents': resolve(
              __dirname,
              'packages/core/documents/src',
            ),
            '@have/ai': resolve(__dirname, 'packages/core/ai/src'),
            '@have/spider': resolve(__dirname, 'packages/core/spider/src'),
            '@have/smrt': resolve(__dirname, 'packages/core/smrt/src'),
            '@have/agents': resolve(__dirname, 'packages/modules/agents/src'),
            '@have/tags': resolve(__dirname, 'packages/modules/tags/src'),
            '@have/places': resolve(__dirname, 'packages/modules/places/src'),
            '@have/profiles': resolve(
              __dirname,
              'packages/modules/profiles/src',
            ),
            '@have/events': resolve(__dirname, 'packages/modules/events/src'),
            '@have/assets': resolve(__dirname, 'packages/modules/assets/src'),
            '@have/accounts': resolve(
              __dirname,
              'packages/modules/accounts/src',
            ),
            '@have/gnode': resolve(__dirname, 'packages/modules/gnode/src'),
            '@have/content': resolve(__dirname, 'packages/modules/content/src'),
            '@have/products': resolve(
              __dirname,
              'packages/modules/products/src',
            ),
          },
        },
      };
    }

    // Default: build all packages (we'll need a script to handle this)
    throw new Error(
      'Use package-specific build scripts. Set VITE_BUILD_PACKAGE environment variable.',
    );
  }

  // Development configuration
  return {
    resolve: {
      alias: {
        '@have/types': resolve(__dirname, 'packages/core/types/src'),
        '@have/config': resolve(__dirname, 'packages/core/config/src'),
        '@have/utils': resolve(__dirname, 'packages/core/utils/src'),
        '@have/files': resolve(__dirname, 'packages/core/files/src'),
        '@have/cache': resolve(__dirname, 'packages/core/cache/src'),
        '@have/geo': resolve(__dirname, 'packages/core/geo/src'),
        '@have/translator': resolve(__dirname, 'packages/core/translator/src'),
        '@have/sql': resolve(__dirname, 'packages/core/sql/src'),
        '@have/ocr': resolve(__dirname, 'packages/core/ocr/src'),
        '@have/pdf': resolve(__dirname, 'packages/core/pdf/src'),
        '@have/documents': resolve(__dirname, 'packages/core/documents/src'),
        '@have/ai': resolve(__dirname, 'packages/core/ai/src'),
        '@have/spider': resolve(__dirname, 'packages/core/spider/src'),
        '@have/smrt': resolve(__dirname, 'packages/core/smrt/src'),
        '@have/agents': resolve(__dirname, 'packages/modules/agents/src'),
        '@have/tags': resolve(__dirname, 'packages/modules/tags/src'),
        '@have/places': resolve(__dirname, 'packages/modules/places/src'),
        '@have/profiles': resolve(__dirname, 'packages/modules/profiles/src'),
        '@have/events': resolve(__dirname, 'packages/modules/events/src'),
        '@have/assets': resolve(__dirname, 'packages/modules/assets/src'),
        '@have/accounts': resolve(__dirname, 'packages/modules/accounts/src'),
        '@have/gnode': resolve(__dirname, 'packages/modules/gnode/src'),
        '@have/content': resolve(__dirname, 'packages/modules/content/src'),
        '@have/products': resolve(__dirname, 'packages/modules/products/src'),
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
