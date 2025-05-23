import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.{test,spec}.{js,ts}'],
    globals: true,
    environment: 'node',
    globalSetup: path.resolve(__dirname, './vitest.setup.ts'),
    sequence: {
      hooks: 'list',
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  // Configure workspace projects
  workspace: [
    'packages/utils',
    'packages/files', 
    'packages/ai',
    'packages/spider',
    'packages/sql',
    'packages/pdf',
    'packages/smrt',
  ],
});
