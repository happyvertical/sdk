import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './duckdb';
import type { DatabaseInterface } from './shared/types';

describe('DuckDB Adapter', () => {
  let db: DatabaseInterface;
  // Get the directory of this test file, then go to ../test/fixtures/data
  const Filename = fileURLToPath(import.meta.url);
  const Dirname = dirname(Filename);
  const testDataDir = join(Dirname, '..', 'test', 'fixtures', 'data');

  beforeEach(async () => {
    // Create in-memory DuckDB instance with test fixtures
    db = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      dataDir: testDataDir,
      autoRegisterJSON: true,
      writeStrategy: 'none', // Read-only for most tests
    });
  });

  afterEach(async () => {
    // DuckDB connections auto-cleanup
  });

  describe('Connection and Initialization', () => {
    it('should create an in-memory database', async () => {
      expect(db).toBeDefined();
      expect(db.client).toBeDefined();
    });

    it('should auto-register JSON files as tables', async () => {
      const usersExist = await db.tableExists('users');
      const productsExist = await db.tableExists('products');

      expect(usersExist).toBe(true);
      expect(productsExist).toBe(true);
    });

    it('should infer TIMESTAMP columns from ISO date strings in JSON', async () => {
      // Verify meetings table was auto-registered
      const meetingsExist = await db.tableExists('meetings');
      expect(meetingsExist).toBe(true);

      // Query schema to verify TIMESTAMP type inference
      const schemaInfo = await db.many`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'meetings'
        AND column_name IN ('date', 'created_at', 'updated_at')
        ORDER BY column_name
      `;

      expect(schemaInfo).toHaveLength(3);
      expect(schemaInfo.every((col) => col.data_type === 'TIMESTAMP')).toBe(
        true,
      );

      // Verify we can query timestamp data
      const meetings = await db.many`SELECT * FROM meetings ORDER BY date`;
      expect(meetings).toHaveLength(2);
      expect(meetings[0].title).toBe('Council Meeting');
    });

    it('should handle missing data directory gracefully', async () => {
      const dbNoData = await getDatabase({
        type: 'duckdb',
        url: ':memory:',
        dataDir: './nonexistent',
        autoRegisterJSON: true,
      });

      expect(dbNoData).toBeDefined();
    });
  });

  describe('Template Literal Queries', () => {
    it('should query all records using many()', async () => {
      const users = await db.many`SELECT * FROM users`;
      expect(users).toHaveLength(3);
      expect(users[0]).toHaveProperty('name');
    });

    it('should query with parameters using many()', async () => {
      const activeUsers =
        await db.many`SELECT * FROM users WHERE active = ${true}`;
      expect(activeUsers).toHaveLength(2);
      expect(activeUsers.every((u) => u.active === true)).toBe(true);
    });

    it('should return single record using single()', async () => {
      const user = await db.single`SELECT * FROM users WHERE id = ${'user1'}`;
      expect(user).toBeDefined();
      expect(user?.name).toBe('Alice Smith');
    });

    it('should return null when no record found using single()', async () => {
      const user =
        await db.single`SELECT * FROM users WHERE id = ${'nonexistent'}`;
      expect(user).toBeNull();
    });

    it('should return single value using pluck()', async () => {
      const count = await db.pluck`SELECT COUNT(*) as total FROM users`;
      expect(count).toBe(3);
    });

    it('should execute DML operations using execute()', async () => {
      // Create temporary table for testing
      await db.execute`CREATE TABLE temp_test (id INT, name VARCHAR)`;
      await db.execute`INSERT INTO temp_test VALUES (1, ${'test'})`;

      const result = await db.single`SELECT * FROM temp_test WHERE id = 1`;
      expect(result?.name).toBe('test');
    });
  });

  describe('Template Literal Aliases', () => {
    it('should support oo() alias for many()', async () => {
      const users = await db.oo`SELECT * FROM users`;
      expect(users).toHaveLength(3);
    });

    it('should support oO() alias for single()', async () => {
      const user = await db.oO`SELECT * FROM users WHERE id = ${'user2'}`;
      expect(user?.name).toBe('Bob Johnson');
    });

    it('should support ox() alias for pluck()', async () => {
      const name = await db.ox`SELECT name FROM users WHERE id = ${'user1'}`;
      expect(name).toBe('Alice Smith');
    });

    it('should support xx() alias for execute()', async () => {
      await db.xx`CREATE TABLE temp_alias_test (value INT)`;
      const exists = await db.tableExists('temp_alias_test');
      expect(exists).toBe(true);
    });
  });

  describe('Object-Relational Methods', () => {
    beforeEach(async () => {
      // Create a mutable test table
      await db.execute`CREATE TABLE test_table (
        id VARCHAR PRIMARY KEY,
        name VARCHAR,
        value INT,
        active BOOLEAN
      )`;
    });

    it('should insert single record', async () => {
      const result = await db.insert('test_table', {
        id: 'test1',
        name: 'Test Record',
        value: 42,
        active: true,
      });

      expect(result.operation).toBe('insert');
      expect(result.affected).toBe(1);

      const record = await db.get('test_table', { id: 'test1' });
      expect(record?.name).toBe('Test Record');
    });

    it('should insert multiple records', async () => {
      const result = await db.insert('test_table', [
        { id: 'test1', name: 'Record 1', value: 1, active: true },
        { id: 'test2', name: 'Record 2', value: 2, active: false },
      ]);

      expect(result.affected).toBe(2);

      const records = await db.list('test_table', {});
      expect(records).toHaveLength(2);
    });

    it('should get record by criteria', async () => {
      await db.insert('test_table', {
        id: 'test1',
        name: 'Find Me',
        value: 100,
        active: true,
      });

      const record = await db.get('test_table', { id: 'test1' });
      expect(record).toBeDefined();
      expect(record?.name).toBe('Find Me');
    });

    it('should return null when record not found', async () => {
      const record = await db.get('test_table', { id: 'nonexistent' });
      expect(record).toBeNull();
    });

    it('should list records with criteria', async () => {
      await db.insert('test_table', [
        { id: 'test1', name: 'Active 1', value: 1, active: true },
        { id: 'test2', name: 'Active 2', value: 2, active: true },
        { id: 'test3', name: 'Inactive', value: 3, active: false },
      ]);

      const activeRecords = await db.list('test_table', { active: true });
      expect(activeRecords).toHaveLength(2);
      expect(activeRecords.every((r) => r.active === true)).toBe(true);
    });

    it('should update records', async () => {
      await db.insert('test_table', {
        id: 'test1',
        name: 'Original',
        value: 1,
        active: true,
      });

      const result = await db.update(
        'test_table',
        { id: 'test1' },
        { name: 'Updated', value: 999 },
      );

      expect(result.operation).toBe('update');

      const record = await db.get('test_table', { id: 'test1' });
      expect(record?.name).toBe('Updated');
      expect(record?.value).toBe(999);
    });

    it('should getOrInsert when record exists', async () => {
      await db.insert('test_table', {
        id: 'test1',
        name: 'Existing',
        value: 1,
        active: true,
      });

      const record = await db.getOrInsert(
        'test_table',
        { id: 'test1' },
        { id: 'test1', name: 'New', value: 2, active: false },
      );

      expect(record.name).toBe('Existing');
      expect(record.value).toBe(1);
    });

    it('should getOrInsert when record does not exist', async () => {
      const record = await db.getOrInsert(
        'test_table',
        { id: 'test1' },
        { id: 'test1', name: 'Inserted', value: 42, active: true },
      );

      expect(record.name).toBe('Inserted');
      expect(record.value).toBe(42);
    });
  });

  describe('Table Interface', () => {
    beforeEach(async () => {
      await db.execute`CREATE TABLE table_interface_test (
        id VARCHAR PRIMARY KEY,
        data VARCHAR
      )`;
    });

    it('should create table-specific interface', () => {
      const table = db.table('table_interface_test');
      expect(table).toBeDefined();
      expect(table.insert).toBeInstanceOf(Function);
      expect(table.get).toBeInstanceOf(Function);
      expect(table.list).toBeInstanceOf(Function);
    });

    it('should insert using table interface', async () => {
      const table = db.table('table_interface_test');
      await table.insert({ id: 'test1', data: 'value1' });

      const record = await table.get({ id: 'test1' });
      expect(record?.data).toBe('value1');
    });

    it('should list using table interface', async () => {
      const table = db.table('table_interface_test');
      await table.insert([
        { id: 'test1', data: 'value1' },
        { id: 'test2', data: 'value2' },
      ]);

      const records = await table.list({});
      expect(records).toHaveLength(2);
    });
  });

  describe('Raw Query Method', () => {
    it('should execute raw query with parameters', async () => {
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1',
        'user1',
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Alice Smith');
      expect(result.rowCount).toBe(1);
    });

    it('should handle parameterized queries', async () => {
      const result = await db.query(
        'SELECT * FROM users WHERE active = $1 AND id = $2',
        true,
        'user2',
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Bob Johnson');
    });

    it('should return empty result for no matches', async () => {
      const result = await db.query(
        'SELECT * FROM users WHERE id = $1',
        'nonexistent',
      );

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('Transactions', () => {
    beforeEach(async () => {
      await db.execute`CREATE TABLE transaction_test (
        id VARCHAR PRIMARY KEY,
        value INT
      )`;
    });

    it('should commit transaction on success', async () => {
      await db.transaction(async (tx) => {
        await tx.insert('transaction_test', { id: 'test1', value: 1 });
        await tx.insert('transaction_test', { id: 'test2', value: 2 });
      });

      const records = await db.list('transaction_test', {});
      expect(records).toHaveLength(2);
    });

    it('should rollback transaction on error', async () => {
      try {
        await db.transaction(async (tx) => {
          await tx.insert('transaction_test', { id: 'test1', value: 1 });
          throw new Error('Intentional error');
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      const records = await db.list('transaction_test', {});
      expect(records).toHaveLength(0);
    });

    it('should support nested operations in transaction', async () => {
      const result = await db.transaction(async (tx) => {
        await tx.insert('transaction_test', { id: 'test1', value: 1 });
        const record = await tx.get('transaction_test', { id: 'test1' });
        await tx.update('transaction_test', { id: 'test1' }, { value: 99 });
        return record;
      });

      expect(result).toBeDefined();
      expect(result?.value).toBe(1);

      const updated = await db.get('transaction_test', { id: 'test1' });
      expect(updated?.value).toBe(99);
    });
  });

  describe('Schema Operations', () => {
    it('should check if table exists', async () => {
      const exists = await db.tableExists('users');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent table', async () => {
      const exists = await db.tableExists('nonexistent_table');
      expect(exists).toBe(false);
    });

    it('should sync schema from SQL DDL', async () => {
      const schema = `
        CREATE TABLE schema_test (
          id VARCHAR PRIMARY KEY,
          name VARCHAR NOT NULL
        );
      `;

      await db.syncSchema?.(schema);

      const exists = await db.tableExists('schema_test');
      expect(exists).toBe(true);
    });
  });

  describe('Complex Queries', () => {
    it('should perform JOIN operations', async () => {
      // Create orders table linking to users
      await db.execute`
        CREATE TABLE orders (
          id VARCHAR PRIMARY KEY,
          user_id VARCHAR,
          amount DECIMAL(10,2)
        )
      `;

      await db.insert('orders', [
        { id: 'order1', user_id: 'user1', amount: 100.5 },
        { id: 'order2', user_id: 'user2', amount: 200.75 },
      ]);

      const result = await db.many`
        SELECT u.name, o.amount
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE u.active = ${true}
      `;

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('amount');
    });

    it('should perform aggregation queries', async () => {
      const result = await db.single`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN active THEN 1 END) as active_count
        FROM users
      `;

      expect(result?.total).toBe(3);
      expect(result?.active_count).toBe(2);
    });

    it('should handle GROUP BY queries', async () => {
      const result = await db.many`
        SELECT category, COUNT(*) as count
        FROM products
        GROUP BY category
        ORDER BY category
      `;

      expect(result).toHaveLength(2); // electronics and furniture
      expect(result.find((r) => r.category === 'electronics')?.count).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid SQL', async () => {
      await expect(db.execute`INVALID SQL STATEMENT`).rejects.toThrow();
    });

    it('should throw error for invalid table in insert', async () => {
      await expect(
        db.insert('nonexistent_table', { id: 'test' }),
      ).rejects.toThrow();
    });

    it('should throw error for invalid table in get', async () => {
      await expect(
        db.get('nonexistent_table', { id: 'test' }),
      ).rejects.toThrow();
    });
  });

  describe('Upsert Functionality', () => {
    beforeEach(async () => {
      await db.execute`
        CREATE TABLE test_upsert (
          id VARCHAR PRIMARY KEY,
          email VARCHAR UNIQUE NOT NULL,
          name VARCHAR,
          count INTEGER DEFAULT 0
        )
      `;
    });

    it('should insert a new record when conflict does not exist', async () => {
      const data = {
        id: 'user1',
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
        id: 'user1',
        email: 'existing@example.com',
        name: 'Initial Name',
        count: 1,
      };

      // Insert initial record
      await db.insert('test_upsert', initialData);

      // Upsert with updated data (same email, different values)
      const updatedData = {
        id: initialData.id,
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
          id VARCHAR PRIMARY KEY,
          slug VARCHAR NOT NULL,
          context VARCHAR NOT NULL,
          title VARCHAR,
          UNIQUE(slug, context)
        )
      `;

      const data1 = {
        id: 'post1',
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
        id: 'post2',
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
    });

    it('should handle null values in upsert', async () => {
      const data = {
        id: 'user1',
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
        id: 'user1',
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

    it('should work with transactions', async () => {
      await db.transaction(async (tx) => {
        await tx.upsert('test_upsert', ['email'], {
          id: 'user1',
          email: 'tx@example.com',
          name: 'Transaction Test',
          count: 1,
        });

        await tx.upsert('test_upsert', ['email'], {
          id: 'user1',
          email: 'tx@example.com',
          name: 'Updated in TX',
          count: 2,
        });
      });

      const result =
        await db.single`SELECT * FROM test_upsert WHERE email = ${'tx@example.com'}`;
      expect(result?.name).toBe('Updated in TX');
      expect(result?.count).toBe(2);
    });

    it('should handle upsert with quoted column names (issue #418)', async () => {
      // Create table with quoted column names like SMRT's SchemaGenerator
      await db.execute`
        CREATE TABLE IF NOT EXISTS "test_quoted_upsert" (
          "_meta_type" TEXT NOT NULL,
          "slug" TEXT NOT NULL,
          "context" TEXT NOT NULL,
          "title" TEXT,
          "count" INTEGER DEFAULT 0,
          PRIMARY KEY ("_meta_type", "slug", "context")
        )
      `;

      // First upsert (insert)
      const data1 = {
        _meta_type: 'Meeting',
        slug: 'team-standup',
        context: '/meetings',
        title: 'Daily Standup',
        count: 1,
      };

      await db.upsert(
        'test_quoted_upsert',
        ['_meta_type', 'slug', 'context'],
        data1,
      );

      const result1 = await db.single`
        SELECT * FROM test_quoted_upsert
        WHERE "_meta_type" = ${data1._meta_type}
        AND "slug" = ${data1.slug}
        AND "context" = ${data1.context}
      `;

      expect(result1).toEqual(data1);

      // Second upsert (update)
      const data2 = {
        _meta_type: 'Meeting',
        slug: 'team-standup',
        context: '/meetings',
        title: 'Weekly Standup',
        count: 5,
      };

      await db.upsert(
        'test_quoted_upsert',
        ['_meta_type', 'slug', 'context'],
        data2,
      );

      const result2 = await db.single`
        SELECT * FROM test_quoted_upsert
        WHERE "_meta_type" = ${data2._meta_type}
        AND "slug" = ${data2.slug}
        AND "context" = ${data2.context}
      `;

      expect(result2).toEqual(data2);

      // Verify only one record exists (update, not insert)
      const allRecords = await db.many`SELECT * FROM test_quoted_upsert`;
      expect(allRecords).toHaveLength(1);
    });
  });

  describe('Date and Timestamp Handling', () => {
    it('should convert { micros } objects to Date when reading', async () => {
      // Create table with TIMESTAMP column
      await db.execute`
        CREATE TABLE IF NOT EXISTS test_timestamps (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `;

      const now = new Date();

      // Insert with Date objects (converted to ISO strings)
      await db.insert('test_timestamps', {
        id: 'test-1',
        created_at: now,
        updated_at: now,
      });

      // Query back - DuckDB may return { micros } objects
      const record = await db.get('test_timestamps', { id: 'test-1' });

      // Our fix should convert { micros } objects to Date
      expect(record?.created_at).toBeInstanceOf(Date);
      expect(record?.updated_at).toBeInstanceOf(Date);

      // Verify the Date values are approximately correct
      // (allowing for rounding in DuckDB's microsecond precision)
      if (record?.created_at instanceof Date) {
        const diff = Math.abs(record.created_at.getTime() - now.getTime());
        expect(diff).toBeLessThan(1000); // Within 1 second
      }
    });

    it('should handle null timestamp values', async () => {
      await db.execute`
        CREATE TABLE IF NOT EXISTS test_timestamps_null (
          id TEXT PRIMARY KEY,
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `;

      await db.insert('test_timestamps_null', {
        id: 'null-test',
        created_at: null,
        updated_at: null,
      });

      const record = await db.get('test_timestamps_null', { id: 'null-test' });

      expect(record?.created_at).toBeNull();
      expect(record?.updated_at).toBeNull();
    });

    it('should work with many() returning multiple timestamp records', async () => {
      await db.execute`
        CREATE TABLE IF NOT EXISTS test_timestamps_many (
          id TEXT PRIMARY KEY,
          event_time TIMESTAMP
        )
      `;

      const date1 = new Date('2024-01-01T10:00:00Z');
      const date2 = new Date('2024-01-02T10:00:00Z');
      const date3 = new Date('2024-01-03T10:00:00Z');

      await db.insert('test_timestamps_many', [
        { id: 'event-1', event_time: date1 },
        { id: 'event-2', event_time: date2 },
        { id: 'event-3', event_time: date3 },
      ]);

      const records =
        await db.many`SELECT * FROM test_timestamps_many ORDER BY event_time`;

      expect(records).toHaveLength(3);
      records.forEach((record) => {
        expect(record.event_time).toBeInstanceOf(Date);
      });
    });
  });

  describe('Array and Object Type Casting (Issue #378)', () => {
    let testDb: DatabaseInterface;

    beforeEach(async () => {
      // Create separate in-memory DB for write operations
      testDb = await getDatabase({
        type: 'duckdb',
        url: ':memory:',
        writeStrategy: 'none',
      });

      // Create test table with JSON columns
      await testDb.execute`
        CREATE TABLE test_objects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          tags JSON,
          metadata JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
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
        const batchRecords = records.filter((r) => r.id.startsWith('batch-'));
        expect(batchRecords).toHaveLength(3);
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

    describe('Plain object detection', () => {
      it('should cast plain objects but not class instances', async () => {
        class CustomClass {
          constructor(public value: string) {}
        }

        const customInstance = new CustomClass('test');

        // Plain object should be JSON stringified and cast
        await testDb.insert('test_objects', {
          id: 'plain-test',
          name: 'Plain Object Test',
          tags: [],
          metadata: { plain: true }, // Plain object
        });

        const record = await testDb.get('test_objects', { id: 'plain-test' });
        expect(record).toBeDefined();
        expect(JSON.parse(record?.metadata as string)).toEqual({ plain: true });
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
