import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAggregate,
  buildWhere,
  DatabaseSchemaManager,
  getDatabase,
} from './index.js';
import {
  generateCreateIndexStatement,
  renderIdentifierList,
  renderIndexTerm,
  renderSchemaIdentifier,
} from './shared/alter-utils.js';
import type { DatabaseInterface, SchemaDefinition } from './shared/types.js';

const quoteAll = { quoteIdentifiers: true };

for (const adapter of ['sqlite', 'pglite', 'duckdb'] as const) {
  describe(`${adapter} caller SQL string compatibility`, () => {
    let db: DatabaseInterface;
    const dialect = adapter === 'pglite' ? 'postgres' : adapter;
    beforeAll(async () => {
      db = await getDatabase({
        type: adapter,
        url: adapter === 'pglite' ? 'memory://' : ':memory:',
        cache: false,
        ...(adapter === 'duckdb' ? { autoRegisterJSON: false } : {}),
      });
      if (adapter === 'sqlite') await db.query('PRAGMA foreign_keys=ON');
    });
    afterAll(async () => {
      await db?.close?.();
    });
    beforeEach(async () => {
      await db.query('DROP TABLE IF EXISTS compatibility');
      await db.query(
        'CREATE TABLE compatibility (id INTEGER PRIMARY KEY, email TEXT, created_at INTEGER, total INTEGER, "order" INTEGER, "Full Name" TEXT, "1" INTEGER)',
      );
      await db.query(
        "INSERT INTO compatibility VALUES (1, 'Ada@Example', 3, 30, 1, 'Ada', 1), (2, 'bea@example', 2, 20, 2, 'Bea', 2)",
      );
    });

    it('passes expression and ordered index terms unchanged through shared generation', async () => {
      for (const [index, term] of [
        'lower(email)',
        'created_at DESC',
        '  lower(email)  ',
      ].entries()) {
        const sql = generateCreateIndexStatement(
          'compatibility',
          { name: `shared_term_${index}`, columns: [term] },
          dialect,
        );
        expect(sql.endsWith(`(${term})`)).toBe(true);
        await db.query(sql);
      }
      const keyword = generateCreateIndexStatement(
        'compatibility',
        { name: 'shared_keyword', columns: ['order'] },
        dialect,
      );
      expect(keyword).toContain(
        dialect === 'sqlite' ? '(`order`)' : '("order")',
      );
      await db.query(keyword);
    });

    it('rejects expression and ordered adapter index terms while quoting plain keywords', async () => {
      if (!db.alterTable) throw new Error('alterTable unavailable');
      for (const [index, term] of [
        'lower(email)',
        'created_at DESC',
      ].entries()) {
        await expect(
          db.alterTable.addIndex('compatibility', {
            name: `adapter_term_${index}`,
            columns: [term],
          }),
        ).rejects.toThrow('Invalid column name');
      }
      await db.alterTable.addIndex('compatibility', {
        name: 'adapter_keyword',
        columns: ['order'],
      });
      expect(await db.count('compatibility')).toBe(2);
    });

    it('preserves expression and ordered manifest indexes while quoting plain keyword names', async () => {
      await db.query('DROP TABLE IF EXISTS manifest_terms');
      const orderedColumn = 'created_at';
      const schema: SchemaDefinition = {
        tableName: 'manifest_terms',
        version: '1',
        packageName: 'test',
        dependencies: [],
        foreignKeys: [],
        triggers: [],
        columns: {
          email: { type: 'TEXT' },
          [orderedColumn]: { type: 'INTEGER' },
          order: { type: 'INTEGER' },
        },
        indexes: [
          { name: 'manifest_expression', columns: ['lower(email)'] },
          { name: 'manifest_ordered', columns: ['created_at DESC'] },
          { name: 'manifest_keyword', columns: ['order'] },
        ],
      };
      const result = await new DatabaseSchemaManager().initializeSchemas(db, {
        manifest: { schemas: { manifestTerms: schema } },
      });
      expect(result.errors).toEqual([]);
      await db.insert('manifest_terms', {
        email: 'ada@example',
        [orderedColumn]: 1,
        order: 2,
      });
      expect(await db.count('manifest_terms', { order: 2 })).toBe(1);
    });

    it('ignores tokens after ORDER direction and retains quoted spaced identifiers', async () => {
      const built = buildAggregate(
        {
          from: 'compatibility',
          select: [{ column: 'total' }],
          orderBy: 'total DESC NULLS LAST',
        },
        1,
        dialect,
      );
      expect(built.sql).toBe(
        'SELECT total AS total FROM compatibility GROUP BY total ORDER BY total DESC',
      );
      expect((await db.query(built.sql, built.values)).rows).toEqual([
        { total: 30 },
        { total: 20 },
      ]);
      const list = buildAggregate(
        {
          from: 'compatibility',
          select: [{ column: 'total' }],
          orderBy: ['total DESC NULLS LAST', 'total ASC extra ignored'],
        },
        1,
        dialect,
      );
      expect(list.sql).toContain('ORDER BY total DESC, total ASC');
      const spaced = buildAggregate(
        {
          from: 'compatibility',
          select: [{ column: '"Full Name"' }],
          orderBy: '"Full Name" DESC NULLS LAST',
        },
        1,
        dialect,
        quoteAll,
      );
      expect(spaced.sql).toContain(
        dialect === 'sqlite'
          ? 'ORDER BY `Full Name` DESC'
          : 'ORDER BY "Full Name" DESC',
      );
      expect(
        (await db.query(spaced.sql, spaced.values)).rows.map(
          (row) => row['Full Name'],
        ),
      ).toEqual(['Bea', 'Ada']);
    });

    it('preserves numeric select expressions, grouping and ORDER ordinals', async () => {
      for (const numeric of ['1', '1.5', '.5', '1.', '1e3', '0x10']) {
        const built = buildAggregate(
          {
            from: 'compatibility',
            select: [{ column: numeric, as: 'number_value' }],
            groupBy: ['1'],
            orderBy: '1 DESC extra',
          },
          1,
          dialect,
        );
        expect(built.sql).toBe(
          `SELECT ${numeric} AS number_value FROM compatibility GROUP BY 1 ORDER BY 1 DESC`,
        );
        if (adapter === 'duckdb' && numeric === '0x10') {
          await expect(db.query(built.sql, built.values)).rejects.toThrow();
        } else {
          expect((await db.query(built.sql, built.values)).rows).toEqual(
            (await db.query(`SELECT ${numeric} AS number_value`)).rows,
          );
        }
      }
      const expr = buildAggregate(
        {
          from: 'compatibility',
          select: [{ expr: { col: '.5' }, as: 'half' }],
        },
        1,
        dialect,
      );
      expect(expr.sql).toBe('SELECT .5 AS half FROM compatibility GROUP BY 1');
      expect((await db.query(expr.sql, expr.values)).rows).toHaveLength(1);
    });

    it('keeps numeric aliases, table names and explicit numeric columns as identifiers', async () => {
      for (const alias of ['1', '"1"']) {
        const built = buildAggregate(
          {
            from: 'compatibility',
            select: [
              { column: 'email', as: 'label' },
              { column: 'total', as: alias },
            ],
            orderBy: `${alias} DESC`,
          },
          1,
          dialect,
          quoteAll,
        );
        const quoted = dialect === 'sqlite' ? '`1`' : '"1"';
        expect(built.sql).toContain(`AS ${quoted}`);
        expect(built.sql).toContain(`ORDER BY ${quoted} DESC`);
        expect(
          (await db.query(built.sql, built.values)).rows.map((row) => row['1']),
        ).toEqual([30, 20]);
      }
      for (const name of ['123', '124']) {
        await db.query(
          `CREATE TABLE "${name}" (id INTEGER, total INTEGER, "1" INTEGER)`,
        );
        await db.query(`INSERT INTO "${name}" VALUES (1, 30, 7)`);
      }
      const numericFrom = buildAggregate(
        { from: '123', select: [{ column: 'total' }] },
        1,
        dialect,
        quoteAll,
      );
      expect(
        (await db.query(numericFrom.sql, numericFrom.values)).rows,
      ).toEqual([{ total: 30 }]);
      const joined = buildAggregate(
        {
          from: '123',
          fromAlias: 'r',
          joins: [
            {
              table: '124',
              alias: 'j',
              on: { op: 'eq', left: { col: 'r.id' }, right: { col: 'j.id' } },
            },
          ],
          select: [{ column: 'j."1"', as: '1' }],
        },
        1,
        dialect,
        quoteAll,
      );
      expect((await db.query(joined.sql, joined.values)).rows).toEqual([
        { '1': 7 },
      ]);
      const physical = buildAggregate(
        { from: '123', select: [{ column: '"1"', as: 'value' }] },
        1,
        dialect,
        quoteAll,
      );
      expect((await db.query(physical.sql, physical.values)).rows).toEqual([
        { value: 7 },
      ]);
    });

    it('preserves bounded numeric WHERE constants while explicit numeric names stay physical', async () => {
      for (const [numeric, value] of [
        ['1', 1],
        ['.5', 0.5],
        ['1.', 1],
        ['1e3', 1000],
      ] as const) {
        expect(buildWhere({ [numeric]: value }, 1, dialect, quoteAll).sql).toBe(
          `WHERE ${numeric} = $1`,
        );
        expect(
          await db.list('compatibility', { [numeric]: value }),
        ).toHaveLength(2);
      }
      expect(await db.list('compatibility', { '"1"': 1 })).toHaveLength(1);
      await expect(
        db.list('compatibility', { 'lower(email)': 'ada@example' }),
      ).rejects.toThrow('wrap developer-authored SQL expressions in raw()');
      await expect(
        db.insert('compatibility', { 'lower(email)': 'x' }),
      ).rejects.toThrow('Invalid column name');
      expect(() => buildWhere({ '-1': -1 }, 1, dialect)).toThrow(
        'Invalid SQL identifier',
      );
    });

    if (adapter === 'sqlite') {
      it('preserves legacy schema delimiter styles, quoted commas and doubled escapes', async () => {
        const names = [
          ['`a,b`', 'a,b'],
          ['[a,b]', 'a,b'],
          ["'a,b'", 'a,b'],
          ['`a``b`', 'a`b'],
          ["'a''b'", "a'b"],
        ];
        for (const [index, [input, physical]] of names.entries()) {
          const parent = `legacy_parent_${index}`;
          const child = `legacy_child_${index}`;
          await db.query(
            `CREATE TABLE ${parent} (${input} INTEGER, b INTEGER, UNIQUE(${input}, b))`,
          );
          const schema: SchemaDefinition = {
            tableName: child,
            version: '1',
            packageName: 'test',
            dependencies: [],
            triggers: [],
            columns: { [input]: { type: 'INTEGER' }, b: { type: 'INTEGER' } },
            indexes: [{ name: `legacy_index_${index}`, columns: [input] }],
            foreignKeys: [
              {
                column: `${input}, b`,
                referencesTable: parent,
                referencesColumn: `${input}, b`,
              },
            ],
          };
          const result = await new DatabaseSchemaManager().initializeSchemas(
            db,
            { manifest: { schemas: { [child]: schema } } },
          );
          expect(result.errors).toEqual([]);
          await db.query(`INSERT INTO ${parent} VALUES(1,2)`);
          await db.query(`INSERT INTO ${child} VALUES(1,2)`);
          expect((await db.query(`SELECT * FROM ${child}`)).rows).toEqual([
            { [physical]: 1, b: 2 },
          ]);
          await expect(
            db.query(`INSERT INTO ${child} VALUES(9,9)`),
          ).rejects.toThrow();
        }
        expect(renderSchemaIdentifier('`a``b`', 'sqlite', quoteAll)).toBe(
          '`a``b`',
        );
        expect(renderSchemaIdentifier('[a,b]', 'sqlite', quoteAll)).toBe(
          '`a,b`',
        );
        expect(renderSchemaIdentifier("'a''b'", 'sqlite', quoteAll)).toBe(
          "`a'b`",
        );
        for (const invalid of [
          '[a]]b]',
          '`a` trailing',
          "'a' OR 1=1",
          '[a,b',
        ]) {
          expect(() => renderSchemaIdentifier(invalid)).toThrow(
            'Invalid SQL identifier',
          );
        }
        await expect(
          db.list('compatibility', { '[email]': 'Ada@Example' }),
        ).rejects.toThrow('Invalid SQL identifier');
      });
    }

    it('retains composite manifest FK lists including literal commas inside quoted names', async () => {
      for (const quotedComma of [false, true]) {
        const suffix = quotedComma ? 'quoted' : 'plain';
        const parent = `parent_${suffix}`;
        const child = `child_${suffix}`;
        const first = quotedComma ? '"a,b"' : 'a';
        await db.query(`DROP TABLE IF EXISTS ${child}`);
        await db.query(`DROP TABLE IF EXISTS ${parent}`);
        await db.query(
          `CREATE TABLE ${parent} (${first} INTEGER, b INTEGER, UNIQUE (${first}, b))`,
        );
        const schema: SchemaDefinition = {
          tableName: child,
          version: '1',
          packageName: 'test',
          dependencies: [],
          triggers: [],
          indexes: [],
          columns: { [first]: { type: 'INTEGER' }, b: { type: 'INTEGER' } },
          foreignKeys: [
            {
              column: `${first}, b`,
              referencesTable: parent,
              referencesColumn: `${first}, b`,
            },
          ],
        };
        const result = await new DatabaseSchemaManager().initializeSchemas(db, {
          manifest: { schemas: { [child]: schema } },
        });
        expect(result.errors).toEqual([]);
        await db.query(`INSERT INTO ${parent} VALUES (1, 2)`);
        await db.query(`INSERT INTO ${child} VALUES (1, 2)`);
        await expect(
          db.query(`INSERT INTO ${child} VALUES (9, 9)`),
        ).rejects.toThrow();
        expect(await db.count(child)).toBe(1);
      }
    });
  });
}

describe('bounded compatibility parsing', () => {
  it('classifies only plain index identifiers for quoting and keeps SQL terms exact', () => {
    expect(renderIndexTerm('a."Full Name"', 'postgres', quoteAll)).toBe(
      '"a"."Full Name"',
    );
    for (const term of [
      'lower(email)',
      'created_at DESC',
      ' [email] ',
      '`email` DESC',
      "coalesce(email, '')",
    ]) {
      expect(renderIndexTerm(term, 'sqlite', quoteAll)).toBe(term);
    }
  });
  it('keeps FK list spacing and rejects expressions without a raw fallback', () => {
    expect(renderIdentifierList('a,  b')).toBe('a,  b');
    expect(
      renderIdentifierList('"a,b", "quote""name"', 'postgres', quoteAll),
    ).toBe('"a,b", "quote""name"');
    for (const invalid of ['lower(a), b', 'a,', '"a, b', 'a; DROP TABLE t'])
      expect(() => renderIdentifierList(invalid)).toThrow();
  });
});
