import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { serializeDuckDBStatements } from './shared/duckdb-statement-queue';
import type { DatabaseInterface } from './shared/types';

/**
 * Issue #1231 — the DuckDB and JSON adapters drive one `DuckDBConnection` per
 * handle and serialized only transactions. `@duckdb/node-api` cannot hold two
 * statements in flight on one connection: the earlier is invalidated and
 * rejects with a bare `Failed to execute prepared statement`. Any two
 * overlapping `db.*` calls could abort each other, with or without a
 * transaction, at roughly 0.1–0.5% per pair under contention.
 */
describe('serializeDuckDBStatements', () => {
  function fakeConnection() {
    let inFlight = 0;
    let maxInFlight = 0;
    const order: string[] = [];
    const step = async (label: string, fail = false) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(`start ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      order.push(`end ${label}`);
      inFlight -= 1;
      if (fail) throw new Error(`boom ${label}`);
      return label;
    };
    return {
      connection: {
        run: (label: string, fail?: boolean) => step(`run:${label}`, fail),
        runAndReadAll: (label: string) => step(`read:${label}`),
      },
      order,
      maxInFlight: () => maxInFlight,
    };
  }

  it('runs one statement at a time in call order', async () => {
    const fake = fakeConnection();
    const conn = serializeDuckDBStatements(fake.connection);
    const results = await Promise.all([
      conn.run('a'),
      conn.runAndReadAll('b'),
      conn.run('c'),
    ]);
    expect(results).toEqual(['run:a', 'read:b', 'run:c']);
    expect(fake.maxInFlight()).toBe(1);
    expect(fake.order).toEqual([
      'start run:a',
      'end run:a',
      'start read:b',
      'end read:b',
      'start run:c',
      'end run:c',
    ]);
  });

  it('keeps the queue moving after a statement fails', async () => {
    const fake = fakeConnection();
    const conn = serializeDuckDBStatements(fake.connection);
    const results = await Promise.allSettled([
      conn.run('a', true),
      conn.run('b'),
    ]);
    expect(results[0]).toMatchObject({ status: 'rejected' });
    expect(results[1]).toEqual({ status: 'fulfilled', value: 'run:b' });
    expect(fake.maxInFlight()).toBe(1);
  });

  it('serializes the connection in place for callers that wrap client.run', async () => {
    const fake = fakeConnection();
    const conn = serializeDuckDBStatements(fake.connection);
    expect(conn).toBe(fake.connection);
    // A caller-installed wrapper delegating to the captured method must reach
    // the queue exactly once, not wait behind its own turn.
    const captured = conn.run.bind(conn);
    conn.run = async (label: string, fail?: boolean) =>
      captured(`wrapped-${label}`, fail);
    await expect(
      Promise.all([conn.run('a'), conn.runAndReadAll('b')]),
    ).resolves.toEqual(['run:wrapped-a', 'read:b']);
    expect(fake.maxInFlight()).toBe(1);
  });
});

describe.each([
  'duckdb',
  'json',
] as const)('%s adapter overlapping statements (#1231)', (type) => {
  let dir: string;
  let db: DatabaseInterface;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), `hv-sql-${type}-overlap-`));
    db =
      type === 'duckdb'
        ? await getDatabase({ type, url: ':memory:', dataDir: dir })
        : await getDatabase({ type, url: dir });
    await db.query('CREATE TABLE overlap (id VARCHAR PRIMARY KEY, n INTEGER)');
    await db.query("INSERT INTO overlap VALUES ('x', 1)");
  });

  afterAll(async () => {
    await db.close?.();
    await rm(dir, { recursive: true, force: true });
  });

  // Unserialized, 1500 rounds of six overlapping prepared statements reliably
  // aborted several (6–14 per run locally); serialized, none may fail.
  it('never aborts concurrent prepared statements on the shared connection', async () => {
    const failures: string[] = [];
    for (let round = 0; round < 1500; round += 1) {
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) =>
          i % 2
            ? db.query(
                'INSERT INTO overlap VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET n = overlap.n + 1',
                `r${i}`,
                1,
              )
            : db.query('SELECT n FROM overlap WHERE id = ?', 'x'),
        ),
      );
      for (const result of results)
        if (result.status === 'rejected')
          failures.push(String(result.reason?.message ?? result.reason));
    }
    expect(failures).toEqual([]);
  });

  it('keeps a transaction body intact beside overlapping top-level reads', async () => {
    const failures: string[] = [];
    for (let round = 0; round < 300; round += 1) {
      const transaction = db.transaction?.(async (tx) => {
        await tx.query(
          'INSERT INTO overlap VALUES (?, ?) ON CONFLICT (id) DO NOTHING',
          `t${round}`,
          1,
        );
        await new Promise((resolve) => setImmediate(resolve));
        await tx.query(
          'UPDATE overlap SET n = n + 1 WHERE id = ?',
          `t${round}`,
        );
      });
      const results = await Promise.allSettled([
        transaction,
        ...Array.from({ length: 4 }, () =>
          db.query('SELECT n FROM overlap WHERE id = ?', 'x'),
        ),
      ]);
      for (const result of results)
        if (result.status === 'rejected')
          failures.push(String(result.reason?.message ?? result.reason));
    }
    expect(failures).toEqual([]);
    const committed = await db.query(
      "SELECT count(*)::INTEGER AS c FROM overlap WHERE id LIKE 't%' AND n = 2",
    );
    expect(Number(committed.rows[0]?.c)).toBe(300);
  });
});
