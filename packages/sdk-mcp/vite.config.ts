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
        ...(existsSync(agentContextEntry)
          ? { 'cli/claude-context': agentContextEntry }
          : {}),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
      },
      external: [
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/server/index.js',
        '@modelcontextprotocol/sdk/server/stdio.js',
        '@modelcontextprotocol/sdk/types.js',
        '@happyvertical/ai',
        '@happyvertical/files',
        '@happyvertical/utils',
        /^node:.*/, // Externalize all Node.js built-in modules
      ],
    },
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
    ssr: true, // Enable SSR mode for Node.js builds
  },
  plugins: [
    dts({
      outDir: 'dist',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
