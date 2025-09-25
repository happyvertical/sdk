import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: {
        // Core packages in dependency order
        utils: resolve(__dirname, 'packages/utils/src/index.ts'),
        files: resolve(__dirname, 'packages/files/src/index.ts'),
        sql: resolve(__dirname, 'packages/sql/src/index.ts'),
        ocr: resolve(__dirname, 'packages/ocr/src/index.ts'),
        pdf: resolve(__dirname, 'packages/pdf/src/index.ts'),
        ai: resolve(__dirname, 'packages/ai/src/index.ts'),
        spider: resolve(__dirname, 'packages/spider/src/index.ts'),
        smrt: resolve(__dirname, 'packages/smrt/src/index.ts'),
        // SMRT-dependent packages - adjust entry points based on what exists
        content: resolve(__dirname, 'packages/content/src/content.ts'),
        products: resolve(
          __dirname,
          'packages/products/src/lib/models/index.ts',
        ),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}/index.js`,
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        format: 'es',
        chunkFileNames: 'shared/[name]-[hash].js',
        preserveModules: false,
        assetFileNames: 'assets/[name]-[hash][extname]',
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

        // NOTE: Removed /^@have\// to allow cross-package imports within the monorepo
        // This enables packages like @have/pdf to import @have/ocr successfully

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
    outDir: 'dist',
    emptyOutDir: true,
    minify: false, // Keep code readable for library usage
    sourcemap: true,
    target: 'es2022',
    reportCompressedSize: false, // Speed up build
  },
  plugins: [
    // TODO: DTS plugin temporarily disabled due to ajv dependency issue
    // Re-enable once ajv issue is resolved
    // Generate TypeScript declaration files
    // dts({
    //   insertTypesEntry: true,
    //   rollupTypes: true,
    //   outDir: 'dist',
    //   include: [
    //     'packages/*/src/**/*.ts',
    //     '!packages/*/src/**/*.test.ts',
    //     '!packages/*/src/**/*.spec.ts',
    //     '!packages/*/src/**/*.test.*.ts'
    //   ],
    //   exclude: [
    //     'packages/*/dist/**/*',
    //     'packages/*/node_modules/**/*',
    //     // Exclude files that use SMRT virtual modules
    //     'packages/content/src/client.ts',
    //     'packages/content/src/main.ts',
    //     'packages/content/src/mcp.ts',
    //     'packages/products/src/client.ts',
    //     'packages/products/src/main.ts',
    //     'packages/products/src/mcp.ts',
    //     'packages/products/src/simple-server.ts',
    //     'packages/content/src/lib/index.ts',
    //     'packages/products/src/lib/index.ts',
    //   ],
    // })
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
  // Optimize dependencies during build
  optimizeDeps: {
    include: ['@paralleldrive/cuid2', 'date-fns', 'pluralize', 'uuid', 'yaml'],
  },
});
