import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildAggregate, buildWhere, getDatabase } from './index.js';
import type { DatabaseInterface } from './shared/types.js';
import { getNativeSqliteDatabase } from './sqlite-native.js';

for (const adapter of ['libsql', 'native', 'secure-file'] as const) {
  describe(`${adapter} SQLite identifiers fail closed`, () => {
    let db: DatabaseInterface;
    let directory: string;
    beforeAll(async () => {
      directory = await mkdtemp(
        join(await realpath(tmpdir()), 'sdk-sqlite-names-'),
      );
      db =
        adapter === 'native'
          ? await getNativeSqliteDatabase({ url: ':memory:', cache: false })
          : await getDatabase({
              type: 'sqlite',
              cache: false,
              url:
                adapter === 'secure-file'
                  ? join(directory, 'database.sqlite')
                  : ':memory:',
              ...(adapter === 'secure-file'
                ? {
                    secureFile: {
                      driver: 'node:sqlite',
                      custody: 'trusted-parent',
                    } as const,
                  }
                : {}),
            });
    });
    afterAll(async () => {
      await db?.close?.();
      await rm(directory, { recursive: true, force: true });
    });
    beforeEach(async () => {
      await db.query('DROP TABLE IF EXISTS protected_rows');
      await db.query(
        'CREATE TABLE protected_rows (id INTEGER PRIMARY KEY, value TEXT, "right]name" TEXT, "tick`name" TEXT)',
      );
      await db.insert('protected_rows', [
        { id: 1, value: 'one' },
        { id: 2, value: 'two' },
      ]);
    });

    it('rejects absent WHERE columns for reads and mutations without changing rows', async () => {
      for (const where of [
        { 'missing !=': 'x' },
        { missing: null },
        { 'missing !=': null },
      ]) {
        for (const operation of [
          () => db.get('protected_rows', where),
          () => db.list('protected_rows', where),
          () => db.count('protected_rows', where),
          () => db.update('protected_rows', where, { value: 'overwritten' }),
          () => db.delete('protected_rows', where),
        ]) {
          await expect(operation()).rejects.toThrow();
          expect(await db.count('protected_rows')).toBe(2);
          expect(
            (await db.list('protected_rows')).map((row) => row.value).sort(),
          ).toEqual(['one', 'two']);
        }
      }
    });

    it('rolls back preceding writes when an absent-column delete fails', async () => {
      if (!db.transaction) throw new Error('transaction unavailable');
      await expect(
        db.transaction(async (tx) => {
          await tx.update('protected_rows', { id: 1 }, { value: 'temporary' });
          await tx.delete('protected_rows', { 'missing !=': null });
        }),
      ).rejects.toThrow();
      expect(await db.count('protected_rows')).toBe(2);
      expect((await db.get('protected_rows', { id: 1 }))?.value).toBe('one');
    });

    it('escapes closing brackets and backticks in CRUD and public quote-all builders', async () => {
      const keys = { '"right]name"': 'bracket', '"tick`name"': 'backtick' };
      await db.update('protected_rows', { id: 1 }, keys);
      await db.upsert('protected_rows', ['id'], {
        id: 1,
        value: 'one',
        ...keys,
      });
      expect((await db.get('protected_rows', keys))?.id).toBe(1);
      const where = buildWhere(
        { 'protected_rows."tick`name"': 'backtick' },
        1,
        'sqlite',
        { quoteIdentifiers: true },
      );
      expect(where.sql).toBe('WHERE `protected_rows`.`tick``name` = $1');
      expect(
        (
          await db.query(
            `SELECT * FROM protected_rows ${where.sql}`,
            where.values,
          )
        ).rows,
      ).toHaveLength(1);
      const aggregate = buildAggregate(
        {
          from: 'protected_rows',
          select: [{ column: '"right]name"' }],
          where: keys,
        },
        1,
        'sqlite',
        { quoteIdentifiers: true },
      );
      expect(aggregate.sql).toContain('`right]name`');
      expect(
        (await db.query(aggregate.sql, aggregate.values)).rows,
      ).toHaveLength(1);
      const missing = buildWhere({ 'missing !=': null }, 1, 'sqlite', {
        quoteIdentifiers: true,
      });
      await expect(
        db.query(`SELECT * FROM protected_rows ${missing.sql}`, missing.values),
      ).rejects.toThrow();
      await db.delete('protected_rows', keys);
      expect(await db.count('protected_rows')).toBe(1);
    });

    if (adapter === 'secure-file') {
      it('preserves authored raw SQL double-quoted string fallback', async () => {
        expect((await db.query('SELECT "missing" AS value')).rows).toEqual([
          { value: 'missing' },
        ]);
      });
    }
  });
}
