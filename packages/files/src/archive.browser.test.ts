import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('bundles the published archive subpath without reaching Node builtins', async () => {
  const imports: string[] = [];
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'check-archive-imports',
        resolveId(id) {
          imports.push(id);
          return null;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          import.meta.resolve('@happyvertical/files/archive'),
        ),
        formats: ['iife'],
        name: 'Archive',
      },
    },
  });
  expect(
    imports.filter(
      (id) => id.startsWith('node:') || builtinModules.includes(id),
    ),
  ).toEqual([]);
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Expected bundle output');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk')
    throw new Error('Expected bundle chunk');
  const context = vm.createContext(
    Object.fromEntries([
      ['TextDecoder', TextDecoder],
      ['Uint8Array', Uint8Array],
      ['DataView', DataView],
    ]),
  );
  // Empty classic ZIP; run using only browser globals, without require/process.
  vm.runInContext(
    `${chunk.code}\nconst bytes = new Uint8Array(22); new DataView(bytes.buffer).setUint32(0, 0x06054b50, true); globalThis.result = Archive.inspectZipManifest(bytes).entryCount;`,
    context,
  );
  expect(context.result).toBe(0);
});
