import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include:
      process.env.VITEST_INCLUDE_OPTIONAL === 'true'
        ? ['src/**/*.optional.test.ts']
        : ['src/**/*.{test,spec}.ts'],
    exclude:
      process.env.VITEST_INCLUDE_OPTIONAL === 'true'
        ? []
        : ['src/**/*.optional.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/types.ts',
      ],
    },
  },
});
