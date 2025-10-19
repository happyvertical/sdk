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

  it('should handle in-memory databases with :memory: URL', async () => {
    // Test explicit :memory: URL
    const testDb = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
    });

    await testDb.execute`
      CREATE TABLE test_memory (
        id TEXT PRIMARY KEY,
        data TEXT
      )
    `;

    await testDb.insert('test_memory', {
      id: 'test-1',
      data: 'memory database test',
    });

    const result = await testDb.get('test_memory', { id: 'test-1' });
    expect(result).toEqual({
      id: 'test-1',
      data: 'memory database test',
    });
  });

  describe('upsert functionality', () => {
    beforeEach(async () => {
      await db.execute`
        CREATE TABLE test_upsert (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          count INTEGER DEFAULT 0
        )
      `;
    });

    afterEach(async () => {
      await db.execute`DROP TABLE test_upsert`;
    });

    it('should insert a new record when conflict does not exist', async () => {
      const data = {
        id: randomUUID(),
        email: 'new@example.com',
        name: 'New User',
        count: 1,
      };

      await db.upsert('test_upsert', ['email'], data);

      const result =
        await db.single`SELECT * FROM test_upsert WHERE email = ${data.email}`;
      expect(result).toEqual(data);
    });

    it('should update an existing record on conflict', async () => {
      const initialData = {
        id: randomUUID(),
        email: 'existing@example.com',
        name: 'Initial Name',
        count: 1,
      };

      // Insert initial record
      await db.insert('test_upsert', initialData);

      // Upsert with updated data (same email, different values)
      const updatedData = {
        id: initialData.id, // Keep same ID
        email: 'existing@example.com', // Same email triggers conflict
        name: 'Updated Name',
        count: 5,
      };

      await db.upsert('test_upsert', ['email'], updatedData);

      const result =
        await db.single`SELECT * FROM test_upsert WHERE email = ${initialData.email}`;
      expect(result).toEqual(updatedData);
    });

    it('should handle composite unique constraints', async () => {
      await db.execute`
        CREATE TABLE test_composite (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          context TEXT NOT NULL,
          title TEXT,
          UNIQUE(slug, context)
        )
      `;

      const data1 = {
        id: randomUUID(),
        slug: 'my-post',
        context: '/blog',
        title: 'Blog Post',
      };

      // Insert initial record
      await db.upsert('test_composite', ['slug', 'context'], data1);

      // Upsert same slug+context (should update)
      const data2 = {
        id: data1.id,
        slug: 'my-post',
        context: '/blog',
        title: 'Updated Blog Post',
      };

      await db.upsert('test_composite', ['slug', 'context'], data2);

      const result = await db.single`
        SELECT * FROM test_composite
        WHERE slug = ${data1.slug} AND context = ${data1.context}
      `;
      expect(result?.title).toBe('Updated Blog Post');

      // Upsert same slug but different context (should insert new)
      const data3 = {
        id: randomUUID(),
        slug: 'my-post',
        context: '/docs',
        title: 'Documentation Post',
      };

      await db.upsert('test_composite', ['slug', 'context'], data3);

      const allRecords =
        await db.many`SELECT * FROM test_composite ORDER BY context`;
      expect(allRecords).toHaveLength(2);
      expect(allRecords[0].context).toBe('/blog');
      expect(allRecords[1].context).toBe('/docs');

      await db.execute`DROP TABLE test_composite`;
    });

    it('should handle null values in upsert', async () => {
      const data = {
        id: randomUUID(),
        email: 'null-test@example.com',
        name: null,
        count: 0,
      };

      await db.upsert('test_upsert', ['email'], data);

      const result =
        await db.single`SELECT * FROM test_upsert WHERE email = ${data.email}`;
      expect(result).toEqual(data);
    });

    it('should return correct affected row count', async () => {
      const data = {
        id: randomUUID(),
        email: 'count-test@example.com',
        name: 'Count Test',
        count: 1,
      };

      // First upsert (insert)
      const result1 = await db.upsert('test_upsert', ['email'], data);
      expect(result1.operation).toBe('upsert');
      expect(result1.affected).toBeGreaterThanOrEqual(1);

      // Second upsert (update)
      data.name = 'Updated Count Test';
      const result2 = await db.upsert('test_upsert', ['email'], data);
      expect(result2.operation).toBe('upsert');
      expect(result2.affected).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ALTER TABLE functionality', () => {
    beforeEach(async () => {
      await db.execute`
        CREATE TABLE test_alter (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        )
      `;
    });

    afterEach(async () => {
      await db.execute`DROP TABLE IF EXISTS test_alter`;
    });

    it('should add a new column to an existing table', async () => {
      // Verify initial schema
      const schemaBefore = await db.getTableSchema?.('test_alter');
      expect(schemaBefore).toBeDefined();
      expect(Object.keys(schemaBefore?.columns)).toHaveLength(2);
      expect(schemaBefore?.columns.id).toBeDefined();
      expect(schemaBefore?.columns.name).toBeDefined();

      // Add new column (note: UNIQUE constraint not supported in ALTER TABLE ADD COLUMN in SQLite)
      await db.alterTable?.addColumn('test_alter', {
        name: 'email',
        type: 'TEXT',
      });

      // Verify column was added
      const schemaAfter = await db.getTableSchema?.('test_alter');
      expect(schemaAfter).toBeDefined();
      expect(Object.keys(schemaAfter?.columns)).toHaveLength(3);
      expect(schemaAfter?.columns.email).toBeDefined();
      expect(schemaAfter?.columns.email.type).toBe('TEXT');

      // Verify we can insert data with the new column
      await db.insert('test_alter', {
        id: randomUUID(),
        name: 'Test User',
        email: 'test@example.com',
      });

      const result =
        await db.single`SELECT * FROM test_alter WHERE email = 'test@example.com'`;
      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
    });

    it('should add a new index to an existing table', async () => {
      // Verify initial schema has no indexes
      const schemaBefore = await db.getTableSchema?.('test_alter');
      expect(schemaBefore).toBeDefined();
      expect(schemaBefore?.indexes).toHaveLength(0);

      // Add new index
      await db.alterTable?.addIndex('test_alter', {
        name: 'idx_test_alter_name',
        columns: ['name'],
      });

      // Verify index was added
      const schemaAfter = await db.getTableSchema?.('test_alter');
      expect(schemaAfter).toBeDefined();
      expect(schemaAfter?.indexes.length).toBeGreaterThan(0);

      const nameIndex = schemaAfter?.indexes.find(
        (idx: any) => idx.name === 'idx_test_alter_name',
      );
      expect(nameIndex).toBeDefined();
      expect(nameIndex?.columns).toEqual(['name']);
    });

    it('should add a unique index to a table', async () => {
      // Add unique index
      await db.alterTable?.addIndex('test_alter', {
        name: 'idx_test_alter_name_unique',
        columns: ['name'],
        unique: true,
      });

      // Verify index was added and is unique
      const schema = await db.getTableSchema?.('test_alter');
      expect(schema).toBeDefined();

      const uniqueIndex = schema?.indexes.find(
        (idx: any) => idx.name === 'idx_test_alter_name_unique',
      );
      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex?.unique).toBe(true);
    });

    it('should retrieve complete table schema', async () => {
      // Add some complexity to the table
      await db.alterTable?.addColumn('test_alter', {
        name: 'age',
        type: 'INTEGER',
        defaultValue: 0,
      });

      await db.alterTable?.addIndex('test_alter', {
        name: 'idx_test_name',
        columns: ['name'],
      });

      // Get full schema
      const schema = await db.getTableSchema?.('test_alter');
      expect(schema).toBeDefined();
      expect(schema?.tableName).toBe('test_alter');
      expect(Object.keys(schema?.columns)).toHaveLength(3);

      // Verify primary key detection
      expect(schema?.columns.id.primaryKey).toBe(true);
      expect(schema?.columns.name.primaryKey).toBe(false);

      // Verify NOT NULL detection
      expect(schema?.columns.name.notNull).toBe(true);

      // Verify indexes
      expect(schema?.indexes.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent table schema', async () => {
      const schema = await db.getTableSchema?.('nonexistent_table');
      expect(schema).toBeNull();
    });

    it('should handle column with default value', async () => {
      await db.alterTable?.addColumn('test_alter', {
        name: 'status',
        type: 'TEXT',
        defaultValue: 'active',
      });

      // Insert row without specifying status
      await db.insert('test_alter', {
        id: randomUUID(),
        name: 'Test User',
      });

      const result =
        await db.single`SELECT status FROM test_alter WHERE name = 'Test User'`;
      expect(result).toBeDefined();
      expect(result?.status).toBe('active');
    });
  });

  describe('memory database sharing with dbid', () => {
    it('should auto-generate dbid for :memory: databases', async () => {
      const options = { type: 'sqlite' as const, url: ':memory:' };
      const db1 = await getDatabase(options);

      // Options should be mutated to include dbid
      expect(options.dbid).toBeDefined();
      expect(typeof options.dbid).toBe('string');
    });

    it('should reuse connection when same dbid is provided', async () => {
      // Create first database with explicit dbid
      const dbid = 'test-shared-memory-1';
      const db1 = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        dbid,
      });

      // Create table and insert data
      await db1.execute`
        CREATE TABLE shared_test (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;
      await db1.insert('shared_test', { id: 'test-1', value: 'from db1' });

      // Create second database with same dbid
      const db2 = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        dbid,
      });

      // db2 should see the table and data from db1
      const result = await db2.get('shared_test', { id: 'test-1' });
      expect(result).toEqual({ id: 'test-1', value: 'from db1' });

      // Verify both databases are the same instance
      expect(db1).toBe(db2);
    });

    it('should create separate connections for different dbids', async () => {
      // Create first database
      const db1 = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        dbid: 'memory-1',
      });

      await db1.execute`
        CREATE TABLE isolated_test (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;
      await db1.insert('isolated_test', { id: 'test-1', value: 'from db1' });

      // Create second database with different dbid
      const db2 = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        dbid: 'memory-2',
      });

      // db2 should not see db1's tables
      const tableExists = await db2.tableExists('isolated_test');
      expect(tableExists).toBe(false);

      // Verify databases are different instances
      expect(db1).not.toBe(db2);
    });

    it('should mutate options object to propagate dbid to child objects', async () => {
      const options = { type: 'sqlite' as const, url: ':memory:' };

      // Create parent database - should auto-generate dbid
      const parentDb = await getDatabase(options);

      // Options now has dbid
      expect(options.dbid).toBeDefined();
      const parentDbId = options.dbid;

      // Create table and data
      await parentDb.execute`
        CREATE TABLE parent_child_test (
          id TEXT PRIMARY KEY,
          data TEXT
        )
      `;
      await parentDb.insert('parent_child_test', {
        id: 'parent-1',
        data: 'parent data',
      });

      // Simulate child object using same options (now with memoryId)
      const childDb = await getDatabase(options);

      // Child should see parent's data
      const result = await childDb.get('parent_child_test', {
        id: 'parent-1',
      });
      expect(result).toEqual({ id: 'parent-1', data: 'parent data' });

      // Verify same connection
      expect(childDb).toBe(parentDb);

      // Verify dbid was preserved
      expect(options.dbid).toBe(parentDbId);
    });

    it('should handle parallel calls with same dbid', async () => {
      const dbid = 'test-parallel-1';

      // Create multiple connections in parallel with same dbid
      const [db1, db2, db3] = await Promise.all([
        getDatabase({ type: 'sqlite', url: ':memory:', dbid }),
        getDatabase({ type: 'sqlite', url: ':memory:', dbid }),
        getDatabase({ type: 'sqlite', url: ':memory:', dbid }),
      ]);

      // All should be the same instance
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);

      // Create table with first connection
      await db1.execute`
        CREATE TABLE parallel_test (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `;

      // All connections should see the table
      const exists1 = await db1.tableExists('parallel_test');
      const exists2 = await db2.tableExists('parallel_test');
      const exists3 = await db3.tableExists('parallel_test');

      expect(exists1).toBe(true);
      expect(exists2).toBe(true);
      expect(exists3).toBe(true);
    });

    it('should handle parallel calls with auto-generated dbid', async () => {
      const options = { type: 'sqlite' as const, url: ':memory:' };

      // Create first connection - generates dbid
      const db1 = await getDatabase(options);
      const dbid = options.dbid;

      // Create subsequent connections in parallel - should reuse dbid
      const [db2, db3] = await Promise.all([
        getDatabase(options),
        getDatabase(options),
      ]);

      // All should be the same instance
      expect(db1).toBe(db2);
      expect(db2).toBe(db3);

      // Verify dbid remained constant
      expect(options.dbid).toBe(dbid);
    });

    it('should only cache :memory: databases with dbid', async () => {
      // File-based database should not be cached
      const fileDb1 = await getDatabase({
        type: 'sqlite',
        url: 'file::memory:?cache=shared',
      });

      const fileDb2 = await getDatabase({
        type: 'sqlite',
        url: 'file::memory:?cache=shared',
      });

      // File-based databases without dbid are separate instances
      // (even though they might share the same underlying connection in libsql)
      expect(fileDb1).not.toBe(fileDb2);
    });

    it('should work with nested collection scenario', async () => {
      // Simulate SMRT framework scenario from Issue #249
      const parentOptions = { type: 'sqlite' as const, url: ':memory:' };

      // Parent creates connection and table
      const parentDb = await getDatabase(parentOptions);
      await parentDb.execute`
        CREATE TABLE councils (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT
        )
      `;
      await parentDb.insert('councils', {
        id: 'council-1',
        name: 'Town Council',
        url: 'https://example.com',
      });

      // Child collection uses same options (now with auto-generated dbid)
      const childDb = await getDatabase(parentOptions);

      // Child should be able to query parent's tables
      const council = await childDb.single`
        SELECT * FROM councils WHERE name = ${'Town Council'}
      `;

      expect(council).toEqual({
        id: 'council-1',
        name: 'Town Council',
        url: 'https://example.com',
      });

      // Verify same connection instance
      expect(childDb).toBe(parentDb);
    });
  });
});
