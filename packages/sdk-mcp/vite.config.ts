import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
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
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/server/index.js',
        '@modelcontextprotocol/sdk/server/stdio.js',
        '@modelcontextprotocol/sdk/types.js',
        '@happyvertical/ai',
        '@happyvertical/files',
        '@happyvertical/utils',
        /^node:.*/,  // Externalize all Node.js built-in modules
      ],
    },
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    ssr: true,  // Enable SSR mode for Node.js builds
  },
  plugins: [
    dts({
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
