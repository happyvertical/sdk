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

        // External dependencies - don't bundle these
        'svelte',
        'vite',
        'vitest',
        'cheerio',
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
  { name: 'utils', entry: 'packages/utils/src/index.ts' },
  { name: 'files', entry: 'packages/files/src/index.ts' },
  { name: 'sql', entry: 'packages/sql/src/index.ts' },
  { name: 'ocr', entry: 'packages/ocr/src/index.ts' },
  { name: 'pdf', entry: 'packages/pdf/src/index.ts' },
  { name: 'ai', entry: 'packages/ai/src/index.ts' },
  { name: 'spider', entry: 'packages/spider/src/index.ts' },
  { name: 'smrt', entry: 'packages/smrt/src/index.ts' },
  { name: 'content', entry: 'packages/content/src/content.ts' },
  { name: 'products', entry: 'packages/products/src/lib/models/index.ts' },
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
            ],
            insertTypesEntry: false, // We handle this in package.json
            rollupTypes: true,
            // Use package-specific tsconfig to avoid root config interference
            tsconfigPath: resolve(
              __dirname,
              `packages/${pkg.name}/tsconfig.build.json`,
            ),
          }),
        ],
        resolve: {
          alias: {
            '@have/utils': resolve(__dirname, 'packages/utils/src'),
            '@have/files': resolve(__dirname, 'packages/files/src'),
            '@have/sql': resolve(__dirname, 'packages/sql/src'),
            '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
            '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
            '@have/ai': resolve(__dirname, 'packages/ai/src'),
            '@have/spider': resolve(__dirname, 'packages/spider/src'),
            '@have/smrt': resolve(__dirname, 'packages/smrt/src'),
            '@have/content': resolve(__dirname, 'packages/content/src'),
            '@have/products': resolve(__dirname, 'packages/products/src'),
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
        '@have/utils': resolve(__dirname, 'packages/utils/src'),
        '@have/files': resolve(__dirname, 'packages/files/src'),
        '@have/sql': resolve(__dirname, 'packages/sql/src'),
        '@have/ocr': resolve(__dirname, 'packages/ocr/src'),
        '@have/pdf': resolve(__dirname, 'packages/pdf/src'),
        '@have/ai': resolve(__dirname, 'packages/ai/src'),
        '@have/spider': resolve(__dirname, 'packages/spider/src'),
        '@have/smrt': resolve(__dirname, 'packages/smrt/src'),
        '@have/content': resolve(__dirname, 'packages/content/src'),
        '@have/products': resolve(__dirname, 'packages/products/src'),
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
