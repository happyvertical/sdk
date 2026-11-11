import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bucketExpr,
  buildAggregate,
  buildWhere,
  DatabaseSchemaManager,
  getDatabase,
  raw,
} from './index.js';
import { renderIdentifier } from './shared/alter-utils.js';
import type { DatabaseInterface } from './shared/types.js';
import { getNativeSqliteDatabase } from './sqlite-native.js';

const words = [
  'order',
  'group',
  'from',
  'to',
  'select',
  'index',
  'check',
  'values',
  'user',
  'table',
];
const all = { quoteIdentifiers: true };
const pgUrl = process.env.SDK_TEST_POSTGRES_QUOTING_URL;
const postgresEnabled =
  Boolean(pgUrl) || process.env.TEST_DB_ADAPTER === 'postgres';
const adapters = [
  'sqlite',
  'sqlite-native',
  'pglite',
  'duckdb',
  'json',
  'postgres',
] as const;

for (const adapter of adapters) {
  describe.skipIf(adapter === 'postgres' && !postgresEnabled)(
    `${adapter} identifier quoting`,
    () => {
      let db: DatabaseInterface;
      let directory: string;
      let table: string;
      const dialect =
        adapter === 'pglite'
          ? 'postgres'
          : adapter === 'sqlite-native'
            ? 'sqlite'
            : adapter;
      const record = (id = 'one', order = 1) =>
        Object.fromEntries([
          ['id', id],
          ...words.map((word) => [word, word === 'order' ? order : 'Alpha']),
        ]);

      beforeAll(async () => {
        directory = await mkdtemp(join(tmpdir(), 'sdk-quoting-'));
        db =
          adapter === 'sqlite-native'
            ? await getNativeSqliteDatabase({ url: ':memory:', cache: false })
            : adapter === 'postgres'
              ? await getDatabase({
                  type: 'postgres',
                  url: pgUrl,
                  cache: false,
                })
              : adapter === 'json'
                ? await getDatabase({
                    type: 'json',
                    url: directory,
                    cache: false,
                    autoRegister: false,
                    writeStrategy: 'manual',
                  })
                : await getDatabase({
                    type: adapter,
                    url: adapter === 'pglite' ? 'memory://' : ':memory:',
                    cache: false,
                    ...(adapter === 'duckdb'
                      ? { autoRegisterJSON: false }
                      : {}),
                  });
      });
      afterAll(async () => {
        if (adapter === 'postgres') {
          for (const name of [...created].reverse())
            await db.query(`DROP TABLE IF EXISTS "${name}"`);
        }
        await db?.close?.();
        await rm(directory, { recursive: true, force: true });
      });
      const created = new Set<string>();
      beforeEach(async () => {
        table = `quoting_${randomUUID().replaceAll('-', '')}`;
        created.add(table);
        await db.query(
          `CREATE TABLE ${table} (id TEXT PRIMARY KEY, ${words.map((word) => `"${word}" ${word === 'order' ? 'INTEGER UNIQUE' : 'TEXT'}`).join(', ')}, "MixedCase" TEXT, "Full Name" TEXT, "cell$1" TEXT, "cell?" TEXT)`,
        );
      });

      it('round trips every keyword through insert, batch insert, upsert conflict and update', async () => {
        await db.insert(table, record());
        await db.insert(table, [
          record('two', 2),
          Object.fromEntries(Object.entries(record('three', 3)).reverse()),
        ]);
        await db.upsert(table, ['order'], { ...record(), group: 'updated' });
        await db.update(
          table,
          { order: 2 },
          { select: 'changed', table: 'changed' },
        );
        for (const word of words) {
          const value =
            word === 'order' ? 1 : word === 'group' ? 'updated' : 'Alpha';
          expect(
            (await db.list(table, { [word]: value })).some(
              (row) => row.id === 'one',
            ),
          ).toBe(true);
        }
        expect((await db.get(table, { order: 2 }))?.select).toBe('changed');
        expect(await db.count(table, { 'order >': 0 })).toBe(3);
        expect(await db.tableExists(table)).toBe(true);
        await db.delete(table, { order: 3 });
        expect(await db.count(table)).toBe(2);
      });

      it('executes every WHERE suffix, NULL, array, compound, qualified and raw binding', async () => {
        await db.insert(table, [record(), record('two', 2)]);
        await db.update(table, { order: 2 }, { from: null });
        const cases: Array<[Record<string, unknown>, number]> = [
          [{ order: 1 }, 1],
          [{ 'order =': 1 }, 1],
          [{ 'order !=': 1 }, 1],
          [{ 'order >': 1 }, 1],
          [{ 'order >=': 1 }, 2],
          [{ 'order <': 2 }, 1],
          [{ 'order <=': 2 }, 2],
          [{ 'group like': 'Al%' }, 2],
          [{ 'group contains': 'lph' }, 2],
          [{ 'order in': [1, 2] }, 2],
          [{ 'order not in': [2] }, 1],
          [{ from: null }, 1],
          [{ 'from !=': null }, 1],
          [{ [`${table}.order >`]: 1 }, 1],
          [{ [raw('COALESCE("order", 0) >')]: 1 }, 1],
        ];
        for (const [where, count] of cases) {
          expect(
            await db.list(table, where),
            JSON.stringify(where),
          ).toHaveLength(count);
          expect(await db.count(table, where)).toBe(count);
        }
        expect(
          await db.list(table, [
            [{ order: 1 }, { group: 'Alpha' }],
            [{ order: 2 }],
          ]),
        ).toHaveLength(2);
        await expect(db.list(table, { 'order in': [] })).rejects.toThrow(
          /at least one/,
        );
        await expect(db.list(table, { 'order > 0 OR id': 1 })).rejects.toThrow(
          /Invalid SQL identifier/,
        );
        await db.delete(table, { 'order in': [2] });
        expect(
          await db.getOrInsert(table, { order: 1 }, record()),
        ).toMatchObject({ id: 'one' });
        expect(
          await db.getOrInsert(table, { order: 3 }, record('three', 3)),
        ).toMatchObject({ id: 'three' });
      });

      it('quotes NULL-aware upsert predicates and both insert/update arms', async () => {
        await db.upsert(table, ['from'], { ...record(), from: null });
        await db.upsert(table, ['from'], {
          ...record(),
          from: null,
          group: 'second',
        });
        expect(await db.count(table)).toBe(1);
        expect((await db.get(table, { from: null }))?.group).toBe('second');
      });

      it('supports explicit exact/spaced names consistently in strict CRUD and WHERE', async () => {
        await db.insert(table, {
          id: 'exact',
          '"MixedCase"': 'exact',
          '"Full Name"': 'Ada',
          '"cell$1"': 'parameter-like name',
          '"cell?"': 'question name',
        });
        await db.update(
          table,
          { '"Full Name" like': 'A%' },
          { '"MixedCase"': 'updated' },
        );
        expect(
          (await db.get(table, { '"MixedCase"': 'updated' }))?.['Full Name'],
        ).toBe('Ada');
        expect(await db.count(table, { '"Full Name"': 'Ada' })).toBe(1);
        expect(
          (await db.get(table, { '"cell$1"': 'parameter-like name' }))?.id,
        ).toBe('exact');
        const literalUpsert = adapter === 'duckdb' || adapter === 'json';
        await db.upsert(table, ['id'], {
          id: 'exact',
          [literalUpsert ? 'MixedCase' : '"MixedCase"']: 'upsert exact',
          [literalUpsert ? 'Full Name' : '"Full Name"']: 'Ada',
        });
        expect((await db.get(table, { '"Full Name"': 'Ada' }))?.MixedCase).toBe(
          'upsert exact',
        );
        await db.delete(table, { '"Full Name"': 'Ada' });
        expect(await db.count(table)).toBe(0);
      });

      it('preserves parameter-like quoted names, SQL literals and comments with real bindings', async () => {
        await db.insert(table, {
          id: 'bind',
          '"cell$1"': 'dollar name',
          '"cell?"': 'question name',
        });
        const result = await db.query(
          `SELECT "cell$1", "cell?", '$77 ?' AS literal_text FROM ${table} /* $88 ? */ WHERE id = $1 -- $99 ?
`,
          ['bind'],
        );
        expect(result.rows[0]?.cell$1).toBe('dollar name');
        expect(result.rows[0]?.['cell?']).toBe('question name');
        expect(result.rows[0]?.literal_text).toBe('$77 ?');
        if (dialect === 'postgres') {
          const legacy = await db.query(
            `SELECT "cell$1", "cell?", '$77 ?' AS literal_text FROM ${table} /* $88 ? */ WHERE id = ?`,
            ['bind'],
          );
          expect(legacy.rows[0]?.['cell?']).toBe('question name');
        }
      });

      it('executes quoted aggregates, keyword aliases, groups, HAVING and ORDER BY', async () => {
        await db.insert(table, [record(), record('two', 2)]);
        for (const options of [undefined, all]) {
          const built = buildAggregate(
            {
              from: table,
              select: [
                { column: 'group', as: 'from' },
                { fn: 'sum', column: 'order', as: 'select' },
                { fn: 'count', column: 'order', as: 'values' },
                { fn: 'min', column: 'order', as: 'minimum' },
                { fn: 'max', column: 'order', as: 'maximum' },
                { fn: 'avg', column: 'order', as: 'average' },
              ],
              where: { 'order >=': 1 },
              having: { 'select >': 2 },
              orderBy: 'select DESC',
            },
            1,
            dialect,
            options,
          );
          const row = (await db.query(built.sql, built.values)).rows[0];
          expect(row?.from).toBe('Alpha');
          expect(Number(row?.select)).toBe(3);
          expect(Number(row?.values)).toBe(2);
          expect(Number(row?.average)).toBe(1.5);
        }
      });

      it('quotes qualified join/expression columns and preserves scoped alias validation', async () => {
        await db.insert(table, record());
        const built = buildAggregate(
          {
            from: table,
            fromAlias: 'a',
            joins: [
              {
                table,
                alias: 'b',
                on: {
                  op: 'eq',
                  left: { col: 'a.order' },
                  right: { col: 'b.order' },
                },
              },
            ],
            select: [
              {
                expr: {
                  op: 'add',
                  left: { col: 'a.order' },
                  right: { col: 'b.order' },
                },
                as: 'group',
              },
            ],
            where: { 'a.order': 1 },
            orderBy: 'group DESC',
          },
          1,
          dialect,
          all,
        );
        expect(
          Number((await db.query(built.sql, built.values)).rows[0]?.group),
        ).toBe(2);
        expect(() =>
          buildAggregate(
            {
              from: table,
              fromAlias: 'a',
              select: [{ column: 'unknown.order' }],
            },
            1,
            dialect,
            all,
          ),
        ).toThrow(/must be qualified/);
      });

      it('quotes time bucket columns and explicit spaced ORDER BY aliases', async () => {
        await db.alterTable?.addColumn(table, {
          name: 'when',
          type: 'TIMESTAMP',
        });
        if (!db.alterTable)
          await db.query(`ALTER TABLE ${table} ADD COLUMN "when" TIMESTAMP`);
        await db.insert(table, { id: 'time', when: '2026-01-02 03:04:05' });
        const built = buildAggregate(
          {
            from: table,
            select: [
              { bucket: 'day', column: 'when', as: '"Full Name"' },
              { fn: 'count', as: 'count' },
            ],
            orderBy: '"Full Name" DESC',
          },
          1,
          dialect,
          all,
        );
        expect((await db.query(built.sql, built.values)).rows).toHaveLength(1);
        expect(
          (
            await db.query(
              `SELECT ${bucketExpr(dialect, 'day', 'when', all)} AS value FROM ${table}`,
            )
          ).rows[0]?.value,
        ).toBeDefined();
      });

      it('quotes manifest columns/foreign keys/indexes and known-dialect ALTER identifiers', async () => {
        const manifestTable = `${table}_schema`;
        created.add(manifestTable);
        const result = await new DatabaseSchemaManager().initializeSchemas(db, {
          overrides: {
            [manifestTable]: {
              tableName: manifestTable,
              version: '1',
              packageName: 'quoting-test',
              dependencies: [],
              triggers: [],
              columns: {
                id: { type: 'TEXT', primaryKey: true },
                order: { type: 'INTEGER' },
                from: { type: 'INTEGER' },
              },
              foreignKeys: [
                {
                  column: 'from',
                  referencesTable: table,
                  referencesColumn: 'order',
                },
              ],
              indexes: [{ name: `${manifestTable}_order`, columns: ['order'] }],
            },
          },
        });
        expect(result.errors).toEqual([]);
        await db.insert(table, record());
        await db.insert(manifestTable, { id: 'manifest', order: 7, from: 1 });
        expect((await db.get(manifestTable, { order: 7 }))?.from).toBe(1);
        if (db.alterTable) {
          await db.alterTable.addColumn(manifestTable, {
            name: 'select',
            type: 'TEXT',
          });
          await db.alterTable.addIndex(manifestTable, {
            name: `${manifestTable}_select`,
            columns: ['select'],
          });
          await db.update(manifestTable, { order: 7 }, { select: 'altered' });
          expect(await db.count(manifestTable, { select: 'altered' })).toBe(1);
        }
      });

      it('retains transaction affinity and rollback with keyword writes', async () => {
        await expect(
          db.transaction?.(async (tx) => {
            await tx.insert(table, record());
            await tx.update(table, { order: 1 }, { group: 'inside' });
            expect((await tx.get(table, { group: 'inside' }))?.id).toBe('one');
            throw new Error('rollback quoting test');
          }),
        ).rejects.toThrow('rollback quoting test');
        expect(await db.count(table)).toBe(0);
      });

      it('rejects invalid strict column inputs without executing injected SQL', async () => {
        for (const column of [
          '',
          '1',
          'x"',
          'x; DROP TABLE pwned',
          '"unterminated',
          '"safe"; DROP TABLE pwned',
          'a\0b',
        ]) {
          await expect(db.insert(table, { [column]: 'bad' })).rejects.toThrow(
            /Invalid column name/,
          );
        }
        expect(await db.tableExists(table)).toBe(true);
      });

      if (dialect === 'postgres')
        it('preserves PostgreSQL bare camelCase folding alongside explicit exact case', async () => {
          await db.query(`ALTER TABLE ${table} ADD COLUMN camelCase TEXT`);
          await db.insert(table, {
            id: 'fold',
            camelCase: 'folded',
            '"MixedCase"': 'exact',
          });
          await db.update(
            table,
            { camelCase: 'folded' },
            { camelCase: 'updated' },
          );
          await db.upsert(table, ['id'], {
            id: 'fold',
            camelCase: 'upserted',
            '"MixedCase"': 'still exact',
          });
          const row = await db.get(table, {
            camelCase: 'upserted',
            '"MixedCase"': 'still exact',
          });
          expect(row?.camelcase).toBe('upserted');
          expect(row?.MixedCase).toBe('still exact');
        });
    },
  );
}

describe('public identifier rendering compatibility', () => {
  it('retains ordinary SQL and offers quote-all without changing parameter indices', () => {
    expect(buildWhere({ camelCase: 1 }, 3, 'postgres')).toEqual({
      sql: 'WHERE camelCase = $3',
      values: [1],
    });
    expect(buildWhere({ 't.camelCase >': 1 }, 3, 'postgres', all)).toEqual({
      sql: 'WHERE "t"."camelcase" > $3',
      values: [1],
    });
    expect(buildWhere({ order: 1 }, 1, 'postgres').sql).toBe(
      'WHERE "order" = $1',
    );
    expect(
      buildWhere({ [raw('SUM("order") >')]: 1 }, 1, 'postgres', all).sql,
    ).toBe('WHERE SUM("order") > $1');
    expect(
      buildAggregate(
        { from: 'items', select: [{ column: 'total' }] },
        1,
        'postgres',
      ).sql,
    ).toBe('SELECT total AS total FROM items GROUP BY total');
  });
  it('parses validated qualified identifiers and rejects malformed/nonstrings', () => {
    expect(renderIdentifier('a."Full Name"', 'postgres', all)).toBe(
      '"a"."Full Name"',
    );
    expect(renderIdentifier('"a.b"', 'postgres', all)).toBe('"a.b"');
    for (const invalid of [
      '',
      '.a',
      'a.',
      'a..b',
      'a"b',
      '"a" trailing',
      '\0',
      null,
      {},
      ['a'],
    ]) {
      expect(() =>
        renderIdentifier(invalid as string, 'postgres', all),
      ).toThrow(/Invalid SQL identifier/);
    }
  });
});

describe('JSON literal physical identifier persistence', () => {
  it('preserves permissive upsert/catalog keys and writeback/reload without renaming', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sdk-json-keys-'));
    const names = [
      'Full Name',
      'user-id',
      '2024_total',
      'foo.bar',
      'em"bed',
      '"Full Name"',
    ];
    let db: DatabaseInterface | undefined;
    try {
      db = await getDatabase({ type: 'json', url: directory, cache: false });
      await db.query(
        `CREATE TABLE literal_keys (id TEXT PRIMARY KEY, ${names.map((name) => `"${name.replaceAll('"', '""')}" TEXT${name === 'Full Name' ? ' UNIQUE' : ''}`).join(', ')})`,
      );
      const record = {
        id: 'one',
        ...Object.fromEntries(names.map((name) => [name, name])),
      };
      await db.upsert('literal_keys', ['id'], record);
      const persisted = JSON.parse(
        await readFile(join(directory, 'literal_keys.json'), 'utf8'),
      );
      expect(persisted).toEqual([record]);
      await db.close?.();
      db = await getDatabase({ type: 'json', url: directory, cache: false });
      expect(await db.get('literal_keys', { '"foo.bar"': 'foo.bar' })).toEqual(
        record,
      );
      expect(
        await db.get('literal_keys', { '"""Full Name"""': '"Full Name"' }),
      ).toEqual(record);
      await db.upsert('literal_keys', ['Full Name'], {
        ...record,
        'em"bed': 'changed',
      });
      expect((await db.get('literal_keys', { id: 'one' }))?.['em"bed']).toBe(
        'changed',
      );
      await db.upsert('literal_keys', ['Full Name'], {
        ...record,
        id: 'null-key',
        'Full Name': null,
      });
      await db.upsert('literal_keys', ['Full Name'], {
        ...record,
        id: 'null-key',
        'Full Name': null,
        'foo.bar': 'null updated',
      });
      expect(await db.count('literal_keys', { '"Full Name"': null })).toBe(1);
      expect(
        (await db.get('literal_keys', { id: 'null-key' }))?.['foo.bar'],
      ).toBe('null updated');
    } finally {
      await db?.close?.();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
