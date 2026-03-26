import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const packageDir = resolve(__dirname);
const agentContextEntry = resolve(packageDir, 'src/cli/claude-context.ts');

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(packageDir, 'src/index.ts'),
        'adapters/sqlite': resolve(packageDir, 'src/adapters/sqlite.ts'),
        'adapters/postgres': resolve(packageDir, 'src/adapters/postgres.ts'),
        'adapters/bull': resolve(packageDir, 'src/adapters/bull.ts'),
        'adapters/bullmq': resolve(packageDir, 'src/adapters/bullmq.ts'),
        'adapters/sqs': resolve(packageDir, 'src/adapters/sqs.ts'),
        'adapters/cloud-tasks': resolve(
          packageDir,
          'src/adapters/cloud-tasks.ts',
        ),
        ...(existsSync(agentContextEntry)
          ? { 'cli/claude-context': agentContextEntry }
          : {}),
      },
      formats: ['es'] as const,
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
        // Node.js built-ins
        /^node:/,
        'crypto',
        'events',
        'util',

        // External dependencies (built-in adapters)
        'pg',
        '@libsql/client',

        // External dependencies (optional adapters - peer dependencies)
        'bull',
        'bullmq',
        '@aws-sdk/client-sqs',
        '@google-cloud/tasks',

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
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: resolve(packageDir, 'tsconfig.json'),
    }),
  ],
});
