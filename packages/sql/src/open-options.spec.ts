import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPEN_OPTION_NAMES, readOpenOptions } from './shared/client-option';

/**
 * `getDatabase()` captures options by reading a fixed list of names. Every
 * top-level property of the adapters' option interfaces must be on that list,
 * or a supported option would be silently dropped.
 */

const here = dirname(fileURLToPath(import.meta.url));

function interfaceProperties(file: string, name: string): string[] {
  const source = readFileSync(join(here, file), 'utf8');
  const start = source.search(
    new RegExp(`export (?:interface|type) ${name}\\b[^{]*\\{`),
  );
  if (start < 0) throw new Error(`${name} not found in ${file}`);
  let index = source.indexOf('{', start) + 1;
  let depth = 1;
  const bodyStart = index;
  while (depth > 0) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    index += 1;
  }
  const names: string[] = [];
  let nesting = 0;
  for (const line of source.slice(bodyStart, index - 1).split('\n')) {
    if (nesting === 0) {
      const match = /^ {2}(?:readonly\s+)?([a-zA-Z_]+)\??:/.exec(line);
      if (match) names.push(match[1]);
    }
    for (const char of line) {
      if (char === '{' || char === '(') nesting += 1;
      if (char === '}' || char === ')') nesting -= 1;
    }
  }
  return names;
}

describe('getDatabase option names', () => {
  it('covers every top-level option of every adapter', () => {
    const declared = new Set([
      ...interfaceProperties('shared/types.ts', 'DatabaseOptions'),
      ...interfaceProperties('shared/types.ts', 'DatabaseCacheOptions'),
      ...interfaceProperties('shared/types.ts', 'DuckDBOptions'),
      ...interfaceProperties('shared/types.ts', 'JSONOptions'),
      ...interfaceProperties('sqlite.ts', 'SqliteOptions'),
      ...interfaceProperties('postgres.ts', 'PostgresOptions'),
      ...interfaceProperties('pglite.ts', 'PGliteOptions'),
    ]);
    expect(declared.size).toBeGreaterThan(20);
    declared.delete('client');
    const listed = new Set<string>(OPEN_OPTION_NAMES);
    expect([...declared].filter((name) => !listed.has(name))).toEqual([]);
  });

  it('reads each listed name once, keeps explicit undefined keys, and never enumerates', () => {
    const reads: string[] = [];
    const options = new Proxy(
      { url: ':memory:', dbid: undefined },
      {
        get(target, key) {
          if (typeof key === 'string') reads.push(key);
          return Reflect.get(target, key);
        },
        ownKeys() {
          throw new Error('must not enumerate');
        },
      },
    );
    const captured = readOpenOptions(options, undefined);
    expect(captured).toEqual({ url: ':memory:', dbid: undefined });
    expect('dbid' in captured).toBe(true);
    expect(reads.sort()).toEqual([...OPEN_OPTION_NAMES].sort());
  });
});
