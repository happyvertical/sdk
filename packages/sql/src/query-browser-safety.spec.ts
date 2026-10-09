/**
 * The `./query` subpath must be browser-safe: no `node:` built-ins and no
 * driver packages. Checked three ways — by walking the source import graph, by
 * bundling it for a browser, and at runtime by loading it with the drivers
 * counted. It must also lose nothing: every driver-independent root export is
 * available from it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it, vi } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

const driverLoads = vi.hoisted(() => ({ count: 0 }));

for (const driver of ['pg', '@libsql/client', '@duckdb/node-api']) {
  vi.doMock(driver, async (importOriginal) => {
    driverLoads.count++;
    return importOriginal();
  });
}

/** Root exports that need a driver, a Node built-in, or the filesystem. */
const DRIVER_BOUND_ROOT_EXPORTS = [
  'getDatabase',
  'default',
  'PACKAGE_VERSION_INITIALIZED',
  'clearConnectionCache',
  'clearPostgresConnectionCache',
  'runDoctor',
  'checkExpectedTables',
  'checkRelationship',
  'checkUniqueColumn',
  'assertCanExportDatabase',
  'assertCanImportDatabase',
  'createPostgresDatabase',
  'databaseNameFromUrl',
  'dropPostgresDatabase',
  'dumpPostgresDatabase',
  'isLocalDatabaseUrl',
  'postgresEnvFromUrl',
  'redactDatabaseUrl',
  'restorePostgresDatabase',
];

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

describe('query subpath browser safety', () => {
  const graph = walk(path.join(here, 'query.ts'));

  it('imports no node: built-in and no driver package', () => {
    const specifiers = [...graph.bare];
    expect(specifiers.filter((s) => s.startsWith('node:'))).toEqual([]);
    // Only the shared error classes.
    expect(specifiers.sort()).toEqual(['@happyvertical/utils']);
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
          entry: path.join(here, 'query.ts'),
          formats: ['es'],
          fileName: 'out',
        },
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
    expect(code).not.toMatch(
      /from\s*["'](pg|@libsql\/client|@duckdb\/node-api)["']/,
    );
  });

  it('runs without ever loading a driver', async () => {
    const query = await import('./query');
    expect(query.validateColumnName('a.b_1')).toBe('a.b_1');
    expect(() => query.validateColumnName('a;b')).toThrow();
    const { sql, values } = query.buildWhere({ id: 1 });
    expect(sql).toContain('id');
    expect(values).toEqual([1]);
    expect(driverLoads.count).toBe(0);
  });

  it('loses nothing: every driver-independent root export is on the subpath', async () => {
    const [root, query] = await Promise.all([
      import('./index'),
      import('./query'),
    ]);
    const missing = Object.keys(root).filter(
      (name) => !DRIVER_BOUND_ROOT_EXPORTS.includes(name) && !(name in query),
    );
    expect(missing).toEqual([]);
    // Same bindings, not copies.
    for (const name of Object.keys(query)) {
      expect((query as any)[name]).toBe((root as any)[name]);
    }
    // The helpers s-m-r-t imports from the root.
    for (const name of [
      'validateColumnName',
      'buildWhere',
      'buildAggregate',
      'bucketExpr',
      'tableExists',
      'syncSchema',
      'raw',
      'escapeSqlValue',
      'NestedTransactionError',
    ]) {
      expect(typeof (query as any)[name], name).toBe('function');
    }
  });
});
