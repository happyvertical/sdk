import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseError } from '@happyvertical/utils';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

async function optionalPackageAvailable(packageName: string): Promise<boolean> {
  try {
    await import(/* @vite-ignore */ packageName);
    return true;
  } catch (_error) {
    return false;
  }
}

async function withTempDb<T>(
  prefix: string,
  callback: (dbPath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(join(dir, 'test.db'));
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function closeDb(db: DatabaseInterface | undefined): Promise<void> {
  await db?.close?.();
}

describe('sqlite optional native capabilities', () => {
  it('keeps the LibSQL SQLite path by default', async () => {
    const db = await getDatabase({ type: 'sqlite' });

    expect(db.vector).toBeUndefined();
    expect(db.notifications).toBeUndefined();
    expect(db.close).toBeTypeOf('function');
    await db.close?.();
  });

  it('rejects remote LibSQL URLs when vector capability is enabled', async () => {
    await expect(
      getDatabase({
        type: 'sqlite',
        url: 'libsql://example.turso.io',
        capabilities: { vector: true },
      }),
    ).rejects.toThrow('only supported for local SQLite databases');
  });

  it('rejects remote LibSQL URLs when notifications capability is enabled', async () => {
    await expect(
      getDatabase({
        type: 'sqlite',
        url: 'libsql://example.turso.io',
        capabilities: { notifications: true },
      }),
    ).rejects.toThrow('only supported for local SQLite databases');
  });

  it('rejects in-memory databases for notifications', async () => {
    await expect(
      getDatabase({
        type: 'sqlite',
        url: ':memory:',
        capabilities: { notifications: true },
      }),
    ).rejects.toThrow('require a file-backed database');
  });

  it('gives a clear install error when sqlite-vector is not installed', async () => {
    if (await optionalPackageAvailable('@sqliteai/sqlite-vector')) {
      return;
    }

    await withTempDb('sdk-sqlite-vector-missing-', async (dbPath) => {
      await expect(
        getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { vector: true },
        }),
      ).rejects.toThrow('@sqliteai/sqlite-vector');
    });
  });

  it('gives a clear install error when Honker is not installed', async () => {
    if (await optionalPackageAvailable('@russellthehippo/honker-node')) {
      return;
    }

    await withTempDb('sdk-sqlite-honker-missing-', async (dbPath) => {
      await expect(
        getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { notifications: true },
        }),
      ).rejects.toThrow('@russellthehippo/honker-node');
    });
  });

  it('applies provided schemas on the native SQLite path', async () => {
    if (!(await optionalPackageAvailable('@sqliteai/sqlite-vector'))) {
      return;
    }

    await withTempDb('sdk-sqlite-native-schema-', async (dbPath) => {
      let db: DatabaseInterface | undefined;

      try {
        db = await getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { vector: true },
          schemas: {
            widgets: {
              tableName: 'widgets',
              ddl: `
                CREATE TABLE widgets (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL
                )
              `,
              indexes: ['CREATE INDEX idx_widgets_name ON widgets(name)'],
            },
          },
        });

        await expect(db.tableExists('widgets')).resolves.toBe(true);
        await db.insert('widgets', { id: 'widget-1', name: 'Test Widget' });
        await expect(
          db.get('widgets', { id: 'widget-1' }),
        ).resolves.toMatchObject({ id: 'widget-1', name: 'Test Widget' });
      } finally {
        await closeDb(db);
      }
    });
  });

  it('wraps native SQLite schema-alter failures with safe causes', async () => {
    if (!(await optionalPackageAvailable('@sqliteai/sqlite-vector'))) {
      return;
    }

    await withTempDb('sdk-sqlite-native-alter-', async (dbPath) => {
      let db: DatabaseInterface | undefined;

      try {
        db = await getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { vector: true },
        });
        await db.query(
          'CREATE TABLE native_alter_issue_744 (id TEXT PRIMARY KEY, name TEXT)',
        );

        const duplicateColumn = await db.alterTable
          ?.addColumn('native_alter_issue_744', { name: 'name', type: 'text' })
          .catch((error: unknown) => error);
        expect(duplicateColumn).toBeInstanceOf(DatabaseError);
        expect((duplicateColumn as DatabaseError).message).toContain(
          'duplicate column name',
        );
        expect((duplicateColumn as DatabaseError).cause).toBeInstanceOf(Error);

        await db.alterTable?.addIndex('native_alter_issue_744', {
          name: 'native_alter_issue_744_name_idx',
          columns: ['name'],
        });
        const duplicateIndex = await db.alterTable
          ?.addIndex('native_alter_issue_744', {
            name: 'native_alter_issue_744_name_idx',
            columns: ['name'],
          })
          .catch((error: unknown) => error);
        expect(duplicateIndex).toBeInstanceOf(DatabaseError);
        expect((duplicateIndex as DatabaseError).message).toContain(
          'already exists',
        );
        expect((duplicateIndex as DatabaseError).cause).toBeInstanceOf(Error);
      } finally {
        await closeDb(db);
      }
    });
  });

  it('supports sqlite-vector search parity when the optional package is installed', async () => {
    if (!(await optionalPackageAvailable('@sqliteai/sqlite-vector'))) {
      return;
    }

    await withTempDb('sdk-sqlite-vector-', async (dbPath) => {
      let db: DatabaseInterface | undefined;

      try {
        db = await getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { vector: { quantization: 'turbo4' } },
        });

        const vector = db.vector;
        expect(vector).toBeDefined();
        if (!vector) {
          throw new Error('SQLite vector capability was not exposed');
        }

        await db.execute`
          CREATE TABLE documents (
            id TEXT PRIMARY KEY,
            content TEXT,
            category TEXT
          )
        `;

        await vector.ensureColumn('documents', 'embedding', 3);
        await db.insert('documents', [
          { id: 'a', content: 'apple', category: 'fruit' },
          { id: 'b', content: 'banana', category: 'fruit' },
          { id: 'c', content: 'carrot', category: 'vegetable' },
        ]);
        await vector.upsertVector(
          'documents',
          { id: 'a' },
          'embedding',
          [0.9, 0.1, 0.0],
        );
        await vector.upsertVector(
          'documents',
          { id: 'b' },
          'embedding',
          [0.1, 0.9, 0.0],
        );
        await vector.upsertVector(
          'documents',
          { id: 'c' },
          'embedding',
          [0.0, 0.1, 0.9],
        );

        const ranked = await vector.search(
          'documents',
          'embedding',
          [1, 0, 0],
          { limit: 3, metric: 'cosine' },
        );
        expect(ranked).toHaveLength(3);
        expect(ranked[0].id).toBe('a');

        const filtered = await vector.search(
          'documents',
          'embedding',
          [1, 0, 0],
          { limit: 10, where: 'category = $2', params: ['fruit'] },
        );
        expect(filtered).toHaveLength(2);
        expect(filtered.every((row) => row.category === 'fruit')).toBe(true);

        for (const metric of ['l2', 'ip'] as const) {
          const metricResults = await vector.search(
            'documents',
            'embedding',
            [1, 0, 0],
            { limit: 3, metric },
          );
          expect(metricResults).toHaveLength(3);
          expect(metricResults[0].id).toBe('a');
        }

        await vector.ensureIndex('documents', 'embedding', {
          dimensions: 3,
          metric: 'cosine',
        });
        await vector.ensureIndex('documents', 'embedding', {
          dimensions: 3,
          metric: 'cosine',
        });

        const indexed = await vector.search(
          'documents',
          'embedding',
          [1, 0, 0],
          { limit: 1, metric: 'cosine' },
        );
        expect(indexed).toHaveLength(1);
        expect(indexed[0].id).toBe('a');

        const indexedFiltered = await vector.search(
          'documents',
          'embedding',
          [1, 0, 0],
          {
            limit: 10,
            metric: 'cosine',
            where: 'category = $2',
            params: ['fruit'],
          },
        );
        expect(indexedFiltered).toHaveLength(2);
        expect(indexedFiltered.every((row) => row.category === 'fruit')).toBe(
          true,
        );
      } finally {
        await closeDb(db);
      }
    });
  });

  it('supports Honker notifications when the optional package is installed', async () => {
    if (!(await optionalPackageAvailable('@russellthehippo/honker-node'))) {
      return;
    }

    await withTempDb('sdk-sqlite-honker-', async (dbPath) => {
      let db: DatabaseInterface | undefined;

      try {
        db = await getDatabase({
          type: 'sqlite',
          url: dbPath,
          capabilities: { notifications: true },
        });

        const notifications = db.notifications;
        expect(notifications).toBeDefined();
        if (!notifications) {
          throw new Error('SQLite notification capability was not exposed');
        }

        const listener = notifications.listen('jobs') as AsyncIterable<{
          payload: any;
        }> & { close?: () => void };
        const iterator = listener[Symbol.asyncIterator]();
        const notification = iterator.next();

        const id = await notifications.notify('jobs', { id: 'job-1' });
        expect(id).toBeGreaterThan(0);

        const received = await Promise.race([
          notification,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Notification timed out')), 3000),
          ),
        ]);
        const payload =
          typeof received.value.payload === 'string'
            ? JSON.parse(received.value.payload)
            : received.value.payload;
        expect(payload).toEqual({ id: 'job-1' });
        listener.close?.();

        await db.execute`CREATE TABLE updates (id TEXT PRIMARY KEY)`;
        const wait = notifications.waitForUpdate({ timeoutMs: 3000 });
        await db.insert('updates', { id: 'changed' });
        await expect(wait).resolves.toBe(true);

        await expect(notifications.prune({ maxKeep: 0 })).resolves.toEqual(
          expect.any(Number),
        );
      } finally {
        await closeDb(db);
      }
    });
  });
});
