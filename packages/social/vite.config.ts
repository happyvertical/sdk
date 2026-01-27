import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^node:/, '@happyvertical/logger', '@happyvertical/utils'],
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
  },
  plugins: [dts({ rollupTypes: true })],
});
