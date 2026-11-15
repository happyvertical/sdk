import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface, ReopenOptions } from './shared/types';

function postgresTestOptions(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    ...overrides,
  };
}

async function connect(): Promise<DatabaseInterface | undefined> {
  try {
    const db = await getDatabase(
      postgresTestOptions({ dbid: randomUUID(), max: 12 }),
    );
    await db.execute`SELECT 1`;
    return db;
  } catch {
    return undefined;
  }
}

describe('postgres engine and reopenOptions', () => {
  it('reports the engine and reopens an independent small pool', async () => {
    const db = await connect();
    if (!db) {
      console.log('PostgreSQL not available, skipping test');
      return;
    }
    let second: DatabaseInterface | undefined;
    try {
      expect(db.engine).toBe('postgres');
      const options = db.reopenOptions?.();
      expect(structuredClone(options)).toEqual(options);
      expect(options).toMatchObject({ type: 'postgres', cache: false });
      // Reopened pools are small by default; the caller can override `max`.
      expect(options).toMatchObject({ max: 5 });

      second = await getDatabase(options as ReopenOptions);
      expect(second).not.toBe(db);
      expect(second.engine).toBe('postgres');
      const name = async (connection: DatabaseInterface) =>
        (await connection.query('SELECT current_database() AS name')).rows[0]
          ?.name;
      expect(await name(second)).toBe(await name(db));

      // Closing the reopened pool leaves the original usable.
      await second.client.end();
      second = undefined;
      await db.execute`SELECT 1`;

      const tx = await db.beginTransaction?.();
      expect(tx?.engine).toBe('postgres');
      await tx?.rollback();
    } finally {
      await second?.client.end().catch(() => {});
      await db.client.end();
    }
  });
});
