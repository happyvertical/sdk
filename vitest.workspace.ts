import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './vitest.config.ts',
  './packages/smrt/vitest.config.ts',
  './packages/sql/vitest.config.ts',
  './packages/pdf/vitest.config.ts',
]);
