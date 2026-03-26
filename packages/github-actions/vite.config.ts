import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const Dirname = dirname(fileURLToPath(import.meta.url));
const agentContextEntry = resolve(Dirname, 'src/cli/claude-context.ts');

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(Dirname, 'src/index.ts'),
        cli: resolve(Dirname, 'src/cli.ts'),
        ...(existsSync(agentContextEntry)
          ? { 'cli/claude-context': agentContextEntry }
          : {}),
      },
      formats: ['es'] as const,
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
      },
      external: [
        // Node.js built-ins
        /^node:/,
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
        'http',
        'https',
        'net',
        'tls',
        // Internal packages
        /^@happyvertical\//,
        /^@have\//,
      ],
    },
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [
    dts({
      outDir: resolve(Dirname, 'dist'),
      include: [resolve(Dirname, 'src/**/*.ts')],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
      insertTypesEntry: false,
      rollupTypes: false,
      tsconfigPath: resolve(Dirname, 'tsconfig.json'),
    }),
  ],
});
