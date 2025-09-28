import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';

// import type { Database } from "./types";

describe('sqlite tests', () => {
  let db: any;

  beforeEach(async () => {
    db = await getDatabase({
      type: 'sqlite',
    });
    await db.execute`
      create table contents (
        id uuid primary key not null,
        title text, 
        body text
      )
    `;
  });

  afterEach(async () => {
    await db.execute`
      drop table contents
    `;
  });

  it('should be able to perform a statement', async () => {
    const result = await db.many`
      select * from contents
    `;
    expect(result).toEqual([]);
  });

  it('should be able to insert data', async () => {
    const data = {
      id: randomUUID(),
      title: 'hello',
      body: 'world',
    } as const;
    const inserted = await db.insert('contents', data);
    expect(inserted).toBeDefined();
  });

  it('should be able to query data with a condition', async () => {
    const data = {
      id: randomUUID(),
      title: 'hello',
      body: 'world',
    } as const;
    await db.insert('contents', data);
    const result = await db.single`
      select * from contents where id = ${data.id}
    `;
    expect(result).toEqual({
      id: data.id,
      title: data.title,
      body: data.body,
    });
  });

  it('should be able to update a row', async () => {
    const data = {
      id: randomUUID(),
      title: 'hello',
      body: 'world',
    } as const;
    await db.insert('contents', data);
    await db.update(
      'contents',
      { id: data.id },
      { title: 'hi', body: 'universe' },
    );
    const result = await db.single`
      select * from contents where id = ${data.id}
    `;
    expect(result).toEqual({ id: data.id, title: 'hi', body: 'universe' });
  });

  it('should handle file URLs in test environment', async () => {
    // Test that file URLs work (issue #106 fix)
    const testDb = await getDatabase({
      type: 'sqlite',
      url: 'file::memory:', // This should work in test environment
    });

    await testDb.execute`
      CREATE TABLE test_file_url (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `;

    await testDb.insert('test_file_url', {
      id: 'test-1',
      data: 'file URL test',
    });

    const result = await testDb.get('test_file_url', { id: 'test-1' });
    expect(result).toEqual({
      id: 'test-1',
      data: 'file URL test',
    });
  });

  it('should handle actual file paths', async () => {
    // Test with a temporary file path
    const tempFile = '/tmp/test-sqlite-' + randomUUID() + '.db';
    const testDb = await getDatabase({
      type: 'sqlite',
      url: `file:${tempFile}`,
    });

    await testDb.execute`
      CREATE TABLE test_file_path (
        id TEXT PRIMARY KEY,
        value INTEGER
      )
    `;

    await testDb.insert('test_file_path', { id: 'file-test', value: 42 });
    const result =
      await testDb.single`SELECT * FROM test_file_path WHERE id = 'file-test'`;

    expect(result).toEqual({
      id: 'file-test',
      value: 42,
    });

    // Clean up
    try {
      const fs = await import('node:fs');
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  });
});
