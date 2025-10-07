import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        '@have/smrt',
        '@have/utils',
        /^node:/,
      ],
    },
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
