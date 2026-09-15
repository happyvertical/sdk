import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = resolve(packageRoot, 'dist/index.js');
const distExists = existsSync(distEntry);

describe('dist/index.js ESM import', () => {
  it.skipIf(!distExists)(
    distExists
      ? 'imports cleanly under Node ESM without throwing'
      : `skipped: ${distEntry} does not exist (run \`pnpm build\` first)`,
    () => {
      // Regression guard for happyvertical/sdk#1253: a CommonJS dependency
      // (@slack/web-api) was bundled into the ESM output, and its
      // `require('node:os')` call threw via rolldown's `__require` shim
      // the moment the built module graph loaded under `node --input-type=module`.
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(distEntry)})`,
        ],
        { stdio: 'pipe' },
      );
    },
  );
});
