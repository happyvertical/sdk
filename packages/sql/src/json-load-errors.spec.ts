import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONTableLoadError } from './index';
import { clearConnectionCache, getDatabase } from './index';

/**
 * A JSON data file that parses but cannot be inserted (a renamed/dropped
 * column, a NOT NULL / PRIMARY KEY violation, or a file whose fields match no
 * column) leaves its table created-but-empty and only logs to stderr. Issue
 * #1139 makes those failures observable to calling code via a `getTableLoadErrors()`
 * accessor and an `onTableLoadError` callback.
 */
describe('JSON adapter observable data-load errors (Issue #1139)', () => {
  let dir: string;

  const ITEMS_DDL =
    'CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, note TEXT)';
  const NOT_NULL_DDL =
    'CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)';

  const writeData = (table: string, records: unknown[]) =>
    writeFileSync(join(dir, `${table}.json`), JSON.stringify(records));
  const writeSchema = (table: string, ddl: string) =>
    writeFileSync(join(dir, `${table}.schema.sql`), `${ddl};`);

  // A record that omits the NOT NULL `name` makes the whole INSERT fail
  const raggedNotNull = [{ id: 'a', name: 'first' }, { id: 'b' }];

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'json-load-errors-'));
    // Silence the stderr diagnostic these tests deliberately trigger
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    errorSpy.mockRestore();
    await clearConnectionCache();
    rmSync(dir, { recursive: true, force: true });
  });

  const open = (extra: Record<string, unknown> = {}): Promise<any> =>
    getDatabase({ type: 'json', url: dir, ...extra });

  describe('getTableLoadErrors()', () => {
    it('reports a table whose data could not be loaded', async () => {
      writeData('items', raggedNotNull);
      writeSchema('items', NOT_NULL_DDL);

      const db = await open();
      const errors = db.getTableLoadErrors();

      expect(errors).toHaveLength(1);
      expect(errors[0].table).toBe('items');
      expect(errors[0].filePath).toBe(join(dir, 'items.json'));
      // The underlying engine cause is carried, not just a wrapper message
      expect(errors[0].error?.context?.originalError).toMatch(/NOT NULL/i);
    });

    it('is empty when every table loads successfully', async () => {
      writeData('items', [
        { id: 'a', name: 'first', note: 'x' },
        { id: 'b', name: 'second' },
      ]);
      writeSchema('items', ITEMS_DDL);

      const db = await open();

      expect(db.getTableLoadErrors()).toEqual([]);
    });

    it('reports a file whose fields match no column', async () => {
      writeData('items', [{ nope: 1 }, { neither: 2 }]);
      writeSchema('items', ITEMS_DDL);

      const db = await open();
      const errors = db.getTableLoadErrors();

      expect(errors).toHaveLength(1);
      expect(errors[0].table).toBe('items');
      expect(errors[0].error?.message).toMatch(/match a column/);
    });

    it('reports the bad table without losing a healthy sibling', async () => {
      writeData('bad', raggedNotNull);
      writeSchema(
        'bad',
        'CREATE TABLE bad (id TEXT PRIMARY KEY, name TEXT NOT NULL)',
      );
      writeData('good', [{ id: 'a', name: 'first', note: 'y' }]);
      writeSchema(
        'good',
        'CREATE TABLE good (id TEXT PRIMARY KEY, name TEXT, note TEXT)',
      );

      const db = await open();

      expect(
        db.getTableLoadErrors().map((e: JSONTableLoadError) => e.table),
      ).toEqual(['bad']);
      // The healthy sibling still loaded in full
      expect(await db.count('good')).toBe(1);
    });

    it('returns a fresh array each call so callers cannot mutate adapter state', async () => {
      writeData('items', raggedNotNull);
      writeSchema('items', NOT_NULL_DDL);

      const db = await open();
      const first = db.getTableLoadErrors();
      first.push({ table: 'injected', filePath: 'x', error: null });

      expect(db.getTableLoadErrors()).toHaveLength(1);
      expect(db.getTableLoadErrors()).not.toBe(first);
    });

    it('does not surface a malformed (unparseable) file as a load error', async () => {
      // A file that cannot even be parsed is tolerated as "no data", distinct
      // from a parsed file whose records fail to insert
      writeFileSync(join(dir, 'items.json'), '{ not valid json');
      writeSchema('items', ITEMS_DDL);

      const db = await open();

      expect(db.getTableLoadErrors()).toEqual([]);
      expect(await db.count('items')).toBe(0);
    });
  });

  describe('deferred loads accumulate into the same accessor', () => {
    it('reports a failure that only happens during syncSchema()', async () => {
      writeData('items', raggedNotNull);

      const db = await open({ eagerLoadTables: false });
      // Nothing has loaded yet - the table is deferred
      expect(db.getTableLoadErrors()).toEqual([]);

      await db.syncSchema(`${NOT_NULL_DDL};`);

      expect(
        db.getTableLoadErrors().map((e: JSONTableLoadError) => e.table),
      ).toEqual(['items']);
    });

    it('reports a failure that only happens during execute() DDL', async () => {
      writeData('items', raggedNotNull);

      const db = await open({ eagerLoadTables: false });
      await db.execute`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL)`;

      expect(
        db.getTableLoadErrors().map((e: JSONTableLoadError) => e.table),
      ).toEqual(['items']);
    });
  });

  describe('onTableLoadError callback', () => {
    it('fires with the same info for a connection-time failure', async () => {
      writeData('items', raggedNotNull);
      writeSchema('items', NOT_NULL_DDL);
      const seen: JSONTableLoadError[] = [];

      const db = await open({ onTableLoadError: (info) => seen.push(info) });

      expect(seen).toHaveLength(1);
      expect(seen[0].table).toBe('items');
      expect(seen[0].filePath).toBe(join(dir, 'items.json'));
      // The callback and the accessor report the same failures
      expect(seen).toEqual(db.getTableLoadErrors());
    });

    it('fires for a deferred syncSchema() failure', async () => {
      writeData('items', raggedNotNull);
      const seen: string[] = [];

      const db = await open({
        eagerLoadTables: false,
        onTableLoadError: (info) => seen.push(info.table),
      });
      expect(seen).toEqual([]);

      await db.syncSchema(`${NOT_NULL_DDL};`);

      expect(seen).toEqual(['items']);
    });

    it('does not fire when loads succeed', async () => {
      writeData('items', [{ id: 'a', name: 'first', note: 'x' }]);
      writeSchema('items', ITEMS_DDL);
      const seen: JSONTableLoadError[] = [];

      await open({ onTableLoadError: (info) => seen.push(info) });

      expect(seen).toEqual([]);
    });

    it('a throwing callback does not break loading of the remaining tables', async () => {
      writeData('bad', raggedNotNull);
      writeSchema(
        'bad',
        'CREATE TABLE bad (id TEXT PRIMARY KEY, name TEXT NOT NULL)',
      );
      writeData('good', [{ id: 'a', name: 'first', note: 'y' }]);
      writeSchema(
        'good',
        'CREATE TABLE good (id TEXT PRIMARY KEY, name TEXT, note TEXT)',
      );

      const db = await open({
        onTableLoadError: () => {
          throw new Error('callback boom');
        },
      });

      // Loading continued despite the callback throwing: good is intact and the
      // failure is still recorded
      expect(await db.count('good')).toBe(1);
      expect(
        db.getTableLoadErrors().map((e: JSONTableLoadError) => e.table),
      ).toEqual(['bad']);
    });
  });

  describe('connection caching', () => {
    it('shares getTableLoadErrors() but does not re-wire a later callback', async () => {
      writeData('items', raggedNotNull);

      // First open creates the connection (no callback, deferred load)
      const db1 = await open({ eagerLoadTables: false });
      // Second open for the same URL is a cache hit - the same object
      const late: JSONTableLoadError[] = [];
      const db2 = await open({
        eagerLoadTables: false,
        onTableLoadError: (info) => late.push(info),
      });
      expect(db2).toBe(db1);

      // Trigger the deferred load failure through the shared connection
      await db2.syncSchema(`${NOT_NULL_DDL};`);

      // The late caller's callback is NOT registered (connection was cached)...
      expect(late).toEqual([]);
      // ...but the shared accessor still reflects the failure
      expect(
        db2.getTableLoadErrors().map((e: JSONTableLoadError) => e.table),
      ).toEqual(['items']);
    });
  });

  describe('scope: schema-less eager loads are out of scope', () => {
    it('does not report an eager inferred-schema load that fails to create the table', async () => {
      // A schema-less file with duplicate keys cannot be inferred by DuckDB, so
      // the table is never created. That is NOT the silent present-but-empty
      // case this feature targets - a query against the missing table throws, so
      // the failure is already observable. It is deliberately not reported here.
      writeFileSync(join(dir, 'dup.json'), '[{"id": 1, "id": 2}]');

      const db = await open();

      expect(db.getTableLoadErrors()).toEqual([]);
      // The failure surfaces the other way: the table does not exist
      await expect(db.query('SELECT * FROM dup')).rejects.toThrow();
    });
  });
});
