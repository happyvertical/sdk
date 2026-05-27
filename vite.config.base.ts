import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Shared Vite configuration factory for all SDK packages
 *
 * Creates a standardized build configuration for Node.js-only packages
 * with TypeScript declaration generation.
 */
export function createPackageConfig(
  packageName: string,
  additionalEntries: Record<string, string> = {},
) {
  const packageDir = resolve(__dirname, 'packages', packageName);
  const packageEntries: Record<string, string> = {
    index: resolve(packageDir, 'src/index.ts'),
    ...Object.fromEntries(
      Object.entries(additionalEntries).map(([entryName, entryPath]) => [
        entryName,
        resolve(packageDir, entryPath),
      ]),
    ),
  };
  const agentContextEntry = resolve(packageDir, 'src/cli/claude-context.ts');

  if (existsSync(agentContextEntry)) {
    packageEntries['cli/claude-context'] = agentContextEntry;
  }

  return defineConfig({
    build: {
      lib: {
        entry: packageEntries,
        formats: ['es'] as const,
        fileName: (_format, entryName) => `${entryName}.js`,
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
          'jimp',
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
          '@aws-sdk/client-s3',
          '@aws-sdk/credential-providers',
          /^@aws-sdk\//, // Externalize all AWS SDK packages
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
          'satori',
          '@resvg/resvg-js',
          /^@resvg\//,
          '@gutenye/ocr-node',
          'pdf-to-png-converter',
          '@napi-rs/canvas',
          /^@napi-rs\//,
          'cosmiconfig',
          '@libsql/client',
          '@sqliteai/sqlite-vector',
          /^@sqliteai\/sqlite-vector/,
          '@russellthehippo/honker-node',
          /^@russellthehippo\/honker-node/,
          'openpgp',
          'tweetnacl',
          'tweetnacl-util',
          'google-auth-library',
          'googleapis',
          /^googleapis\//,
          'nodemailer',
          'imapflow',
          'node-pop3',
          'mailparser',

          // Internal @happyvertical/* packages - externalize to avoid cross-package bundling
          /^@happyvertical\//,
          '@happyvertical/utils',
          '@happyvertical/logger',
          '@happyvertical/files',
          '@happyvertical/sql',
          '@happyvertical/ai',
          '@happyvertical/cache',
          '@happyvertical/config',
          '@happyvertical/geo',
          '@happyvertical/translator',
          '@happyvertical/ocr',
          '@happyvertical/pdf',
          '@happyvertical/documents',
          '@happyvertical/spider',
          '@happyvertical/smrt', // Optional dependency for SQL package (SMRT integration)
        ],
      },
      minify: false, // Keep code readable for library usage
      sourcemap: true,
      target: 'es2022',
      reportCompressedSize: false, // Speed up build
    },
    plugins: [
      dts({
        outDir: resolve(packageDir, 'dist'),
        include: [resolve(packageDir, 'src/**/*.ts')],
        exclude: [
          // Test files
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/*.test.*.ts',
          // Config files
          '**/*.config.ts',
          '**/*.config.js',
          // Declaration files
          '**/*.d.ts',
        ],
        insertTypesEntry: false, // We handle this in package.json
        rollupTypes: false,
        // Use package-specific tsconfig
        tsconfigPath: resolve(packageDir, 'tsconfig.json'),
      }),
    ],
  });
}
