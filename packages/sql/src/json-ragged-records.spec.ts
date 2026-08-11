import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';

/**
 * A JSON data file whose records have different key sets - i.e. any file with
 * an optional field - is normal input. Before issue #1132 the loader derived
 * its column list from the first record alone, so a later record missing a key
 * bound `undefined` (DuckDB rejected the statement, losing every row) and a
 * later record with an extra key had that column silently dropped.
 */
describe('JSON adapter ragged data files (Issue #1132)', () => {
  let testDataDir: string;

  const ITEMS_DDL =
    'CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, note TEXT)';

  /**
   * createTableFromSchema() parses the `schemas` option DDL line by line and
   * needs the closing parenthesis on its own line, so that path gets the
   * multi-line form. A .schema.sql file is executed verbatim and does not.
   */
  const ITEMS_DDL_MULTILINE = `CREATE TABLE items (
    id TEXT PRIMARY KEY,
    name TEXT,
    note TEXT
  )`;

  /** Second record omits the optional `note` field entirely */
  const MISSING_KEY_RECORDS = [
    { id: 'a', name: 'first', note: 'has note' },
    { id: 'b', name: 'second' },
  ];

  /** First record omits `note`, so it is absent from the first-record key set */
  const EXTRA_KEY_RECORDS = [
    { id: 'a', name: 'first' },
    { id: 'b', name: 'second', note: 'appears late' },
  ];

  const writeData = (table: string, records: unknown[]) =>
    writeFileSync(join(testDataDir, `${table}.json`), JSON.stringify(records));

  const writeSchema = (table: string, ddl: string) =>
    writeFileSync(join(testDataDir, `${table}.schema.sql`), `${ddl};`);

  // loadJSONData logs `console.error('...Failed to load data for <table>...', err)`.
  // Assert on the load-failure message (not just the table name) so the check
  // can't be satisfied by some other console.error that happens to name it.
  const loggedLoadFailure = (
    spy: ReturnType<typeof vi.spyOn>,
    table: string,
  ): boolean =>
    spy.mock.calls.some((call) => {
      const first = String(call[0]);
      return first.includes(table) && first.includes('the table will be empty');
    });

  beforeEach(() => {
    testDataDir = mkdtempSync(join(tmpdir(), 'json-ragged-'));
  });

  afterEach(async () => {
    await clearConnectionCache();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('records missing an optional field', () => {
    it('loads every row via a .schema.sql file, binding NULL for the missing key', async () => {
      writeData('items', MISSING_KEY_RECORDS);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads every row via an explicitly provided schema', async () => {
      writeData('items', MISSING_KEY_RECORDS);

      const db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas: { items: { tableName: 'items', ddl: ITEMS_DDL_MULTILINE } },
      });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads every row via deferred loading through syncSchema()', async () => {
      writeData('items', MISSING_KEY_RECORDS);

      const db = await getDatabase({
        type: 'json',
        url: testDataDir,
        eagerLoadTables: false,
      });
      await db.syncSchema(`${ITEMS_DDL};`);
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads every row via deferred loading through execute() DDL', async () => {
      writeData('items', MISSING_KEY_RECORDS);

      const db = await getDatabase({
        type: 'json',
        url: testDataDir,
        eagerLoadTables: false,
      });
      await db.execute`CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, note TEXT)`;
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads a file where no record has the optional field', async () => {
      writeData('items', [
        { id: 'a', name: 'first' },
        { id: 'b', name: 'second' },
      ]);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: null },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads a large file where a single record omits the field', async () => {
      const records = Array.from({ length: 500 }, (_, i) => ({
        id: `id-${i}`,
        name: `name-${i}`,
        ...(i === 384 ? {} : { note: `note-${i}` }),
      }));
      writeData('items', records);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(500);
      expect(await db.get('items', { id: 'id-384' })).toEqual({
        id: 'id-384',
        name: 'name-384',
        note: null,
      });
    });
  });

  describe('records with a field the first record lacks', () => {
    it('preserves a column that only later records carry', async () => {
      writeData('items', EXTRA_KEY_RECORDS);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: null },
        { id: 'b', name: 'second', note: 'appears late' },
      ]);
    });
  });

  describe('inferred schemas', () => {
    it('loads a ragged file when no schema file is present', async () => {
      writeData('items', MISSING_KEY_RECORDS);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads a ragged file through inferSchemaFromJSON()', async () => {
      writeData('items', MISSING_KEY_RECORDS);

      const db: any = await getDatabase({
        type: 'json',
        url: testDataDir,
        eagerLoadTables: false,
      });
      await db.inferSchemaFromJSON('items');
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });
  });

  describe('non-object array elements', () => {
    it('skips a null hole in the array without emitting a phantom row', async () => {
      writeData('items', [{ id: 'a', name: 'first', note: 'x' }, null]);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([{ id: 'a', name: 'first', note: 'x' }]);
    });

    it('does not let a null hole abort the load under a PRIMARY KEY', async () => {
      // A phantom all-NULL row would violate the PK and lose the valid row too
      writeData('items', [null, { id: 'a', name: 'first' }, null]);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(1);
      expect(await db.get('items', { id: 'a' })).toEqual({
        id: 'a',
        name: 'first',
        note: null,
      });
    });
  });

  // Written as raw JSON so the on-disk keys keep their exact casing without
  // tripping the camelCase lint on object literals
  const writeRawData = (table: string, json: string) =>
    writeFileSync(join(testDataDir, `${table}.json`), json);

  describe('case-insensitive column matching', () => {
    it('matches JSON keys to columns regardless of case', async () => {
      writeRawData(
        'items',
        '[{"ID":"a","Name":"first","NOTE":"has note"},{"ID":"b","Name":"second"}]',
      );
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('does not emit a duplicate column when two keys fold to one column', async () => {
      // `id` and `ID` both resolve to column `id`; the load must not build
      // `INSERT INTO items ("id", "name", "id")`
      writeRawData(
        'items',
        '[{"id":"a","name":"first"},{"id":"b","name":"second","ID":"b-again"}]',
      );
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: null },
        { id: 'b', name: 'second', note: null },
      ]);
    });

    it('loads when the data file name casing differs from the table identifier', async () => {
      // Data file `Items.json` backs a table created as lowercase `items`.
      // DuckDB addresses it case-insensitively, so the column lookup must too -
      // otherwise every field reads as unmatched and the table loads empty.
      writeData('Items', MISSING_KEY_RECORDS);
      writeFileSync(
        join(testDataDir, 'Items.schema.sql'),
        'CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, note TEXT);',
      );

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
    });
  });

  describe('fields with no matching column', () => {
    it('loads the matching columns and skips the unmatched field', async () => {
      writeData('items', [
        { id: 'a', name: 'first', stray: 'no such column' },
        { id: 'b', name: 'second', note: 'has note' },
      ]);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });
      const rows = await db.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: null },
        { id: 'b', name: 'second', note: 'has note' },
      ]);
    });

    it('leaves the table empty and logs when no field matches any column', async () => {
      writeData('items', [{ nope: 1 }, { neither: 2 }]);
      writeSchema('items', ITEMS_DDL);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(0);
      expect(loggedLoadFailure(errorSpy, 'items')).toBe(true);
      errorSpy.mockRestore();
    });

    it('warns and leaves the table empty when records have no fields', async () => {
      // All records are objects but empty - hits the "no fields" branch
      writeData('items', [{}, {}]);
      writeSchema('items', ITEMS_DDL);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(0);
      expect(
        warnSpy.mock.calls.some((call) =>
          String(call[0]).includes('no fields'),
        ),
      ).toBe(true);
      warnSpy.mockRestore();
      await db.insert('items', { id: 'a', name: 'first', note: null });
      expect(await db.count('items')).toBe(1);
    });

    it('leaves the table empty and usable when the array has no objects', async () => {
      writeData('items', [null, 42, 'nope']);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(0);
      await db.insert('items', { id: 'a', name: 'first', note: null });
      expect(await db.count('items')).toBe(1);
    });

    it('skips a record whose keys are all unmatched without losing valid rows', async () => {
      // The second record shares no column with the table; it must not emit an
      // all-NULL row that violates the PRIMARY KEY and fails the whole load
      writeData('items', [
        { id: 'a', name: 'first' },
        { onlyjunk: 'x', morejunk: 'y' },
      ]);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(1);
      expect(await db.get('items', { id: 'a' })).toEqual({
        id: 'a',
        name: 'first',
        note: null,
      });
    });
  });

  describe('a single bad table does not abort its siblings', () => {
    it('loads a healthy table even when another table in the dir cannot load', async () => {
      // `bad` violates NOT NULL; `good` sits alongside it and must still load
      writeData('bad', [{ id: 'x', name: 'has name' }, { id: 'y' }]);
      writeSchema(
        'bad',
        'CREATE TABLE bad (id TEXT PRIMARY KEY, name TEXT NOT NULL)',
      );
      writeData('good', MISSING_KEY_RECORDS);
      writeSchema(
        'good',
        'CREATE TABLE good (id TEXT PRIMARY KEY, name TEXT, note TEXT)',
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const db = await getDatabase({ type: 'json', url: testDataDir });

      // The healthy sibling loaded in full
      const good = await db.many`SELECT * FROM good ORDER BY id`;
      expect(good).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
      ]);
      // The failure was surfaced loudly, not silently swallowed
      expect(loggedLoadFailure(errorSpy, 'bad')).toBe(true);
      // ...and the log carries the underlying cause, not just a generic wrapper
      const badCall = errorSpy.mock.calls.find((call) =>
        String(call[0]).includes('bad'),
      );
      const loggedError = badCall?.[1] as {
        context?: { originalError?: string };
      };
      expect(loggedError?.context?.originalError).toMatch(/NOT NULL/i);
      errorSpy.mockRestore();
    });

    it('still tolerates a malformed data file, leaving the table usable', async () => {
      writeFileSync(join(testDataDir, 'items.json'), '{ not valid json');
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({ type: 'json', url: testDataDir });

      expect(await db.count('items')).toBe(0);
      await db.insert('items', { id: 'a', name: 'first', note: null });
      expect(await db.count('items')).toBe(1);
    });
  });

  describe('round trip', () => {
    it('exports and reloads a table that was loaded from a ragged file', async () => {
      writeData('items', MISSING_KEY_RECORDS);
      writeSchema('items', ITEMS_DDL);

      const db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
      });
      await db.insert('items', { id: 'c', name: 'third', note: null });

      await clearConnectionCache();

      const reopened = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
      });
      const rows = await reopened.many`SELECT * FROM items ORDER BY id`;

      expect(rows).toEqual([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second', note: null },
        { id: 'c', name: 'third', note: null },
      ]);
    });
  });
});
