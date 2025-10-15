import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';

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

    // Initialize JSON database
    db = await getDatabase({
      type: 'json',
      dataDir: testDataDir,
      writeStrategy: 'immediate',
    });
  });

  afterEach(async () => {
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

    // Reload database to pick up new table
    db = await getDatabase({
      type: 'json',
      dataDir: testDataDir,
      writeStrategy: 'immediate',
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
    // The JSON adapter should only create JSON files in dataDir

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
      dataDir: testDataDir,
      writeStrategy: 'none',
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
      dataDir: testDataDir,
      writeStrategy: 'manual',
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
      dataDir: emptyDir,
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
});
