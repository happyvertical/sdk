import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { parseGeneratedColumns } from './shared/duckdb-schema-utils';
import { resetSqliteFileTracking } from './shared/sqlite-engine';
import type { DatabaseInterface } from './shared/types';

/**
 * #1549: getTableSchema reports `generated` and `hidden` per column, lists
 * generated columns on every adapter, and is available on transaction handles.
 * PostgreSQL and PGlite also accept a `schema.table` name.
 */

const open: DatabaseInterface[] = [];
const roots: string[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
  resetSqliteFileTracking();
});

async function track(db: DatabaseInterface): Promise<DatabaseInterface> {
  open.push(db);
  return db;
}

async function ordinaryColumnsUnchanged(db: DatabaseInterface, table: string) {
  const schema = await db.getTableSchema?.(table);
  expect(schema?.tableName).toBe(table);
  expect(schema?.columns.id).toMatchObject({
    primaryKey: true,
    generated: false,
    hidden: false,
  });
  expect(schema?.columns.qty).toMatchObject({
    primaryKey: false,
    generated: false,
    hidden: false,
  });
}

describe.each([
  ['libsql', async () => getDatabase({ type: 'sqlite', url: ':memory:' })],
  [
    'node:sqlite',
    async () => {
      const root = await mkdtemp(join(await realpath(tmpdir()), 'sdk-ts-'));
      roots.push(root);
      return getDatabase({
        type: 'sqlite',
        url: join(root, 'schema.db'),
        secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
      });
    },
  ],
] as const)('SQLite getTableSchema (%s)', (_name, create) => {
  const ddl = `CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    qty INTEGER NOT NULL,
    stored_total INTEGER GENERATED ALWAYS AS (qty * 2) STORED,
    virtual_total INTEGER GENERATED ALWAYS AS (qty * 3) VIRTUAL
  )`;

  it('lists generated columns and flags them', async () => {
    const db = await track(await create());
    await db.query(ddl);
    const schema = await db.getTableSchema?.('items');
    expect(Object.keys(schema?.columns ?? {})).toEqual([
      'id',
      'qty',
      'stored_total',
      'virtual_total',
    ]);
    expect(schema?.columns.stored_total).toMatchObject({
      generated: true,
      hidden: false,
    });
    expect(schema?.columns.virtual_total).toMatchObject({
      generated: true,
      hidden: false,
    });
    expect(schema?.columns.qty).toMatchObject({
      notNull: true,
      generated: false,
    });
    await ordinaryColumnsUnchanged(db, 'items');
  });

  it('flags hidden virtual-table columns', async () => {
    const db = await track(await create());
    await db.query('CREATE VIRTUAL TABLE docs USING fts5(body)');
    const schema = await db.getTableSchema?.('docs');
    expect(schema?.columns.body).toMatchObject({
      generated: false,
      hidden: false,
    });
    expect(schema?.columns.rank).toMatchObject({ hidden: true });
  });

  it('is available on a transaction handle and sees uncommitted tables', async () => {
    const db = await track(await create());
    await db.transaction?.(async (tx) => {
      await tx.query(ddl);
      const schema = await tx.getTableSchema?.('items');
      expect(schema?.columns.stored_total.generated).toBe(true);
      expect(await tx.getTableSchema?.('missing')).toBeNull();
    });
  });
});

describe('PGlite getTableSchema', () => {
  const ddl = (schema = 'public') => `CREATE TABLE ${schema}.items (
    id integer PRIMARY KEY,
    qty integer NOT NULL,
    stored_total integer GENERATED ALWAYS AS (qty * 2) STORED
  )`;

  it('flags stored generated columns', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query(ddl());
    const schema = await db.getTableSchema?.('items');
    expect(schema?.columns.stored_total).toMatchObject({
      generated: true,
      hidden: false,
    });
    await ordinaryColumnsUnchanged(db, 'items');
  });

  it('flags a virtual generated column where the server supports it', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query('CREATE TABLE v (a integer)');
    let supported = true;
    try {
      await db.query(
        'ALTER TABLE v ADD COLUMN b integer GENERATED ALWAYS AS (a + 1) VIRTUAL',
      );
    } catch {
      // PostgreSQL before 18 has stored generated columns only.
      supported = false;
    }
    if (!supported) return;
    const schema = await db.getTableSchema?.('v');
    expect(schema?.columns.b.generated).toBe(true);
    expect(schema?.columns.a.generated).toBe(false);
  });

  it('resolves schema-qualified names without mixing same-named tables', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query('CREATE SCHEMA tenant_a');
    await db.query('CREATE SCHEMA tenant_b');
    await db.query('CREATE TABLE tenant_a.items (a_only integer)');
    await db.query(
      'CREATE TABLE tenant_b.items (b_only integer, b_total integer GENERATED ALWAYS AS (b_only * 2) STORED)',
    );

    expect(await db.tableExists('tenant_a.items')).toBe(true);
    expect(await db.tableExists('tenant_b.items')).toBe(true);
    expect(await db.tableExists('tenant_a.nothing')).toBe(false);
    expect(await db.tableExists('tenant_c.items')).toBe(false);
    // Not on the search_path.
    expect(await db.tableExists('items')).toBe(false);

    const a = await db.getTableSchema?.('tenant_a.items');
    expect(Object.keys(a?.columns ?? {})).toEqual(['a_only']);
    expect(a?.tableName).toBe('tenant_a.items');
    const b = await db.getTableSchema?.('tenant_b.items');
    expect(Object.keys(b?.columns ?? {})).toEqual(['b_only', 'b_total']);
    expect(b?.columns.b_total.generated).toBe(true);
    expect(await db.getTableSchema?.('tenant_c.items')).toBeNull();
  });

  it('keeps a literal dotted table name literal', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query('CREATE SCHEMA lit');
    await db.query('CREATE TABLE lit.t (in_schema integer)');
    await db.query('CREATE TABLE "lit.t" (literal_col integer)');
    const schema = await db.getTableSchema?.('lit.t');
    expect(Object.keys(schema?.columns ?? {})).toEqual(['literal_col']);
  });

  it('resolves unqualified names through a transaction-local search_path', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query('CREATE SCHEMA app_one');
    await db.query('CREATE SCHEMA app_two');
    await db.query('CREATE TABLE app_one.customers (one_only integer)');
    await db.query('CREATE TABLE app_two.customers (two_only integer)');

    await db.transaction?.(async (tx) => {
      await tx.query('SET LOCAL search_path TO app_one');
      expect(await tx.tableExists('customers')).toBe(true);
      expect(
        Object.keys((await tx.getTableSchema?.('customers'))?.columns ?? {}),
      ).toEqual(['one_only']);
    });
    await db.transaction?.(async (tx) => {
      await tx.query('SET LOCAL search_path TO app_two');
      expect(await tx.tableExists('customers')).toBe(true);
      expect(
        Object.keys((await tx.getTableSchema?.('customers'))?.columns ?? {}),
      ).toEqual(['two_only']);
    });

    // Outside the transaction the default search_path is unchanged.
    expect(await db.tableExists('customers')).toBe(false);
    expect(await db.getTableSchema?.('customers')).toBeNull();
  });

  it('rejects an unsafe qualified name', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await expect(db.getTableSchema?.('a.b.c')).rejects.toThrow(/Invalid table/);
    await expect(db.getTableSchema?.('a.b; drop')).rejects.toThrow(
      /Invalid table/,
    );
  });

  it('is available on a transaction handle and sees uncommitted tables', async () => {
    const db = await track(await getDatabase({ type: 'pglite' }));
    await db.query('CREATE SCHEMA scoped');
    await db.transaction?.(async (tx) => {
      await tx.query(ddl('scoped'));
      expect(await tx.tableExists('scoped.items')).toBe(true);
      const schema = await tx.getTableSchema?.('scoped.items');
      expect(schema?.columns.stored_total.generated).toBe(true);
    });
  });
});

describe('DuckDB getTableSchema', () => {
  const ddl = `CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    qty INTEGER NOT NULL,
    "generated always as" INTEGER DEFAULT 5,
    virtual_total INTEGER GENERATED ALWAYS AS (qty * 3) VIRTUAL,
    short_total INTEGER AS (qty + 1)
  )`;

  it('flags virtual generated columns and lists them', async () => {
    const db = await track(
      await getDatabase({ type: 'duckdb', url: ':memory:' }),
    );
    await db.query(ddl);
    const schema = await db.getTableSchema?.('items');
    expect(Object.keys(schema?.columns ?? {})).toContain('virtual_total');
    expect(schema?.columns.virtual_total).toMatchObject({
      generated: true,
      hidden: false,
    });
    expect(schema?.columns.short_total.generated).toBe(true);
    expect(schema?.columns['generated always as'].generated).toBe(false);
    await ordinaryColumnsUnchanged(db, 'items');
  });

  it('is available on a transaction handle', async () => {
    const db = await track(
      await getDatabase({ type: 'duckdb', url: ':memory:' }),
    );
    await db.transaction?.(async (tx) => {
      await tx.query(ddl);
      const schema = await tx.getTableSchema?.('items');
      expect(schema?.columns.virtual_total.generated).toBe(true);
    });
  });

  it('parseGeneratedColumns ignores quoted text and nested commas', () => {
    expect([
      ...parseGeneratedColumns(
        `CREATE TABLE t(a INTEGER, "b,c" INTEGER GENERATED ALWAYS AS(coalesce(a, 0)), d VARCHAR DEFAULT('x generated always as y'), CHECK (a > 0));`,
      ),
    ]).toEqual(['b,c']);
  });
});

/**
 * Needs a real PostgreSQL server (the repository's `SQLOO_*` settings, as in
 * postgres-schema-metadata.spec.ts); skipped when none answers.
 */
describe('PostgreSQL getTableSchema', () => {
  const options = () => ({
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    max: 1,
    dbid: randomUUID(),
  });

  it('reports generated columns and resolves schema-qualified names', async () => {
    let db: Awaited<ReturnType<typeof getDatabase>>;
    try {
      db = await getDatabase(options());
      await db.execute`SELECT 1`;
    } catch {
      return;
    }
    const schemaName = `introspect_${randomUUID().replaceAll('-', '')}`;
    try {
      await db.client.query(`CREATE SCHEMA ${schemaName}`);
      await db.client.query(
        `CREATE TABLE ${schemaName}.items (id integer PRIMARY KEY, qty integer, total integer GENERATED ALWAYS AS (qty * 2) STORED)`,
      );
      expect(await db.tableExists(`${schemaName}.items`)).toBe(true);
      const schema = await db.getTableSchema?.(`${schemaName}.items`);
      expect(schema?.columns.total.generated).toBe(true);
      expect(schema?.columns.qty.generated).toBe(false);
      await db.transaction?.(async (tx) => {
        const inTx = await tx.getTableSchema?.(`${schemaName}.items`);
        expect(inTx?.columns.total.generated).toBe(true);
      });
    } finally {
      await db.client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      await db.client.end();
    }
  });
});
