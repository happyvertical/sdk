import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * 0.115 compatibility: getTableSchema() with no options lists the same columns
 * in the same order with no generated/hidden keys, and accepts any legal table
 * name (introspection never interpolates the name), inside and outside a
 * transaction.
 */

const open: DatabaseInterface[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
});

const OPT = { includeGenerated: true, includeHidden: true } as const;
const WEIRD = 'Mixed "Table x';
const q = (name: string) => `"${name.replaceAll('"', '""')}"`;

describe('SQLite getTableSchema defaults', () => {
  it('omits generated and hidden columns unless opted in', async () => {
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
    open.push(db);
    await db.query(
      `CREATE TABLE items (id INTEGER PRIMARY KEY, qty INTEGER NOT NULL,
       dbl INTEGER GENERATED ALWAYS AS (qty * 2) STORED,
       tri INTEGER GENERATED ALWAYS AS (qty * 3) VIRTUAL)`,
    );
    await db.query('CREATE VIRTUAL TABLE docs USING fts5(body)');

    const def = await db.getTableSchema?.('items');
    expect(Object.keys(def?.columns ?? {})).toEqual(['id', 'qty']);
    expect(def?.columns.qty).toEqual({
      type: 'INTEGER',
      primaryKey: false,
      notNull: true,
      defaultValue: null,
    });
    expect(
      Object.keys((await db.getTableSchema?.('docs'))?.columns ?? {}),
    ).toEqual(['body']);

    const gen = await db.getTableSchema?.('items', { includeGenerated: true });
    expect(Object.keys(gen?.columns ?? {})).toEqual([
      'id',
      'qty',
      'dbl',
      'tri',
    ]);
    expect(gen?.columns.dbl).toMatchObject({ generated: true, hidden: false });

    const hid = await db.getTableSchema?.('docs', { includeHidden: true });
    expect(hid?.columns.rank).toMatchObject({ hidden: true });
    const all = await db.getTableSchema?.('items', OPT);
    expect(all?.columns.id).toMatchObject({ generated: false, hidden: false });
  });

  it('accepts quoted, spaced and mixed-case names in and out of a transaction', async () => {
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
    open.push(db);
    await db.query(`CREATE TABLE ${q(WEIRD)} (id INTEGER PRIMARY KEY)`);
    expect(await db.tableExists(WEIRD)).toBe(true);
    expect(
      Object.keys((await db.getTableSchema?.(WEIRD))?.columns ?? {}),
    ).toEqual(['id']);
    await db.transaction?.(async (tx) => {
      expect(await tx.tableExists(WEIRD)).toBe(true);
      expect((await tx.getTableSchema?.(WEIRD))?.tableName).toBe(WEIRD);
      expect(await tx.getTableSchema?.('No "Such')).toBeNull();
    });
  });
});

describe('PGlite getTableSchema defaults', () => {
  it('keeps 0.115 columns and adds flags only when opted in', async () => {
    const db = await getDatabase({ type: 'pglite' });
    open.push(db);
    await db.query(
      `CREATE TABLE items (id integer PRIMARY KEY, qty integer NOT NULL,
       dbl integer GENERATED ALWAYS AS (qty * 2) STORED)`,
    );
    const def = await db.getTableSchema?.('items');
    expect(Object.keys(def?.columns ?? {})).toEqual(['id', 'qty', 'dbl']);
    expect('generated' in (def?.columns.dbl ?? {})).toBe(false);
    expect('hidden' in (def?.columns.dbl ?? {})).toBe(false);
    const opt = await db.getTableSchema?.('items', OPT);
    expect(opt?.columns.dbl).toMatchObject({ generated: true, hidden: false });
    expect(opt?.columns.qty).toMatchObject({ generated: false, hidden: false });
  });

  it('accepts quoted, spaced and mixed-case names in and out of a transaction', async () => {
    const db = await getDatabase({ type: 'pglite' });
    open.push(db);
    await db.query(`CREATE TABLE ${q(WEIRD)} (id integer PRIMARY KEY)`);
    await db.query(`CREATE TABLE ${q('i2537_quoted_child_"q"')} (id integer)`);
    expect(await db.tableExists(WEIRD)).toBe(true);
    expect((await db.getTableSchema?.(WEIRD))?.tableName).toBe(WEIRD);
    await db.transaction?.(async (tx) => {
      expect(await tx.tableExists(WEIRD)).toBe(true);
      const schema = await tx.getTableSchema?.(WEIRD);
      expect(Object.keys(schema?.columns ?? {})).toEqual(['id']);
      expect(
        (await tx.getTableSchema?.('i2537_quoted_child_"q"'))?.tableName,
      ).toBe('i2537_quoted_child_"q"');
      expect(await tx.getTableSchema?.('No "Such')).toBeNull();
    });
  });
});

describe('DuckDB tableExists names', () => {
  it('accepts a quoted name and does not execute a injected statement', async () => {
    const db = await getDatabase({ type: 'duckdb', url: ':memory:' });
    open.push(db);
    await db.query(`CREATE TABLE ${q(WEIRD)} (id INTEGER)`);
    expect(await db.tableExists(WEIRD)).toBe(true);
    expect(await db.tableExists('t; DROP TABLE x')).toBe(false);
    expect((await db.getTableSchema?.(WEIRD))?.tableName).toBe(WEIRD);
  });
});
