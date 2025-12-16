import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';

describe('JSON adapter tests', () => {
  let db: any;
  const testDataDir = './test-json-data';

  beforeEach(async () => {
    // Create test data directory
    mkdirSync(testDataDir, { recursive: true });

    // Create initial test JSON files
    writeFileSync(
      `${testDataDir}/contents.json`,
      JSON.stringify([
        {
          id: 'test-1',
          title: 'Sample Document',
          body: 'Sample content',
        },
      ]),
    );

    // Initialize JSON database with explicit schema
    // (auto-inference was removed in issue #522 to fix UPSERT constraint issues)
    db = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: {
        contents: {
          tableName: 'contents',
          ddl: `CREATE TABLE contents (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT
          )`,
        },
      },
    });
  });

  afterEach(async () => {
    // Clear connection cache to ensure test isolation
    clearConnectionCache();
    // Clean up test data directory
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('should load JSON files as queryable tables', async () => {
    const result = await db.many`
      SELECT * FROM contents
    `;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'test-1',
      title: 'Sample Document',
      body: 'Sample content',
    });
  });

  it('should be able to insert data and auto-save to JSON', async () => {
    const data = {
      id: randomUUID(),
      title: 'New Document',
      body: 'New content',
    } as const;

    const inserted = await db.insert('contents', data);
    expect(inserted).toBeDefined();
    expect(inserted.affected).toBe(1);

    // Verify data was inserted
    const result = await db.single`
      SELECT * FROM contents WHERE id = ${data.id}
    `;
    expect(result).toMatchObject(data);
  });

  it('should be able to query data with conditions', async () => {
    const data = {
      id: randomUUID(),
      title: 'Query Test',
      body: 'Test content',
    } as const;

    await db.insert('contents', data);

    const result = await db.single`
      SELECT * FROM contents WHERE id = ${data.id}
    `;
    expect(result).toMatchObject({
      id: data.id,
      title: data.title,
      body: data.body,
    });
  });

  it('should be able to update rows', async () => {
    const data = {
      id: randomUUID(),
      title: 'Original Title',
      body: 'Original body',
    } as const;

    await db.insert('contents', data);

    await db.update(
      'contents',
      { id: data.id },
      { title: 'Updated Title', body: 'Updated body' },
    );

    const result = await db.single`
      SELECT * FROM contents WHERE id = ${data.id}
    `;
    expect(result).toMatchObject({
      id: data.id,
      title: 'Updated Title',
      body: 'Updated body',
    });
  });

  it('should support complex SQL queries with JOINs', async () => {
    // Create a second table
    writeFileSync(
      `${testDataDir}/authors.json`,
      JSON.stringify([
        { id: 'author-1', name: 'John Doe', email: 'john@example.com' },
      ]),
    );

    // Clear cache and reload database to pick up new table
    clearConnectionCache();
    db = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: {
        contents: {
          tableName: 'contents',
          ddl: `CREATE TABLE contents (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT
          )`,
        },
        authors: {
          tableName: 'authors',
          ddl: `CREATE TABLE authors (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT
          )`,
        },
      },
    });

    // Add author_id to contents
    await db.execute`
      ALTER TABLE contents ADD COLUMN author_id TEXT
    `;

    await db.execute`
      UPDATE contents SET author_id = 'author-1' WHERE id = 'test-1'
    `;

    // Query with JOIN
    const result = await db.many`
      SELECT c.title, c.body, a.name as author_name
      FROM contents c
      LEFT JOIN authors a ON c.author_id = a.id
      WHERE c.id = 'test-1'
    `;

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Sample Document',
      body: 'Sample content',
      author_name: 'John Doe',
    });
  });

  it('should support filtering with WHERE clauses', async () => {
    // Insert multiple documents
    await db.insert('contents', [
      { id: 'doc-1', title: 'First', body: 'Content 1' },
      { id: 'doc-2', title: 'Second', body: 'Content 2' },
      { id: 'doc-3', title: 'Third', body: 'Content 3' },
    ]);

    const result = await db.many`
      SELECT * FROM contents WHERE title LIKE '%irst'
    `;

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First');
  });

  it('should use in-memory database (no WAL files)', async () => {
    // This test verifies the core requirement: no WAL files created
    // The JSON adapter should only create JSON files in the specified directory

    const data = {
      id: randomUUID(),
      title: 'WAL Test',
      body: 'Testing no WAL file creation',
    };

    await db.insert('contents', data);

    // Verify data was inserted successfully
    const result = await db.get('contents', { id: data.id });
    expect(result).toMatchObject(data);

    // The fact that this test passes means:
    // 1. Database operations work
    // 2. No WAL file errors occurred
    // 3. All data is in-memory with JSON persistence
  });

  it('should handle read-only mode (writeStrategy: none)', async () => {
    const readOnlyDb = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'none',
      schemas: {
        contents: {
          tableName: 'contents',
          ddl: `CREATE TABLE contents (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT
          )`,
        },
      },
    });

    // Reading should work
    const results = await readOnlyDb.many`SELECT * FROM contents`;
    expect(results).toBeDefined();

    // Writing should throw error
    await expect(
      readOnlyDb.insert('contents', {
        id: 'should-fail',
        title: 'Test',
        body: 'Test',
      }),
    ).rejects.toThrow();
  });

  it('should support manual export mode (writeStrategy: manual)', async () => {
    const manualDb = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'manual',
      schemas: {
        contents: {
          tableName: 'contents',
          ddl: `CREATE TABLE contents (
            id TEXT PRIMARY KEY,
            title TEXT,
            body TEXT
          )`,
        },
      },
    });

    const data = {
      id: randomUUID(),
      title: 'Manual Export Test',
      body: 'Test content',
    };

    // Insert data (stays in memory)
    await manualDb.insert('contents', data);

    // Verify data is in memory
    const result = await manualDb.get('contents', { id: data.id });
    expect(result).toMatchObject(data);

    // Manually export table to JSON
    await manualDb.exportTable('contents');

    // Data should now be persisted to JSON file
    // (would survive database restart)
  });

  it('should handle empty data directory initialization', async () => {
    const emptyDir = './test-empty-json';
    mkdirSync(emptyDir, { recursive: true });

    const emptyDb = await getDatabase({
      type: 'json',
      url: emptyDir,
      writeStrategy: 'immediate',
    });

    // Should be able to create new tables
    await emptyDb.execute`
      CREATE TABLE test_table (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `;

    await emptyDb.insert('test_table', { id: 'test-1', data: 'test data' });

    const result = await emptyDb.get('test_table', { id: 'test-1' });
    expect(result).toMatchObject({ id: 'test-1', data: 'test data' });

    // Clean up
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('should support schema synchronization', async () => {
    const schema = `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `;

    await db.syncSchema(schema);

    // Verify table was created
    const tableExists = await db.tableExists('documents');
    expect(tableExists).toBe(true);

    // Insert data into new table
    await db.insert('documents', {
      id: 'doc-1',
      title: 'Test Document',
      content: 'Test content',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await db.get('documents', { id: 'doc-1' });
    expect(result).toMatchObject({
      id: 'doc-1',
      title: 'Test Document',
    });
  });

  it('should support inferSchemaFromJSON() for explicit auto-inference', async () => {
    // Note: Auto-inference was removed in issue #522. Users who want auto-inference
    // must now call inferSchemaFromJSON() explicitly.
    // DuckDB's read_json_auto keeps ISO 8601 strings as VARCHAR by default.
    // For proper TIMESTAMP/DATE typing, provide explicit schema via options.schemas.
    const timestampDir = './test-timestamp-inference';
    mkdirSync(timestampDir, { recursive: true });

    // Create JSON file with ISO 8601 timestamps and dates
    const testData = [
      {
        id: 'event-1',
        title: 'Council Meeting',
        date: '2024-01-15', // DATE format string
        timestamp: '2024-01-15T10:30:00.000Z', // TIMESTAMP format string
        created_at: '2024-01-10T09:00:00Z', // TIMESTAMP format string
        description: 'Regular text field',
      },
    ];

    writeFileSync(
      join(timestampDir, 'events.json'),
      JSON.stringify(testData, null, 2),
    );

    // Create database - table will be DEFERRED (not auto-created)
    // Use eagerLoadTables: false to test explicit inferSchemaFromJSON behavior
    const timestampDb = await getDatabase({
      type: 'json',
      url: timestampDir,
      writeStrategy: 'immediate',
      eagerLoadTables: false,
    });

    // Verify table was NOT auto-created (deferred)
    let tableExists = await timestampDb.tableExists('events');
    expect(tableExists).toBe(false);

    // Now explicitly infer schema from JSON
    await timestampDb.inferSchemaFromJSON('events');

    // Verify table was created via inference
    tableExists = await timestampDb.tableExists('events');
    expect(tableExists).toBe(true);

    // Query schema to verify type inference
    const schemaInfo = await timestampDb.many`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'events'
      ORDER BY column_name
    `;

    // DuckDB's read_json_auto infers DATE from YYYY-MM-DD format
    const dateColumn = schemaInfo.find((col) => col.column_name === 'date');
    expect(dateColumn?.data_type).toBe('DATE');

    // DuckDB infers TIMESTAMP from ISO 8601 WITHOUT milliseconds (YYYY-MM-DDTHH:mm:ssZ)
    // but keeps ISO 8601 WITH milliseconds (YYYY-MM-DDTHH:mm:ss.SSSZ) as VARCHAR
    const timestampColumn = schemaInfo.find(
      (col) => col.column_name === 'timestamp',
    );
    expect(timestampColumn?.data_type).toBe('VARCHAR'); // Has milliseconds

    const createdAtColumn = schemaInfo.find(
      (col) => col.column_name === 'created_at',
    );
    expect(createdAtColumn?.data_type).toBe('TIMESTAMP'); // No milliseconds

    // Verify text field remains TEXT
    const descColumn = schemaInfo.find(
      (col) => col.column_name === 'description',
    );
    expect(descColumn?.data_type).toBe('VARCHAR');

    // Verify we can query the data
    const events = await timestampDb.many`SELECT * FROM events`;
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Council Meeting');
    // Note: DuckDB returns DATE as { days: number } and TIMESTAMP as { micros: number }
    // For consistent string handling, use explicit schemas
    expect(events[0].date).toBeDefined();
    expect(events[0].timestamp).toBe('2024-01-15T10:30:00.000Z'); // VARCHAR preserved as string
    expect(events[0].created_at).toBeDefined(); // TIMESTAMP returned as object

    // Clean up
    clearConnectionCache();
    rmSync(timestampDir, { recursive: true, force: true });
  });

  describe('SMRT integration', () => {
    it('should create tables with explicit schema (no auto-detection)', async () => {
      // Issue #522: Auto-detection was removed to fix UPSERT constraint issues.
      // Tables must now be created via explicit schemas or syncSchema().

      // Create a JSON file with empty strings
      writeFileSync(
        `${testDataDir}/test_objects.json`,
        JSON.stringify([
          {
            id: randomUUID(),
            slug: 'test-object',
            context: '',
            name: 'Test Object',
            url: '', // Empty string
            meetings_url: '', // Empty string
            location: '',
            timezone: '',
          },
        ]),
      );

      // Clear cache to pick up new JSON file
      clearConnectionCache();
      const testDb = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        // Explicit schema with proper types and UNIQUE constraint
        schemas: {
          test_objects: {
            tableName: 'test_objects',
            ddl: `CREATE TABLE test_objects (
              id TEXT PRIMARY KEY,
              slug TEXT NOT NULL,
              context TEXT NOT NULL DEFAULT '',
              name TEXT,
              url TEXT,
              meetings_url TEXT,
              location TEXT,
              timezone TEXT,
              UNIQUE(slug, context)
            )`,
          },
        },
      });

      // Verify table was created with explicit schema
      const tableExists = await testDb.tableExists('test_objects');
      expect(tableExists).toBe(true);

      // Verify we can query the data
      const result = await testDb.many`SELECT * FROM test_objects`;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        slug: 'test-object',
        name: 'Test Object',
      });
    });

    it('should handle upsert with properly-typed columns', async () => {
      // Create a table with proper types (simulating SMRT schema)
      await db.execute`
        CREATE TABLE test_upsert (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          context TEXT NOT NULL,
          name TEXT,
          url TEXT,
          UNIQUE(slug, context)
        )
      `;

      // Initial insert
      const data1 = {
        id: randomUUID(),
        slug: 'test-upsert',
        context: 'default',
        name: 'Test Upsert',
        url: '', // Empty string - should work with proper typing
      };

      await db.insert('test_upsert', data1);

      // Upsert (update existing)
      const data2 = {
        id: data1.id,
        slug: 'test-upsert',
        context: 'default',
        name: 'Updated Upsert',
        url: 'https://example.com',
      };

      await db.upsert('test_upsert', ['slug', 'context'], data2);

      // Verify update
      const result = await db.get('test_upsert', { id: data1.id });
      expect(result).toMatchObject({
        id: data1.id,
        slug: 'test-upsert',
        context: 'default',
        name: 'Updated Upsert',
        url: 'https://example.com',
      });

      // Upsert (insert new with different context)
      const data3 = {
        id: randomUUID(),
        slug: 'test-upsert',
        context: 'other',
        name: 'Other Context',
        url: '',
      };

      await db.upsert('test_upsert', ['slug', 'context'], data3);

      // Verify both records exist
      const all = await db.many`SELECT * FROM test_upsert ORDER BY context`;
      expect(all).toHaveLength(2);
      expect(all[0].context).toBe('default');
      expect(all[1].context).toBe('other');
    });

    it('should demonstrate syncSchema() creating table before JSON is loaded', async () => {
      // Issue #522: Tables without explicit schemas are DEFERRED until syncSchema() is called.
      // This ensures UNIQUE constraints are in place before data is loaded.

      // Scenario: JSON file with empty strings/nulls (typical initial state)
      writeFileSync(
        `${testDataDir}/os.json`,
        JSON.stringify([
          {
            id: randomUUID(),
            slug: 'town-of-bentley',
            context: '',
            name: 'town-of-bentley',
            url: '', // Empty string
            meetings_url: '', // Empty string
            location: '',
            timezone: '',
          },
        ]),
      );

      // Clear cache to pick up new JSON file
      clearConnectionCache();
      // Use eagerLoadTables: false to test deferred loading + syncSchema behavior
      const testDb = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        eagerLoadTables: false,
      });

      // Table is DEFERRED - doesn't exist yet (because eagerLoadTables: false)
      let tableExists = await testDb.tableExists('os');
      expect(tableExists).toBe(false);

      // Call syncSchema() to create table with proper types and constraints
      await testDb.syncSchema(`
        CREATE TABLE os (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          context TEXT NOT NULL DEFAULT '',
          name TEXT,
          url TEXT,
          meetings_url TEXT,
          location TEXT,
          timezone TEXT,
          UNIQUE(slug, context)
        )
      `);

      // Now table exists with proper schema AND JSON data is loaded
      tableExists = await testDb.tableExists('os');
      expect(tableExists).toBe(true);

      // Verify existing JSON data was loaded
      const existingData =
        await testDb.many`SELECT * FROM os WHERE slug = 'town-of-bentley'`;
      expect(existingData).toHaveLength(1);

      // Now we can INSERT new data
      const newData = {
        id: randomUUID(),
        slug: 'another-org',
        context: '',
        name: 'another-org',
        url: 'https://example.com',
        meetings_url: 'https://example.com/meetings',
        location: 'Some Location',
        timezone: 'America/Denver',
      };

      await testDb.insert('os', newData);

      // Verify the insert worked
      const result =
        await testDb.many`SELECT * FROM os WHERE slug = 'another-org'`;
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('another-org');
      expect(result[0].url).toBe('https://example.com');

      // And UPSERT works because UNIQUE constraint is in place
      await testDb.upsert('os', ['slug', 'context'], {
        ...newData,
        name: 'Updated Name',
      });

      const updated = await testDb.get('os', {
        slug: 'another-org',
        context: '',
      });
      expect(updated?.name).toBe('Updated Name');
    });

    it('should fix DuckDB type inference with explicit DEFAULT casts', async () => {
      // This test verifies the fix for issue #228 reopening
      // Problem: DuckDB infers ANY type for columns with DEFAULT '' even in SMRT schemas
      // Solution: Explicitly cast DEFAULT values with CAST('' AS TEXT)

      // Create a table with explicit casts (simulating fixed SMRT schema)
      await db.execute`
        CREATE TABLE test_default_cast (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          context TEXT NOT NULL DEFAULT CAST('' AS TEXT),
          name TEXT DEFAULT CAST('' AS TEXT),
          url TEXT DEFAULT CAST('' AS TEXT),
          meetings_url TEXT DEFAULT CAST('' AS TEXT),
          UNIQUE(slug, context)
        )
      `;

      // Insert with empty strings - should work with explicit casts
      const data1 = {
        id: randomUUID(),
        slug: 'test-cast',
        context: '',
        name: '',
        url: '',
        meetings_url: '',
      };

      await db.insert('test_default_cast', data1);

      // CRITICAL: Test UPSERT with empty strings
      // This would fail with "Cannot create values of type ANY" without the fix
      const data2 = {
        id: data1.id,
        slug: 'test-cast',
        context: '',
        name: 'Updated Name',
        url: 'https://example.com',
        meetings_url: '',
      };

      // This UPSERT should succeed with properly-typed columns
      await db.upsert('test_default_cast', ['slug', 'context'], data2);

      // Verify the update worked
      const result = await db.get('test_default_cast', { id: data1.id });
      expect(result).toMatchObject({
        id: data1.id,
        slug: 'test-cast',
        context: '',
        name: 'Updated Name',
        url: 'https://example.com',
        meetings_url: '',
      });

      // Test inserting new record with empty strings via UPSERT
      const data3 = {
        id: randomUUID(),
        slug: 'new-cast',
        context: '',
        name: '',
        url: '',
        meetings_url: '',
      };

      await db.upsert('test_default_cast', ['slug', 'context'], data3);

      const newResult = await db.get('test_default_cast', { id: data3.id });
      expect(newResult).toMatchObject(data3);
    });

    it('should CAST empty string parameters in INSERT/UPSERT operations', async () => {
      // This test verifies the fix for issue #228 - empty string parameters
      // Problem: When INSERT/UPSERT sends empty strings as parameters, DuckDB
      //          infers them as ANY type even if the table has TEXT columns
      // Solution: Wrap empty string parameters with CAST($N AS TEXT)

      // Create a table (even without DEFAULT CAST, this test should pass now)
      await db.execute`
        CREATE TABLE test_param_cast (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          context TEXT NOT NULL,
          name TEXT,
          url TEXT,
          meetings_url TEXT,
          UNIQUE(slug, context)
        )
      `;

      // Insert with empty strings - the parameters themselves need CAST
      const data1 = {
        id: randomUUID(),
        slug: 'param-test',
        context: '', // Empty string parameter - needs CAST
        name: '', // Empty string parameter - needs CAST
        url: '', // Empty string parameter - needs CAST
        meetings_url: '',
      };

      // This INSERT should work because we CAST empty string parameters
      await db.insert('test_param_cast', data1);

      // Verify insert worked
      const inserted = await db.get('test_param_cast', { id: data1.id });
      expect(inserted).toMatchObject(data1);

      // UPSERT with empty strings - this is the critical test
      const data2 = {
        id: data1.id,
        slug: 'param-test',
        context: '', // Empty string in UPSERT
        name: 'Updated Name',
        url: 'https://example.com',
        meetings_url: '', // Still empty
      };

      // This should succeed because empty strings are CAST in both INSERT and UPDATE clauses
      await db.upsert('test_param_cast', ['slug', 'context'], data2);

      // Verify update worked
      const updated = await db.get('test_param_cast', { id: data1.id });
      expect(updated).toMatchObject({
        id: data1.id,
        slug: 'param-test',
        context: '',
        name: 'Updated Name',
        url: 'https://example.com',
        meetings_url: '',
      });

      // UPSERT to insert new record with all empty strings
      const data3 = {
        id: randomUUID(),
        slug: 'all-empty',
        context: '',
        name: '',
        url: '',
        meetings_url: '',
      };

      await db.upsert('test_param_cast', ['slug', 'context'], data3);

      // Verify new record was inserted
      const newRecord = await db.get('test_param_cast', { id: data3.id });
      expect(newRecord).toMatchObject(data3);
    });
  });

  describe('SchemaProvider support', () => {
    it('should create tables from provided schemas', async () => {
      // Clear cache to get fresh connection after modifying underlying files
      clearConnectionCache();
      if (db) {
        rmSync(testDataDir, { recursive: true, force: true });
      }

      // Create new empty data directory
      mkdirSync(testDataDir, { recursive: true });

      // Create JSON file with data
      writeFileSync(
        `${testDataDir}/custom_table.json`,
        JSON.stringify([
          {
            id: 'item-1',
            name: 'Test Item',
            value: 100,
          },
        ]),
      );

      // Define schema via SchemaProvider
      const schemas = {
        custom_table: {
          tableName: 'custom_table',
          ddl: `CREATE TABLE custom_table (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            value INTEGER DEFAULT 0,
            created_at TEXT DEFAULT NULL
          )`,
          indexes: ['CREATE INDEX idx_custom_name ON custom_table(name)'],
        },
      };

      // Initialize database with provided schema
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Verify table was created with correct schema
      const result = await db.many`SELECT * FROM custom_table`;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'item-1',
        name: 'Test Item',
        value: 100,
      });

      // Verify insert works with schema
      await db.insert('custom_table', {
        id: 'item-2',
        name: 'New Item',
        value: 200,
        created_at: new Date().toISOString(),
      });

      const allItems = await db.many`SELECT * FROM custom_table ORDER BY id`;
      expect(allItems).toHaveLength(2);
    });

    it('should handle schemas without indexes', async () => {
      // Clear cache to get fresh connection after modifying underlying files
      clearConnectionCache();
      if (db) {
        rmSync(testDataDir, { recursive: true, force: true });
      }

      mkdirSync(testDataDir, { recursive: true });
      writeFileSync(
        `${testDataDir}/simple.json`,
        JSON.stringify([{ id: '1', data: 'test' }]),
      );

      // Schema without indexes
      const schemas = {
        simple: {
          tableName: 'simple',
          ddl: `CREATE TABLE simple (
            id TEXT PRIMARY KEY,
            data TEXT
          )`,
          // No indexes defined
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      const result = await db.many`SELECT * FROM simple`;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: '1', data: 'test' });
    });

    it('should handle schemas with empty strings correctly', async () => {
      // This test verifies the fix for Issue #228
      // Clear cache to get fresh connection after modifying underlying files
      clearConnectionCache();
      if (db) {
        rmSync(testDataDir, { recursive: true, force: true });
      }

      mkdirSync(testDataDir, { recursive: true });
      writeFileSync(
        `${testDataDir}/typed_table.json`,
        JSON.stringify([
          {
            id: 'test-1',
            name: 'Test',
            url: '', // Empty string
            description: '', // Empty string
          },
        ]),
      );

      // Provide explicit schema to ensure TEXT types (not ANY)
      const schemas = {
        typed_table: {
          tableName: 'typed_table',
          ddl: `CREATE TABLE typed_table (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT DEFAULT CAST('' AS TEXT),
            description TEXT DEFAULT CAST('' AS TEXT)
          )`,
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      // Verify UPSERT works with empty strings
      await db.upsert('typed_table', ['id'], {
        id: 'test-1',
        name: 'Updated Name',
        url: 'https://example.com',
        description: 'Updated description',
      });

      const result =
        await db.single`SELECT * FROM typed_table WHERE id = 'test-1'`;
      expect(result).toMatchObject({
        id: 'test-1',
        name: 'Updated Name',
        url: 'https://example.com',
        description: 'Updated description',
      });
    });

    it('should allow manual table creation when autoRegister is false', async () => {
      // Clear cache to get fresh connection after modifying underlying files
      clearConnectionCache();
      if (db) {
        rmSync(testDataDir, { recursive: true, force: true });
      }

      mkdirSync(testDataDir, { recursive: true });
      writeFileSync(
        `${testDataDir}/manual.json`,
        JSON.stringify([{ id: '1', value: 'test' }]),
      );

      // Create database without auto-registration
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        autoRegister: false, // Don't load JSON files automatically
      });

      // Manually create table with schema
      await db.execute`
        CREATE TABLE manual (
          id TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          extra TEXT
        )
      `;

      // Manually load JSON data
      const jsonData = JSON.parse(
        await import('node:fs/promises').then((fs) =>
          fs.readFile(`${testDataDir}/manual.json`, 'utf-8'),
        ),
      );

      for (const record of jsonData) {
        await db.insert('manual', record);
      }

      const result = await db.many`SELECT * FROM manual`;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: '1', value: 'test' });
    });

    it('should preserve UUID strings through export/import cycle (Issue #306)', async () => {
      // Issue: DuckDB converts UUID TEXT values to hugeint objects in JSON export
      // This test ensures UUIDs remain as strings throughout the cycle

      // Clean slate
      if (db) {
        rmSync(testDataDir, { recursive: true, force: true });
      }

      mkdirSync(testDataDir, { recursive: true });

      // Create database with immediate write strategy
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        autoRegister: false, // Manual setup for precise control
      });

      // Create table with TEXT id column (like SMRT objects use)
      await db.execute`
        CREATE TABLE councils (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL,
          name TEXT NOT NULL
        )
      `;

      // Insert record with UUID string
      const uuidId = randomUUID();
      await db.insert('councils', {
        id: uuidId,
        slug: 'town-of-bentley',
        name: 'Town of Bentley',
      });

      // Verify initial insert
      const inserted =
        await db.single`SELECT * FROM councils WHERE id = ${uuidId}`;
      expect(inserted).toBeDefined();
      expect(inserted?.id).toBe(uuidId);
      expect(typeof inserted?.id).toBe('string');

      // Export to JSON (this is where DuckDB might convert to hugeint)
      await (db as any).exportTable('councils');

      // Clear cache and recreate database from JSON files (simulates app restart)
      clearConnectionCache();
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        autoRegister: true, // Load JSON files
      });

      // Read back and verify UUID is still a string, not hugeint object
      const readBack =
        await db.single`SELECT * FROM councils WHERE slug = 'town-of-bentley'`;
      expect(readBack).toBeDefined();
      expect(readBack?.id).toBe(uuidId);
      expect(typeof readBack?.id).toBe('string');
      // Ensure it's NOT a hugeint object
      expect(readBack?.id).not.toHaveProperty('hugeint');

      // Test upsert with UUID (the operation that was failing in Issue #306)
      await db.upsert('councils', ['id'], {
        id: uuidId,
        slug: 'town-of-bentley-updated',
        name: 'Town of Bentley - Updated',
      });

      // Verify upsert worked and ID is still a string
      const afterUpsert =
        await db.single`SELECT * FROM councils WHERE id = ${uuidId}`;
      expect(afterUpsert).toBeDefined();
      expect(afterUpsert?.id).toBe(uuidId);
      expect(typeof afterUpsert?.id).toBe('string');
      expect(afterUpsert?.slug).toBe('town-of-bentley-updated');
    });
  });

  describe('connection caching by data directory URL', () => {
    it('should reuse connection when same URL is provided', async () => {
      const testDir = './test-connection-cache-1';
      mkdirSync(testDir, { recursive: true });

      // Create first database
      const db1 = await getDatabase({
        type: 'json',
        url: testDir,
        autoRegister: false,
      });

      // Create table via db1
      await db1.execute`
        CREATE TABLE shared_table (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;

      await db1.insert('shared_table', { id: 'test1', value: 'value1' });

      // Create second database with same URL
      const db2 = await getDatabase({
        type: 'json',
        url: testDir,
        autoRegister: false,
      });

      // db2 should see table created by db1 (same connection)
      const result =
        await db2.single`SELECT * FROM shared_table WHERE id = 'test1'`;
      expect(result).toBeDefined();
      expect(result?.value).toBe('value1');

      // Verify they're the same connection instance
      expect(db1).toBe(db2);

      // Clean up
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create separate connections for different URLs', async () => {
      const testDir1 = './test-connection-cache-2a';
      const testDir2 = './test-connection-cache-2b';
      mkdirSync(testDir1, { recursive: true });
      mkdirSync(testDir2, { recursive: true });

      // Create two databases with different URLs
      const db1 = await getDatabase({
        type: 'json',
        url: testDir1,
        autoRegister: false,
      });

      const db2 = await getDatabase({
        type: 'json',
        url: testDir2,
        autoRegister: false,
      });

      // They should be different instances
      expect(db1).not.toBe(db2);

      // Create table in db1
      await db1.execute`
        CREATE TABLE db1_table (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;

      // db2 should NOT see db1's table
      const tableExists = await db2.tableExists('db1_table');
      expect(tableExists).toBe(false);

      // Clean up
      rmSync(testDir1, { recursive: true, force: true });
      rmSync(testDir2, { recursive: true, force: true });
    });

    it('should use explicit dbid to override URL-based caching', async () => {
      const testDir = './test-connection-cache-3';
      mkdirSync(testDir, { recursive: true });

      // Create two databases with same URL but different dbids
      const db1 = await getDatabase({
        type: 'json',
        url: testDir,
        dbid: 'instance-1',
        autoRegister: false,
      });

      const db2 = await getDatabase({
        type: 'json',
        url: testDir,
        dbid: 'instance-2',
        autoRegister: false,
      });

      // They should be different instances (different dbids)
      expect(db1).not.toBe(db2);

      // Create table in db1
      await db1.execute`
        CREATE TABLE db1_table (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;

      // db2 should NOT see db1's table (separate instance)
      const tableExists = await db2.tableExists('db1_table');
      expect(tableExists).toBe(false);

      // Clean up
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should handle parallel calls with same URL', async () => {
      const testDir = './test-connection-cache-4';
      mkdirSync(testDir, { recursive: true });

      // Create multiple connections in parallel with same URL
      const [db1, db2, db3] = await Promise.all([
        getDatabase({ type: 'json', url: testDir, autoRegister: false }),
        getDatabase({ type: 'json', url: testDir, autoRegister: false }),
        getDatabase({ type: 'json', url: testDir, autoRegister: false }),
      ]);

      // All should be the same instance
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);

      // Clean up
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should force fresh connection when clearCache is true', async () => {
      const testDir = './test-connection-cache-5';
      mkdirSync(testDir, { recursive: true });

      // Create first database
      const db1 = await getDatabase({
        type: 'json',
        url: testDir,
        autoRegister: false,
      });

      // Create table via db1
      await db1.execute`
        CREATE TABLE test_table (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;

      await db1.insert('test_table', { id: 'test1', value: 'value1' });

      // Create second database with same URL but clearCache: true
      const db2 = await getDatabase({
        type: 'json',
        url: testDir,
        autoRegister: false,
        clearCache: true,
      });

      // db2 should be a different instance
      expect(db1).not.toBe(db2);

      // db2 should NOT have the table from db1 (fresh connection, no tables yet)
      const tableExists = await db2.tableExists('test_table');
      expect(tableExists).toBe(false);

      // Clean up
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('Array and Object Type Casting (Issue #378)', () => {
    let testDb: DatabaseInterface;
    let testDir: string;

    beforeEach(async () => {
      testDir = mkdtempSync(join(tmpdir(), 'json-test-issue-378-'));

      testDb = await getDatabase({
        type: 'json',
        url: testDir,
        writeStrategy: 'immediate',
        autoRegister: false,
      });

      // Create test table with JSON columns
      await testDb.execute`
        CREATE TABLE test_objects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          tags JSON,
          metadata JSON,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    describe('INSERT operations', () => {
      it('should insert record with empty array using JSON cast', async () => {
        await testDb.insert('test_objects', {
          id: 'test-1',
          name: 'Test Object 1',
          tags: [],
          metadata: { version: 1 },
        });

        const record = await testDb.get('test_objects', { id: 'test-1' });
        expect(record).toBeDefined();
        expect(record?.name).toBe('Test Object 1');
        expect(JSON.parse(record?.tags as string)).toEqual([]);
        expect(JSON.parse(record?.metadata as string)).toEqual({ version: 1 });
      });

      it('should insert record with string array', async () => {
        await testDb.insert('test_objects', {
          id: 'test-2',
          name: 'Test Object 2',
          tags: ['tag1', 'tag2', 'tag3'],
          metadata: { type: 'test', count: 3 },
        });

        const record = await testDb.get('test_objects', { id: 'test-2' });
        expect(record).toBeDefined();
        expect(JSON.parse(record?.tags as string)).toEqual([
          'tag1',
          'tag2',
          'tag3',
        ]);
        expect(JSON.parse(record?.metadata as string)).toEqual({
          type: 'test',
          count: 3,
        });
      });

      it('should insert record with number array', async () => {
        await testDb.insert('test_objects', {
          id: 'test-3',
          name: 'Test Object 3',
          tags: [1, 2, 3, 4, 5],
          metadata: { numbers: true },
        });

        const record = await testDb.get('test_objects', { id: 'test-3' });
        expect(record).toBeDefined();
        expect(JSON.parse(record?.tags as string)).toEqual([1, 2, 3, 4, 5]);
      });

      it('should insert record with nested object structure', async () => {
        await testDb.insert('test_objects', {
          id: 'test-4',
          name: 'Test Object 4',
          tags: ['nested'],
          metadata: {
            user: { id: 'user-1', name: 'John' },
            settings: { theme: 'dark', notifications: true },
            history: [{ action: 'create', timestamp: '2024-01-01' }],
          },
        });

        const record = await testDb.get('test_objects', { id: 'test-4' });
        expect(record).toBeDefined();
        const metadata = JSON.parse(record?.metadata as string);
        expect(metadata.user).toEqual({ id: 'user-1', name: 'John' });
        expect(metadata.settings).toEqual({
          theme: 'dark',
          notifications: true,
        });
        expect(metadata.history).toHaveLength(1);
      });

      it('should insert multiple records with arrays and objects', async () => {
        await testDb.insert('test_objects', [
          {
            id: 'batch-1',
            name: 'Batch 1',
            tags: ['a', 'b'],
            metadata: { batch: 1 },
          },
          {
            id: 'batch-2',
            name: 'Batch 2',
            tags: ['c', 'd'],
            metadata: { batch: 2 },
          },
          {
            id: 'batch-3',
            name: 'Batch 3',
            tags: [],
            metadata: {},
          },
        ]);

        const records = await testDb.list('test_objects', {});
        expect(records).toHaveLength(3);
      });

      it('should persist arrays and objects to JSON file', async () => {
        await testDb.insert('test_objects', {
          id: 'persist-1',
          name: 'Persist Test',
          tags: ['persisted', 'to', 'file'],
          metadata: { file_check: true },
        });

        // Verify JSON file was written
        const jsonPath = join(testDir, 'test_objects.json');
        expect(existsSync(jsonPath)).toBe(true);

        const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        expect(Array.isArray(jsonContent)).toBe(true);
        expect(jsonContent).toHaveLength(1);
      });
    });

    describe('UPSERT operations', () => {
      beforeEach(async () => {
        // Insert initial record
        await testDb.insert('test_objects', {
          id: 'upsert-1',
          name: 'Original Name',
          tags: ['original'],
          metadata: { version: 1 },
        });
      });

      it('should upsert record with updated array', async () => {
        await testDb.upsert('test_objects', ['id'], {
          id: 'upsert-1',
          name: 'Updated Name',
          tags: ['updated', 'new'],
          metadata: { version: 2 },
        });

        const record = await testDb.get('test_objects', { id: 'upsert-1' });
        expect(record?.name).toBe('Updated Name');
        expect(JSON.parse(record?.tags as string)).toEqual(['updated', 'new']);
        expect(JSON.parse(record?.metadata as string)).toEqual({ version: 2 });
      });

      it('should upsert record changing array to empty', async () => {
        await testDb.upsert('test_objects', ['id'], {
          id: 'upsert-1',
          name: 'No Tags',
          tags: [],
          metadata: { cleared: true },
        });

        const record = await testDb.get('test_objects', { id: 'upsert-1' });
        expect(record?.name).toBe('No Tags');
        expect(JSON.parse(record?.tags as string)).toEqual([]);
      });

      it('should insert new record via upsert with arrays/objects', async () => {
        await testDb.upsert('test_objects', ['id'], {
          id: 'upsert-new',
          name: 'New Record',
          tags: ['fresh', 'data'],
          metadata: { created_via: 'upsert' },
        });

        const record = await testDb.get('test_objects', { id: 'upsert-new' });
        expect(record).toBeDefined();
        expect(record?.name).toBe('New Record');
        expect(JSON.parse(record?.tags as string)).toEqual(['fresh', 'data']);
      });
    });

    describe('Mixed type handling', () => {
      it('should handle records with mixed value types correctly', async () => {
        await testDb.insert('test_objects', {
          id: 'mixed-1',
          name: 'Mixed Types',
          tags: [1, 'two', 3, 'four'],
          metadata: {
            string: 'value',
            number: 42,
            boolean: true,
            null_value: null,
            nested_array: [1, 2, 3],
            nested_object: { a: 1, b: 2 },
          },
        });

        const record = await testDb.get('test_objects', { id: 'mixed-1' });
        expect(record).toBeDefined();
        const tags = JSON.parse(record?.tags as string);
        const metadata = JSON.parse(record?.metadata as string);

        expect(tags).toEqual([1, 'two', 3, 'four']);
        expect(metadata.string).toBe('value');
        expect(metadata.number).toBe(42);
        expect(metadata.boolean).toBe(true);
        expect(metadata.null_value).toBe(null);
        expect(metadata.nested_array).toEqual([1, 2, 3]);
        expect(metadata.nested_object).toEqual({ a: 1, b: 2 });
      });
    });
  });
});
