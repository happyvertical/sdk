/**
 * The pglite adapter's import graph must be browser-safe: no `node:` built-ins
 * and no `pg`. Checked three ways — by walking the source import graph, by
 * bundling the adapter for a browser, and at runtime by loading it with `pg`
 * counted.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

const pgLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock('pg', async (importOriginal) => {
  pgLoads.count++;
  return importOriginal();
});

/** Source with comments removed, so prose and examples cannot match. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every specifier a source file imports or re-exports, static or dynamic. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const pattern =
    /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of withoutComments(source).matchAll(pattern)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }
  return found;
}

/** Walks relative imports from `entry`, returning source files and bare specifiers. */
function walk(entry: string) {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiersOf(source)) {
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), specifier);
        queue.push(
          resolved.replace(/\.js$/, '') +
            (resolved.endsWith('.js') ? '.ts' : '.ts'),
        );
      } else {
        bare.add(specifier);
      }
    }
  }
  return { files, bare };
}

describe('pglite adapter browser safety', () => {
  const graph = walk(path.join(here, 'pglite.ts'));

  it('reaches only the files it is meant to', () => {
    const names = [...graph.files].map((file) => path.relative(here, file));
    expect(names.sort()).toEqual(
      [
        'pglite.ts',
        'schema-manager.ts',
        'shared/alter-utils.ts',
        'shared/connection-cache.ts',
        'shared/postgres-dialect.ts',
        'shared/transaction-lock.ts',
        'shared/types.ts',
        'shared/utils.ts',
      ].sort(),
    );
  });

  it('imports no node: built-in and no pg', () => {
    const specifiers = [...graph.bare];
    expect(specifiers.filter((s) => s.startsWith('node:'))).toEqual([]);
    expect(specifiers).not.toContain('pg');
    // Only the shared error classes and the optional peer.
    expect(specifiers.sort()).toEqual([
      '@electric-sql/pglite',
      '@happyvertical/utils',
    ]);
  });

  it('does not touch Node globals', () => {
    for (const file of graph.files) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      expect(source, path.relative(here, file)).not.toMatch(
        /\bprocess\.(env|versions|cwd|platform)\b|\brequire\(|__dirname|__filename/,
      );
    }
  });

  it('bundles for a browser with no Node built-in left in the output', async () => {
    const result = await build({
      root: path.resolve(here, '..'),
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: path.join(here, 'pglite.ts'),
          formats: ['es'],
          fileName: 'out',
        },
        // The peer is the consumer's to bundle.
        rollupOptions: { external: [/^@electric-sql\/pglite/] },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(
      (item) => ('output' in item ? item.output : []),
    );
    const chunks = outputs.filter((item) => item.type === 'chunk');
    const modules = chunks.flatMap((chunk) => Object.keys(chunk.modules));
    const code = chunks.map((chunk) => chunk.code).join('\n');

    expect(modules.length).toBeGreaterThan(0);
    // A Node built-in bundled for the browser becomes an empty stub module.
    expect(modules.filter((id) => id.includes('browser-external'))).toEqual([]);
    expect(code).not.toMatch(/node:[a-z_/]+/);
    expect(code).not.toMatch(/from\s*["']pg["']/);
  });

  it('runs without ever loading pg', async () => {
    const { getDatabase } = await import('./pglite');
    const db = await getDatabase();
    try {
      await db.query('CREATE TABLE t (id int)');
      await db.transaction?.(async (tx) => {
        await tx.insert('t', { id: 1 });
      });
      expect(await db.count('t')).toBe(1);
      expect(pgLoads.count).toBe(0);
    } finally {
      await db.close?.();
    }
  });
});
