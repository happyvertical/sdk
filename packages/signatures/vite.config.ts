import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const packageDir = resolve(__dirname);

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(packageDir, 'src/index.ts'),
        'adapters/boldsign': resolve(packageDir, 'src/adapters/boldsign.ts'),
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
      external: [/^node:/, /^@happyvertical\//],
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
