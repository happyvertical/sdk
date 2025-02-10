import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['**/src/**/*.spec.ts'],
    globals: true,
    environment: 'node',
    globalSetup: path.resolve(__dirname, './vitest.setup.ts'),
  },
});
