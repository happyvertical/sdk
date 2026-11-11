import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index.js';
import { createAlterTable } from './shared/postgres-dialect.js';
import type { DatabaseInterface } from './shared/types.js';
import { getNativeSqliteDatabase } from './sqlite-native.js';

const invalidTerms: unknown[] = [
  'lower(email)',
  'created_at DESC',
  'a); DROP TABLE t; --',
  'Full Name',
  '2024_total',
  '"Full Name"',
  '"email"',
  't.email',
  '',
  null,
  {},
  ['email'],
];
const baseError = (term: unknown) =>
  `Invalid column name: ${term}. Column names must be a string that starts with a letter or underscore and contains only alphanumeric characters and underscores.`;

for (const adapter of [
  'sqlite',
  'native',
  'secure-file',
  'pglite',
  'duckdb',
] as const) {
  describe(`${adapter} adapter index column validation`, () => {
    let db: DatabaseInterface;
    let directory: string;
    beforeAll(async () => {
      directory = await mkdtemp(
        join(await realpath(tmpdir()), 'sdk-index-validation-'),
      );
      db =
        adapter === 'native'
          ? await getNativeSqliteDatabase({ url: ':memory:', cache: false })
          : await getDatabase({
              type: adapter === 'secure-file' ? 'sqlite' : adapter,
              url:
                adapter === 'secure-file'
                  ? join(directory, 'database.sqlite')
                  : adapter === 'pglite'
                    ? 'memory://'
                    : ':memory:',
              cache: false,
              ...(adapter === 'secure-file'
                ? {
                    secureFile: {
                      driver: 'node:sqlite',
                      custody: 'trusted-parent',
                    } as const,
                  }
                : {}),
              ...(adapter === 'duckdb' ? { autoRegisterJSON: false } : {}),
            });
      await db.query(
        'CREATE TABLE t (id INTEGER PRIMARY KEY, a INTEGER, email TEXT, created_at INTEGER, "order" INTEGER, FullName TEXT)',
      );
      await db.query(
        "INSERT INTO t VALUES (1,1,'one',1,1,'one'), (2,2,'two',2,2,'two')",
      );
    });
    afterAll(async () => {
      await db?.close?.();
      await rm(directory, { recursive: true, force: true });
    });

    it('rejects every non-base term with the exact base error before SQL can mutate data', async () => {
      if (!db.alterTable) throw new Error('alterTable unavailable');
      for (const [index, term] of invalidTerms.entries()) {
        await expect(
          db.alterTable.addIndex('t', {
            name: `rejected_term_${index}`,
            columns: [term as string],
          }),
        ).rejects.toMatchObject({ message: baseError(term) });
        expect(await db.tableExists('t')).toBe(true);
        expect(await db.count('t')).toBe(2);
        expect(
          (await db.query('SELECT email FROM t ORDER BY id')).rows,
        ).toEqual([{ email: 'one' }, { email: 'two' }]);
      }
    });

    it('keeps bare FullName valid and quotes a validated keyword column', async () => {
      if (!db.alterTable) throw new Error('alterTable unavailable');
      await db.alterTable.addIndex('t', {
        name: 'valid_full_name',
        columns: ['FullName'],
      });
      await db.alterTable.addIndex('t', {
        name: 'valid_keyword',
        columns: ['order'],
      });
      expect(await db.count('t', { order: 1 })).toBe(1);
    });
  });
}

describe('PostgreSQL shared driver entry index validation', () => {
  it('rejects before reaching the driver and preserves keyword/folding rendering', async () => {
    const statements: string[] = [];
    const alter = createAlterTable({
      query: async (sql) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      },
    });
    for (const [index, term] of invalidTerms.entries()) {
      await expect(
        alter.addIndex('t', {
          name: `rejected_${index}`,
          columns: [term as string],
        }),
      ).rejects.toMatchObject({ message: baseError(term) });
    }
    expect(statements).toEqual([]);
    await alter.addIndex('t', { name: 'valid_keyword', columns: ['order'] });
    await alter.addIndex('t', {
      name: 'valid_full_name',
      columns: ['FullName'],
    });
    expect(statements).toEqual([
      'CREATE INDEX "valid_keyword" ON "t" ("order")',
      'CREATE INDEX "valid_full_name" ON "t" ("fullname")',
    ]);
  });
});
