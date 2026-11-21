/**
 * getTableSchema() on the JSON adapter (#1566).
 *
 * The JSON adapter replays each `<table>.schema.sql` into DuckDB on open, so
 * an existing directory's live column definitions can be described the same
 * way the native DuckDB adapter describes its tables. Callers such as smrt
 * core's schema differ compare that description with declared columns, which
 * is how a legacy 4-byte FLOAT column is told apart from a declared DOUBLE.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

const LEGACY_DDL = `CREATE TABLE readings (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'none',
  amount REAL,
  precise DOUBLE,
  count INTEGER NOT NULL DEFAULT 0
)`;

describe('JSON adapter getTableSchema (#1566)', () => {
  let dataDir: string;
  let db: DatabaseInterface | undefined;
  let native: DatabaseInterface | undefined;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sql-json-describe-'));
  });

  afterEach(async () => {
    await native?.close?.();
    native = undefined;
    db = undefined;
    await clearConnectionCache();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const openExistingDirectory = async (): Promise<DatabaseInterface> => {
    writeFileSync(join(dataDir, 'readings.schema.sql'), LEGACY_DDL);
    writeFileSync(
      join(dataDir, 'readings.json'),
      JSON.stringify([
        { id: 'r1', label: 'a', amount: 1.5, precise: 2.25, count: 3 },
      ]),
    );
    db = await getDatabase({ type: 'json', url: dataDir });
    return db;
  };

  it('describes a table replayed from an existing directory', async () => {
    const json = await openExistingDirectory();

    expect(typeof json.getTableSchema).toBe('function');
    const schema = await json.getTableSchema?.('readings');

    expect(schema?.tableName).toBe('readings');
    expect(Object.keys(schema?.columns ?? {})).toEqual([
      'id',
      'label',
      'amount',
      'precise',
      'count',
    ]);
    // The legacy REAL column reads back as DuckDB's 4-byte FLOAT, which is
    // what lets a differ see drift against a declared DOUBLE.
    expect(schema?.columns.amount.type).toBe('FLOAT');
    expect(schema?.columns.precise.type).toBe('DOUBLE');
    expect(schema?.columns.id.primaryKey).toBe(true);
    expect(schema?.columns.label.notNull).toBe(true);
    expect(schema?.columns.amount.notNull).toBe(false);
    expect(schema?.columns.count.defaultValue).toBe('0');
  });

  it('returns the same shape as the native DuckDB adapter', async () => {
    const json = await openExistingDirectory();
    native = await getDatabase({ type: 'duckdb', url: ':memory:' });
    await native.query(LEGACY_DDL);

    const fromJson = await json.getTableSchema?.('readings');
    const fromNative = await native.getTableSchema?.('readings');

    expect(fromJson).toEqual(fromNative);
    expect(
      await json.getTableSchema?.('readings', { includeGenerated: true }),
    ).toEqual(
      await native.getTableSchema?.('readings', { includeGenerated: true }),
    );
  });

  it('omits the introspection flags unless asked, then reports them', async () => {
    const json = await openExistingDirectory();

    const plain = await json.getTableSchema?.('readings');
    expect(plain?.columns.amount).not.toHaveProperty('generated');
    expect(plain?.columns.amount).not.toHaveProperty('hidden');

    const flagged = await json.getTableSchema?.('readings', {
      includeHidden: true,
    });
    expect(flagged?.columns.amount).toMatchObject({
      generated: false,
      hidden: false,
    });
  });

  it('describes a table created through syncSchema in a new directory', async () => {
    db = await getDatabase({ type: 'json', url: dataDir });
    await db.syncSchema(
      `CREATE TABLE items (id TEXT PRIMARY KEY, price DOUBLE NOT NULL)`,
    );

    const schema = await db.getTableSchema?.('items');
    expect(schema?.columns.price).toMatchObject({
      type: 'DOUBLE',
      notNull: true,
      primaryKey: false,
    });
  });

  it('returns null for a table that does not exist', async () => {
    const json = await openExistingDirectory();
    expect(await json.getTableSchema?.('missing')).toBeNull();
  });

  it('rejects a value that cannot be a table name', async () => {
    const json = await openExistingDirectory();
    await expect(json.getTableSchema?.('')).rejects.toThrow();
  });

  it('is not added to transaction handles', async () => {
    // A JSON transaction handle carries no JSON-only marker, and smrt core
    // reads getTableSchema on a handle without one as the native DuckDB
    // adapter, whose raw writes are durable. Keeping it off the handle keeps
    // that identification correct.
    const json = await openExistingDirectory();
    await json.transaction?.(async (tx) => {
      expect(tx.getTableSchema).toBeUndefined();
    });
  });
});
