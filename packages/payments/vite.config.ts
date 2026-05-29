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
        'adapters/base-usdc': resolve(packageDir, 'src/adapters/base-usdc.ts'),
        'adapters/btc': resolve(packageDir, 'src/adapters/btc.ts'),
        'adapters/stripe': resolve(packageDir, 'src/adapters/stripe.ts'),
        'testing/conformance': resolve(
          packageDir,
          'src/testing/conformance.ts',
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
        /^node:/,
        'crypto',
        'events',
        'util',

        '@scure/bip32',
        'vitest',
        /^@noble\/curves/,
        /^@noble\/hashes/,

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
