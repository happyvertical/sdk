import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

const endpoints = [
  ['HTTP', process.env.SDK_TEST_SQLITE_HTTP_URL],
  ['libsql', process.env.SDK_TEST_SQLITE_LIBSQL_URL],
] as const;

for (const [transport, url] of endpoints) {
  describe.skipIf(!url)(`remote SQLite transactions (${transport})`, () => {
    let db: DatabaseInterface;
    let observer: DatabaseInterface;
    let table: string;

    beforeEach(async () => {
      const options = {
        type: 'sqlite' as const,
        url,
        authToken: process.env.SDK_TEST_SQLITE_AUTH_TOKEN,
        cache: false,
      };
      table = `sdk_tx_${randomUUID().replaceAll('-', '')}`;
      db = await getDatabase(options);
      observer = await getDatabase(options);
      await db.query(
        `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, value TEXT NOT NULL)`,
      );
    });

    afterEach(async () => {
      try {
        await observer?.query(`DROP TABLE IF EXISTS ${table}`);
      } finally {
        await Promise.all([db?.close?.(), observer?.close?.()]);
      }
    });

    const ids = async () =>
      (await observer.query(`SELECT id FROM ${table} ORDER BY id`)).rows.map(
        ({ id }) => id,
      );

    it('rolls back a callback failure without replacing the original error', async () => {
      const sentinel = new Error('abort');
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(table, { id: 1, value: 'uncommitted' });
          expect(await ids()).toEqual([]);
          throw sentinel;
        }),
      ).rejects.toBe(sentinel);
      expect(await ids()).toEqual([]);
    });

    it('commits the callback result and runs CRUD and parameterized SQL on the same transaction', async () => {
      const hostile = "'; DROP TABLE anything; --";
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(table, { id: 1, value: hostile });
          expect(await tx.get(table, { id: 1, value: hostile })).toMatchObject({
            value: hostile,
          });
          await tx.update(table, { id: 1 }, { value: 'updated' });
          await tx.query(
            `UPDATE ${table} SET value = ? WHERE id = $2 AND value = $3`,
            'changed',
            1,
            'updated',
          );
          await tx.insert(table, { id: 2, value: 'to delete' });
          expect(await tx.count(table, { 'id in': [1, 2] })).toBe(2);
          await tx.delete(table, { id: 2, value: 'to delete' });
          expect(
            (
              await tx.query(
                `SELECT value, $2 AS second, '$1' AS literal, $2 AS repeated
                FROM ${table} WHERE id = $1 /* $3 */`,
                [1, hostile],
              )
            ).rows,
          ).toEqual([
            {
              value: 'changed',
              second: hostile,
              literal: '$1',
              repeated: hostile,
            },
          ]);
          expect(
            (
              await tx.client.execute({
                sql: `SELECT value FROM ${table} WHERE id = :id`,
                args: { id: 1 },
              })
            ).rows,
          ).toEqual([{ value: 'changed' }]);
          expect(
            (await tx.client.execute('SELECT ? AS value', [hostile])).rows,
          ).toEqual([{ value: hostile }]);
          await expect(tx.client.execute('ROLLBACK')).rejects.toThrow(
            /transaction-control sql/i,
          );
          await expect(
            db.client.batch([`INSERT INTO ${table} VALUES (3, 'outside')`]),
          ).rejects.toThrow(/root SQLite database/i);
          return 'committed';
        }),
      ).resolves.toBe('committed');
      expect(await ids()).toEqual([1]);
      expect(
        (await db.client.execute('SELECT $1 AS value', [hostile])).rows,
      ).toEqual([{ value: hostile }]);
      expect((await db.client.batch(['SELECT 1 AS value']))[0].rows).toEqual([
        { value: 1 },
      ]);
      expect(await observer.list(table, { id: 1 })).toEqual([
        { id: 1, value: 'changed' },
      ]);
    });

    it('keeps nested savepoints within the manual transaction and seals ended scopes', async () => {
      const tx = await db.beginTransaction();
      try {
        await tx.insert(table, { id: 1, value: 'parent' });
        const sentinel = new Error('abort savepoint');
        await expect(
          tx.transaction(async (child) => {
            await child.insert(table, { id: 2, value: 'rolled back' });
            throw sentinel;
          }),
        ).rejects.toBe(sentinel);
        const child = await tx.transaction(async (nested) => {
          await nested.insert(table, { id: 3, value: 'committed' });
          return nested;
        });
        await expect(
          child.insert(table, { id: 4, value: 'stale' }),
        ).rejects.toThrow(/ended/);
        await expect(
          child.client.execute(`INSERT INTO ${table} VALUES (4, 'stale')`),
        ).rejects.toThrow(/ended/);
        expect(await ids()).toEqual([]);
        await tx.commit();
        await expect(tx.query(`SELECT * FROM ${table}`)).rejects.toThrow(
          /ended/,
        );
        expect(await ids()).toEqual([1, 3]);
      } finally {
        if (tx.isActive()) await tx.rollback();
      }

      const rolledBack = await db.beginTransaction();
      try {
        await rolledBack.transaction(async (child) => {
          await child.insert(table, {
            id: 5,
            value: 'child of rolled back parent',
          });
        });
        await rolledBack.rollback();
        expect(await ids()).toEqual([1, 3]);
      } finally {
        if (rolledBack.isActive()) await rolledBack.rollback();
      }
    });

    it('queues root work, skips expired entries, and drains accepted work', async () => {
      const shortQueue = await getDatabase({
        type: 'sqlite',
        url,
        authToken: process.env.SDK_TEST_SQLITE_AUTH_TOKEN,
        cache: false,
        transactionQueueTimeout: 100,
      });
      try {
        const tx = await shortQueue.beginTransaction();
        try {
          const accepted = tx.transaction(async (child) => {
            await child.insert(table, { id: 1, value: 'accepted' });
          });
          await expect(
            shortQueue.insert(table, { id: 2, value: 'expired' }),
          ).rejects.toThrow(/timed out/i);
          await tx.commit();
          await accepted;
          await shortQueue.insert(table, { id: 3, value: 'resumed' });
          expect(await ids()).toEqual([1, 3]);
        } finally {
          if (tx.isActive()) await tx.rollback();
        }
      } finally {
        await shortQueue.close?.();
      }
    });

    it('serializes competing independent writes without replaying a callback', async () => {
      await db.insert(table, { id: 1, value: 'start' });
      const holder = await db.beginTransaction();
      try {
        await holder.update(table, { id: 1 }, { value: 'first' });
        expect(await observer.get(table, { id: 1 })).toMatchObject({
          value: 'start',
        });
        let callbackRuns = 0;
        const competing = observer.transaction(async (tx) => {
          callbackRuns++;
          const current = await tx.get(table, { id: 1 });
          expect(current?.value).toBe('first');
          await tx.update(table, { id: 1 }, { value: 'second' });
        });
        // Attach a handler before allowing the independent write acquisition
        // to overlap the holder. A failure is still asserted after commit.
        void competing.catch(() => {});
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        expect(callbackRuns).toBe(0);
        await holder.commit();
        await competing;
        expect(callbackRuns).toBe(1);
        expect(await db.get(table, { id: 1 })).toMatchObject({
          value: 'second',
        });
      } finally {
        if (holder.isActive()) await holder.rollback();
      }
    });

    it('continues after an ordinary constraint error if the callback handles it', async () => {
      await db.transaction(async (tx) => {
        await tx.insert(table, { id: 1, value: 'first' });
        await expect(
          tx.query(`INSERT INTO ${table} VALUES (?, ?)`, 1, 'duplicate'),
        ).rejects.toMatchObject({ cause: { code: 'SQLITE_CONSTRAINT' } });
        await tx.insert(table, { id: 2, value: 'second' });
      });
      expect(await ids()).toEqual([1, 2]);
    });

    it('rejects later writes and commit if a statement rolls back the transaction', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(table, { id: 1, value: 'first' });
          await expect(
            tx.query(
              `INSERT OR ROLLBACK INTO ${table} VALUES (?, ?)`,
              1,
              'duplicate',
            ),
          ).rejects.toMatchObject({ cause: { code: 'SQLITE_CONSTRAINT' } });
          await expect(
            tx.client.execute({
              sql: `INSERT INTO ${table} VALUES (?, ?)`,
              args: [2, 'must not autocommit'],
            }),
          ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' });
        }),
      ).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT' });
      expect(await ids()).toEqual([]);
      await db.transaction(async (tx) => {
        await tx.insert(table, { id: 3, value: 'fresh transaction' });
      });
      expect(await ids()).toEqual([3]);
    });

    it('rolls back a query error and retains the driver cause', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.insert(table, { id: 1, value: 'uncommitted' });
          await tx.query('SELECT * FROM no_such_sdk_1487_table');
        }),
      ).rejects.toMatchObject({
        cause: { message: expect.stringContaining('no_such_sdk_1487_table') },
      });
      expect(await ids()).toEqual([]);
    });
  });
}
