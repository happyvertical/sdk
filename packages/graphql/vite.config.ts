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
      external: [/^node:/],
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [
    dts({
      tsconfigPath: './tsconfig.build.json',
      rollupTypes: true,
    }),
  ],
});
