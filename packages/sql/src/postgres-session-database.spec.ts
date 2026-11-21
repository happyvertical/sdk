import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONNECTION_AFFINITY,
  type ConnectionAffinityClaim,
  type DatabaseInterface,
  getConnectionAffinity,
  getDatabase,
  type SessionHandle,
} from './index';

/**
 * `SessionHandle.database()` on a real PostgreSQL server (#1567): a
 * root-shaped database bound to the session's one pinned connection.
 *
 * Runs in `test:postgres`. Without a reachable server the suite is skipped,
 * except under the CI runner (`TEST_DB_ADAPTER=postgres`), where an
 * unreachable server is a failure rather than a silent pass.
 */

function options(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    dbid: randomUUID(),
    ...overrides,
  };
}

async function postgresReachable(): Promise<boolean> {
  try {
    const probe = await getDatabase(options({ max: 1 }));
    try {
      await probe.query('SELECT 1');
    } finally {
      await probe.close?.();
    }
    return true;
  } catch {
    return false;
  }
}

const available = await postgresReachable();
if (!available && process.env.TEST_DB_ADAPTER === 'postgres') {
  throw new Error('test:postgres requires a reachable PostgreSQL server');
}

const opened: DatabaseInterface[] = [];
const sessions: SessionHandle[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.release().catch(() => {});
  }
  for (const db of opened.splice(0)) await db.close?.().catch(() => {});
});

async function open(overrides: Record<string, unknown> = {}) {
  const db = await getDatabase(options(overrides));
  opened.push(db);
  return db;
}

async function pin(db: DatabaseInterface) {
  const session = await db.acquireSession?.();
  if (!session) throw new Error('adapter does not expose acquireSession()');
  sessions.push(session);
  const pinned = session.database?.();
  if (!pinned) throw new Error('session does not expose database()');
  return { session, pinned };
}

const pidOf = async (db: Pick<DatabaseInterface, 'query'>) =>
  Number((await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);

const tableName = (prefix: string) =>
  `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

/**
 * Asserts a rejection whose message, or the message or `originalError` of an
 * error in its `cause` chain, matches `pattern`. Record and template methods
 * wrap the underlying failure with their own message, as on the root handle.
 */
async function rejectsWith(
  promise: Promise<unknown> | undefined,
  pattern: RegExp,
): Promise<void> {
  const error = await Promise.resolve(promise).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'expected a rejection').toBeInstanceOf(Error);
  const messages: string[] = [];
  for (
    let current: unknown = error;
    current instanceof Error && messages.length < 10;
    current = current.cause
  ) {
    messages.push(current.message);
    const original = (current as { context?: { originalError?: unknown } })
      .context?.originalError;
    if (typeof original === 'string') messages.push(original);
  }
  expect(
    messages.some((message) => pattern.test(message)),
    messages.join(' <- '),
  ).toBe(true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => Promise<boolean> | boolean, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(`condition not met within ${ms}ms`);
}

describe.skipIf(!available)('SessionHandle.database() on PostgreSQL', () => {
  it('runs queries, transactions, savepoints and introspection on the session backend only', async () => {
    // A pool of one: the session takes the only connection, so any statement
    // that reached for the pool would time out instead of succeeding.
    const db = await open({ max: 1, connectionTimeoutMillis: 2_000 });
    const { session, pinned } = await pin(db);
    const sessionPid = await pidOf(session);
    const table = tableName('sessdb');

    expect(pinned.engine).toBe('postgres');
    expect(pinned.url).toBe(db.url);
    expect(session.database?.()).toBe(pinned);
    expect(pinned.acquireSession).toBeUndefined();
    expect(pinned.reopenOptions).toBeUndefined();
    expect(pinned.close).toBeUndefined();

    expect(await pidOf(pinned)).toBe(sessionPid);
    await pinned.query(
      `CREATE TABLE ${table} (id int PRIMARY KEY, label text, tag text)`,
    );

    const pids = await pinned.transaction?.(async (tx) => {
      const outer = await pidOf(tx);
      await tx.insert(table, { id: 1, label: 'kept' });
      const inner = await tx.transaction?.(async (nested) => {
        await nested.insert(table, { id: 2, label: 'kept too' });
        return pidOf(nested);
      });
      // A failed savepoint rolls back only its own work, as on the root.
      await expect(
        tx.transaction?.(async (nested) => {
          await nested.insert(table, { id: 3, label: 'discarded' });
          throw new Error('discard savepoint');
        }),
      ).rejects.toThrow('discard savepoint');
      return [outer, inner];
    });
    expect(pids).toEqual([sessionPid, sessionPid]);

    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    expect(await pidOf(handle)).toBe(sessionPid);
    await handle.insert(table, { id: 4, label: 'handle' });
    await handle.commit();

    // An upsert on a non-NULL conflict key runs on the session.
    await pinned.upsert(table, ['id'], { id: 5, tag: null, label: 'u' });

    await pinned.alterTable?.addColumn(table, {
      name: 'extra',
      type: 'TEXT',
    } as never);
    const schema = await pinned.getTableSchema?.(table);
    expect(Object.keys(schema?.columns ?? {})).toContain('extra');
    expect(await pinned.tableExists(table)).toBe(true);

    const ids = (await pinned.list(table, {})).map((row) => row.id).sort();
    expect(ids).toEqual([1, 2, 4, 5]);
    expect(await pidOf(pinned)).toBe(sessionPid);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('leaves the root handle on its own pool connections', async () => {
    const db = await open({ max: 3 });
    const { session, pinned } = await pin(db);
    const sessionPid = await pidOf(session);

    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    try {
      // The root handle is not held up by the session's open transaction.
      expect(await pidOf(db)).not.toBe(sessionPid);
      await db.transaction?.(async (tx) => {
        expect(await pidOf(tx)).not.toBe(sessionPid);
      });
    } finally {
      await handle.rollback();
    }

    await session.release();
    expect((await db.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });

  it('rejects every call after release', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('sessrel');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    await session.release();

    const released = /Session has been released/;
    await rejectsWith(pinned.query('SELECT 1'), released);
    await rejectsWith(pinned.many`SELECT 1`, released);
    await rejectsWith(pinned.list(table, {}), released);
    await rejectsWith(pinned.table(table).list({}), released);
    await rejectsWith(pinned.tableExists(table), released);
    await rejectsWith(pinned.getTableSchema?.(table), released);
    await rejectsWith(pinned.beginTransaction?.(), released);
    await rejectsWith(
      pinned.transaction?.(async () => 1),
      released,
    );
    await rejectsWith(pinned.client.query('SELECT 1'), released);

    await db.query(`DROP TABLE ${table}`);
  });

  it('rejects every call, without reconnecting, after its backend is terminated', async () => {
    const db = await open({ max: 3 });
    const { session, pinned } = await pin(db);
    const sessionPid = await pidOf(pinned);
    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');

    await db.query('SELECT pg_terminate_backend($1)', [sessionPid]);
    await waitFor(() => !session.isActive());

    await expect(handle.query('SELECT 1')).rejects.toThrow();
    await expect(handle.commit()).rejects.toThrow();
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(pinned.query('SELECT 1')).rejects.toThrow(
        /Session connection was lost/,
      );
      await expect(pinned.transaction?.(async () => 1)).rejects.toThrow(
        /Session connection was lost/,
      );
    }
    // The root handle carries on.
    expect((await db.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });

  it('runs concurrent calls one at a time in issue order, without the driver queue', async () => {
    const warnings: string[] = [];
    const onWarning = (warning: Error) => warnings.push(warning.message);
    process.on('warning', onWarning);
    try {
      const db = await open({ max: 2 });
      const { pinned } = await pin(db);
      const table = tableName('sessfifo');
      await pinned.query(`CREATE TABLE ${table} (seq serial, n int)`);

      const issued = Array.from({ length: 12 }, (_, n) => n);
      const results = await Promise.all(
        issued.map((n) =>
          pinned.query(`INSERT INTO ${table} (n) VALUES ($1) RETURNING seq`, [
            n,
          ]),
        ),
      );
      const seqs = results.map((result) => Number(result.rows[0].seq));
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

      await pinned.transaction?.(async (tx) => {
        await Promise.all(
          issued.map((n) =>
            tx.query(`INSERT INTO ${table} (n) VALUES ($1)`, [100 + n]),
          ),
        );
      });
      const rows = await pinned.query(
        `SELECT n FROM ${table} WHERE n >= 100 ORDER BY seq`,
      );
      expect(rows.rows.map((row) => row.n)).toEqual(issued.map((n) => 100 + n));
      await pinned.query(`DROP TABLE ${table}`);
      await sleep(10);
    } finally {
      process.off('warning', onWarning);
    }
    expect(warnings.filter((m) => m.includes('already executing'))).toEqual([]);
  });

  it('holds a plain call made outside an open transaction until it ends', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('sesswait');
    await pinned.query(`CREATE TABLE ${table} (id int)`);

    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    await handle.insert(table, { id: 1 });

    let settled = false;
    const waiting = pinned
      .query(`SELECT count(*)::int AS n FROM ${table}`)
      .finally(() => {
        settled = true;
      });
    await sleep(200);
    expect(settled).toBe(false);

    await handle.insert(table, { id: 2 });
    await handle.commit();
    // It ran after COMMIT, outside the transaction, and saw both rows.
    expect((await waiting).rows[0].n).toBe(2);

    // A second top-level transaction queues behind an open one.
    const order: string[] = [];
    const first = pinned.transaction?.(async (tx) => {
      await sleep(100);
      await tx.query('SELECT 1');
      order.push('first');
    });
    const second = pinned.transaction?.(async () => {
      order.push('second');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('refuses a call on the session database from inside its own transaction callback', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('sessself');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    const ownCallback = /inside its own transaction callback/;

    await pinned.transaction?.(async (tx) => {
      await tx.insert(table, { id: 1 });
      const started = Date.now();
      await rejectsWith(pinned.query('SELECT 1'), ownCallback);
      await rejectsWith(pinned.list(table, {}), ownCallback);
      await rejectsWith(
        pinned.transaction?.(async () => 1),
        ownCallback,
      );
      await rejectsWith(pinned.beginTransaction?.(), ownCallback);
      expect(Date.now() - started).toBeLessThan(1_000);
      // The refusals sent nothing, so the transaction is still committable.
      await tx.insert(table, { id: 2 });
    });

    const rows = await pinned.list(table, {});
    expect(rows.map((row) => row.id).sort()).toEqual([1, 2]);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('rejects COMMIT of an aborted transaction', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('sessabort');
    await pinned.query(`CREATE TABLE ${table} (id int)`);

    // A statement failure the transaction saw and the caller swallowed.
    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    await handle.insert(table, { id: 1 });
    await handle.query('SELECT 1/0').catch(() => {});
    await expect(handle.commit()).rejects.toThrow();

    // An abort the transaction never saw (issued through session.query, which
    // shares the connection): only COMMIT's command tag reveals it.
    const blind = await pinned.beginTransaction?.();
    if (!blind) throw new Error('no beginTransaction');
    await blind.insert(table, { id: 2 });
    await session.query('SELECT 1/0').catch(() => {});
    const commitError = await blind.commit().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(commitError).toBeInstanceOf(DatabaseError);
    expect((commitError as Error).message).toMatch(/rolled back/);

    await expect(
      pinned.transaction?.(async (tx) => {
        await tx.insert(table, { id: 3 });
        await session.query('SELECT 1/0').catch(() => {});
      }),
    ).rejects.toThrow(/rolled back/);

    expect(await pinned.list(table, {})).toEqual([]);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('stamps every handle with a connection-affinity claim that only that object satisfies', async () => {
    const db = await open({ max: 3 });
    const { pinned } = await pin(db);
    const kinds: Array<[string, unknown]> = [];
    const record = (label: string, handle: object) => {
      const raw = (handle as Record<symbol, unknown>)[CONNECTION_AFFINITY] as
        | ConnectionAffinityClaim
        | undefined;
      expect(raw, label).toBeDefined();
      expect(Object.isFrozen(raw), label).toBe(true);
      expect(raw?.handle, label).toBe(handle);
      expect(Object.keys(handle), label).not.toContain(
        String(CONNECTION_AFFINITY),
      );
      expect(
        Object.getOwnPropertyDescriptor(handle, CONNECTION_AFFINITY)
          ?.enumerable,
        label,
      ).toBe(false);
      kinds.push([label, getConnectionAffinity(handle)?.kind]);
    };

    record('pool', db);
    record('session', pinned);
    await db.transaction?.(async (tx) => {
      record('pool transaction', tx);
      await tx.transaction?.(async (nested) => {
        record('pool savepoint', nested);
      });
    });
    const poolHandle = await db.beginTransaction?.();
    if (!poolHandle) throw new Error('no beginTransaction');
    record('pool beginTransaction', poolHandle);
    await poolHandle.rollback();
    await pinned.transaction?.(async (tx) => {
      record('session transaction', tx);
      await tx.transaction?.(async (nested) => {
        record('session savepoint', nested);
      });
    });
    const sessionHandle = await pinned.beginTransaction?.();
    if (!sessionHandle) throw new Error('no beginTransaction');
    record('session beginTransaction', sessionHandle);
    await sessionHandle.rollback();

    expect(kinds).toEqual([
      ['pool', 'pool'],
      ['session', 'session'],
      ['pool transaction', 'transaction'],
      ['pool savepoint', 'transaction'],
      ['pool beginTransaction', 'transaction'],
      ['session transaction', 'transaction'],
      ['session savepoint', 'transaction'],
      ['session beginTransaction', 'transaction'],
    ]);

    // A spread copy carries no claim; a proxy reads one naming its target.
    const spread = { ...pinned };
    expect(getConnectionAffinity(spread)).toBeUndefined();
    expect(
      (spread as Record<symbol, unknown>)[CONNECTION_AFFINITY],
    ).toBeUndefined();
    const proxy = new Proxy(pinned, {});
    const proxied = (proxy as Record<symbol, unknown>)[
      CONNECTION_AFFINITY
    ] as ConnectionAffinityClaim;
    expect(proxied.handle === proxy).toBe(false);
    expect(getConnectionAffinity(proxy)).toBeUndefined();
  });

  it('destroy() discards the session at once, even with a statement in flight', async () => {
    const db = await open({ max: 3 });
    const { session, pinned } = await pin(db);
    const lockKey = 735_118_204;
    if (!session.destroy) throw new Error('session does not expose destroy()');

    await pinned.query('SELECT pg_advisory_lock($1)', [lockKey]);
    // Lets the stalled backend notice the closed socket mid-statement.
    await pinned.query("SET client_connection_check_interval = '100ms'");
    const stalled = pinned.query('SELECT pg_sleep(60)').then(
      () => 'resolved',
      () => 'rejected',
    );
    const queued = pinned.query('SELECT 1').then(
      () => 'resolved',
      () => 'rejected',
    );
    await sleep(200);
    // release() queues behind the stalled statement; destroy() does not.
    const releasing = session.release();

    const started = Date.now();
    session.destroy();
    expect(Date.now() - started).toBeLessThan(100);
    session.destroy();

    expect(await stalled).toBe('rejected');
    expect(await queued).toBe('rejected');
    await releasing;
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(session.isActive()).toBe(false);
    await expect(pinned.query('SELECT 1')).rejects.toThrow(
      /Session has been released/,
    );
    await expect(session.query('SELECT 1')).rejects.toThrow(
      /Session has been released/,
    );

    // The server ends the backend, which frees its advisory lock.
    const other = await pin(db);
    await waitFor(async () => {
      const got = await other.session.query(
        'SELECT pg_try_advisory_lock($1) AS got',
        lockKey,
      );
      return got.rows[0].got === true;
    });
    expect((await db.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });
});

/** Settles to the promise's outcome, or to 'timeout' after `ms`. */
async function within<T>(
  promise: Promise<T> | undefined,
  ms: number,
): Promise<{ value?: T; error?: unknown } | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = Promise.resolve(promise).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([outcome, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const ownCallback = /inside its own transaction callback/;

/**
 * Records every statement handed to a node-postgres client (text, time, and
 * the client object) until `restore()`.
 */
function recordSubmissions() {
  const entries: Array<{ sql: string; at: number; client: unknown }> = [];
  const prototype = pg.Client.prototype as unknown as {
    query: (...args: unknown[]) => unknown;
  };
  const original = prototype.query;
  prototype.query = function (this: unknown, ...args: unknown[]) {
    const config = args[0] as string | { text?: string } | undefined;
    entries.push({
      sql: typeof config === 'string' ? config : (config?.text ?? ''),
      at: Date.now(),
      client: this,
    });
    return Reflect.apply(original, this, args);
  };
  return Object.assign(entries, {
    restore: () => {
      prototype.query = original;
    },
  });
}

const catalogProbe = /pg_index|server_version_num/;

describe.skipIf(!available)('SessionHandle.database() review round 1', () => {
  it('refuses a NULL-key upsert without nullsDistinct on database() and its transactions, and sends nothing for it', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('nullkey');
    await pinned.query(
      `CREATE TABLE ${table} (id int, tag text, label text, UNIQUE (id, tag))`,
    );
    // The advice keeps lock-dependent work on the pinned handle.
    const refusal =
      /nullsDistinct: true.*query\(\) on this handle.*depends on this session’s lock must stay on this handle/;
    const submitted = recordSubmissions();
    try {
      await rejectsWith(
        pinned.upsert(table, ['id', 'tag'], { id: 1, tag: null, label: 'a' }),
        refusal,
      );
      await pinned.transaction?.(async (tx) => {
        await rejectsWith(
          tx.upsert(table, ['id', 'tag'], { id: 2, tag: null, label: 'b' }),
          refusal,
        );
      });
      const handle = await pinned.beginTransaction?.();
      if (!handle) throw new Error('no beginTransaction');
      await rejectsWith(
        handle.upsert(table, ['id', 'tag'], { id: 3, tag: null, label: 'c' }),
        refusal,
      );
      await handle.rollback();
    } finally {
      submitted.restore();
    }
    expect(
      submitted
        .filter((entry) => catalogProbe.test(entry.sql))
        .map((e) => e.sql),
    ).toEqual([]);
    expect(await pinned.list(table, {})).toEqual([]);

    // Explicit nullsDistinct and non-NULL keys take the normal path.
    await pinned.upsert(
      table,
      ['id', 'tag'],
      { id: 4, tag: null, label: 'd' },
      { nullsDistinct: true },
    );
    await pinned.upsert(table, ['id', 'tag'], { id: 5, tag: 'x', label: 'e' });
    await pinned.upsert(table, ['id', 'tag'], { id: 5, tag: 'x', label: 'f' });
    await pinned.transaction?.(async (tx) => {
      await tx.upsert(
        table,
        ['id', 'tag'],
        { id: 6, tag: null, label: 'g' },
        { nullsDistinct: true },
      );
    });
    const labels = (await pinned.list(table, {}))
      .map((row) => row.label)
      .sort();
    expect(labels).toEqual(['d', 'f', 'g']);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('release() racing BEGIN never runs the callback or returns a live handle', async () => {
    for (const kind of ['transaction', 'beginTransaction'] as const) {
      const db = await open({ max: 2 });
      const { session, pinned } = await pin(db);
      let called = false;
      const pending =
        kind === 'transaction'
          ? pinned.transaction?.(async () => {
              called = true;
            })
          : pinned.beginTransaction?.();
      const releasing = session.release();
      await rejectsWith(pending, /Session has been released/);
      await releasing;
      expect(called, kind).toBe(false);
    }
  });

  it('an empty insert batch still checks the session and the callback scope', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('emptyins');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    await pinned.transaction?.(async () => {
      await rejectsWith(pinned.insert(table, []), ownCallback);
      await rejectsWith(pinned.table(table).insert([]), ownCallback);
    });
    expect(await pinned.insert(table, [])).toBeDefined();
    await pinned.query(`DROP TABLE ${table}`);
    session.destroy?.();
    await rejectsWith(pinned.insert(table, []), /Session has been released/);
    await rejectsWith(
      pinned.table(table).insert([]),
      /Session has been released/,
    );
  });

  it('schema helpers reject when their DDL was never admitted, even though DDL errors are tolerated', async () => {
    for (const helper of ['syncSchema', 'initializeSchemas'] as const) {
      const db = await open({ max: 2 });
      const { pinned } = await pin(db);
      const sequence = tableName('neveradmitted');
      const handle = await pinned.beginTransaction?.();
      if (!handle) throw new Error('no beginTransaction');
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let pending: Promise<void> | undefined;
      try {
        pending =
          helper === 'syncSchema'
            ? pinned.syncSchema?.(`CREATE SEQUENCE ${sequence}`)
            : pinned.initializeSchemas?.({
                schema: `CREATE SEQUENCE ${sequence}`,
              });
        pending?.catch(() => {});
        await vi.advanceTimersByTimeAsync(30_001);
      } finally {
        vi.useRealTimers();
      }
      await rejectsWith(pending, /Timed out/);
      await handle.rollback();
      const exists = await pinned.query(
        'SELECT count(*)::int AS n FROM pg_class WHERE relname = $1',
        [sequence],
      );
      expect(exists.rows[0].n, helper).toBe(0);
    }
  });

  it('schema helpers reject when the backend is terminated during blocked DDL', async () => {
    const db = await open({ max: 3 });
    const { pinned } = await pin(db);
    const pid = await pidOf(pinned);
    const table = tableName('blockedddl');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    const syncing = pinned.syncSchema?.(
      `CREATE INDEX ${table}_idx ON ${table} (id)`,
    );
    syncing?.catch(() => {});
    await waitFor(async () => {
      const waiting = await db.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'",
        [pid],
      );
      return waiting.rows[0].n === 1;
    });
    await db.query('SELECT pg_terminate_backend($1)', [pid]);
    await rejectsWith(syncing, /Session connection was lost/);
    await blocker.rollback();
    await db.query(`DROP TABLE ${table}`);
  });

  it('db.client on database() waits for an open transaction instead of joining it, and has only the promise form', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('rootclient');
    await pinned.query(`CREATE TABLE ${table} (id int)`);

    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    await handle.insert(table, { id: 1 });
    let settled = false;
    const outsideInsert = pinned.client
      .query(`INSERT INTO ${table} (id) VALUES (2)`)
      .finally(() => {
        settled = true;
      });
    await sleep(200);
    expect(settled).toBe(false);
    await handle.rollback();
    await outsideInsert;
    // The owner's rollback discarded only its own row.
    expect((await pinned.list(table, {})).map((row) => row.id)).toEqual([2]);

    expect(() =>
      pinned.client.query('SELECT 1', () => {
        /* callback form */
      }),
    ).toThrow(/promise/);
    await pinned.transaction?.(async (tx) => {
      await rejectsWith(pinned.client.query('SELECT 1'), ownCallback);
      expect(() => tx.client.query('SELECT 1', [], () => {})).toThrow(
        /promise/,
      );
    });
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('syncSchema and initializeSchemas run on the session and report a closed session or a self-call', async () => {
    const db = await open({ max: 1, connectionTimeoutMillis: 2_000 });
    const { session, pinned } = await pin(db);
    const table = tableName('sesssync');
    const sequence = tableName('sessseq');

    await pinned.syncSchema?.(
      `CREATE TABLE ${table} (\n  id int PRIMARY KEY\n)`,
    );
    await pinned.syncSchema?.(
      `CREATE TABLE ${table} (\n  id int PRIMARY KEY,\n  label text\n)`,
    );
    await pinned.initializeSchemas?.({
      schema: `CREATE SEQUENCE ${sequence}`,
    });
    expect(
      Object.keys((await pinned.getTableSchema?.(table))?.columns ?? {}),
    ).toEqual(expect.arrayContaining(['id', 'label']));
    const seq = await pinned.query(
      'SELECT count(*)::int AS n FROM pg_class WHERE relname = $1',
      [sequence],
    );
    expect(seq.rows[0].n).toBe(1);

    await pinned.transaction?.(async () => {
      await rejectsWith(
        pinned.syncSchema?.(`CREATE SEQUENCE ${sequence}_inner`),
        ownCallback,
      );
      await rejectsWith(
        pinned.initializeSchemas?.({
          schema: `CREATE SEQUENCE ${sequence}_inner`,
        }),
        ownCallback,
      );
    });

    await pinned.query(`DROP TABLE ${table}`);
    await pinned.query(`DROP SEQUENCE ${sequence}`);
    await session.release();
    await rejectsWith(
      pinned.syncSchema?.(`CREATE SEQUENCE ${sequence}_late`),
      /Session has been released/,
    );
    await rejectsWith(
      pinned.initializeSchemas?.({
        schema: `CREATE SEQUENCE ${sequence}_late`,
      }),
      /Session has been released/,
    );
  });

  it('initializeSchemas rejects when the backend is lost', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const pid = await pidOf(pinned);
    await db.query('SELECT pg_terminate_backend($1)', [pid]);
    await waitFor(() => !session.isActive());
    await rejectsWith(
      pinned.initializeSchemas?.({
        schema: `CREATE SEQUENCE ${tableName('lostseq')}`,
      }),
      /Session connection was lost/,
    );
  });

  it('vector capabilities run on the session connection', async () => {
    const db = await open({ max: 1, connectionTimeoutMillis: 2_000 });
    const { session, pinned } = await pin(db);
    const table = tableName('sessvec');
    await pinned.query(`CREATE TABLE ${table} (id int PRIMARY KEY)`);
    const hasVector = (
      await pinned.query(
        "SELECT count(*)::int AS n FROM pg_available_extensions WHERE name = 'vector'",
      )
    ).rows[0].n;
    const submitted = recordSubmissions();
    let outcome: Awaited<ReturnType<typeof within>>;
    try {
      await session.query('SELECT 1');
      const sessionClient = submitted.at(-1)?.client;
      outcome = await within(
        pinned.vector?.ensureColumn(table, 'embedding', 3),
        8_000,
      );
      // The extension statement was handed to the session's own client.
      const extension = submitted.find((entry) =>
        entry.sql.includes('CREATE EXTENSION'),
      );
      expect(extension?.client).toBe(sessionClient);
    } finally {
      submitted.restore();
    }
    expect(outcome).not.toBe('timeout');
    if (hasVector) {
      expect((outcome as { error?: unknown }).error).toBeUndefined();
      await pinned.query(
        `INSERT INTO ${table} (id, embedding) VALUES (1, '[1,0,0]')`,
      );
      const found = await pinned.vector?.search(table, 'embedding', [1, 0, 0], {
        limit: 1,
      });
      expect(found?.length).toBe(1);
    } else {
      // No pgvector on this server: PostgreSQL's own refusal, not a pool
      // checkout timeout.
      await rejectsWith(
        Promise.reject((outcome as { error?: unknown }).error),
        /extension "vector" is not available|could not open extension control file/,
      );
    }
    expect(await pidOf(pinned)).toBeGreaterThan(0);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('refuses a session call from a savepoint callback of a beginTransaction handle at once', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    const outcome = await within(
      handle.transaction?.(async (nested) => {
        await rejectsWith(pinned.query('SELECT 1'), ownCallback);
        await nested.query('SELECT 1');
      }),
      3_000,
    );
    expect(outcome).not.toBe('timeout');
    expect((outcome as { error?: unknown }).error).toBeUndefined();
    await handle.commit();
  });

  it('orders statements across database() and session.query by issue time, and release() waits for both', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('sessorder');
    await pinned.query(`CREATE TABLE ${table} (id int PRIMARY KEY, v int)`);
    await pinned.query(`INSERT INTO ${table} VALUES (1, 1)`);

    const write = pinned.query(`UPDATE ${table} SET v = 2 WHERE id = 1`);
    const read = session.query(`SELECT v FROM ${table} WHERE id = 1`);
    await write;
    expect((await read).rows[0].v).toBe(2);

    // Issued before release() in the same tick: both run, then release.
    const lastWrite = pinned.query(`UPDATE ${table} SET v = 3 WHERE id = 1`);
    const lastRaw = session.query(`UPDATE ${table} SET v = v + 1 WHERE id = 1`);
    const releasing = session.release();
    await lastWrite;
    await lastRaw;
    await releasing;
    expect(
      (await db.query(`SELECT v FROM ${table} WHERE id = 1`)).rows[0].v,
    ).toBe(4);
    await db.query(`DROP TABLE ${table}`);
  });

  it('holds the queue through a client-side query timeout until the server is ready, keeping the session', async () => {
    const host = process.env.SQLOO_HOST || 'localhost';
    const port = Number(process.env.SQLOO_PORT) || 5432;
    const user = encodeURIComponent(process.env.SQLOO_USER || 'postgres');
    const password = encodeURIComponent(
      process.env.SQLOO_PASSWORD || 'postgres',
    );
    const database = process.env.SQLOO_DATABASE || 'testdb';
    const db = await open({
      url: `postgresql://${user}:${password}@${host}:${port}/${database}?query_timeout=300`,
      max: 2,
    });
    const { session, pinned } = await pin(db);
    const pid = await pidOf(session);
    const submitted = recordSubmissions();
    try {
      const started = Date.now();
      // The raw session.query() contract: the timed-out call rejects and the
      // session stays usable. A database() statement queued behind it (its
      // read timeout starts when it is sent) is sent only once the timed-out
      // statement has really finished, on the same backend.
      const slow = session.query('SELECT pg_sleep(1)');
      const next = pinned.query('SELECT pg_backend_pid() AS pid');
      await rejectsWith(slow, /timeout/i);
      expect(Number((await next).rows[0].pid)).toBe(pid);
      expect(session.isActive()).toBe(true);
      const nextAt = submitted.find((entry) =>
        entry.sql.includes('pg_backend_pid'),
      )?.at;
      expect(nextAt).toBeDefined();
      expect((nextAt as number) - started).toBeGreaterThanOrEqual(900);
      expect((await session.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    } finally {
      submitted.restore();
    }
  });

  it('keeps the queue until ReadyForQuery when an ErrorResponse arrives first', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const submitted = recordSubmissions();
    try {
      await session.query('SELECT 1');
      const client = submitted.at(-1)?.client as {
        connection: { emit: (event: string, ...args: unknown[]) => boolean };
      };
      const connection = client.connection;
      const emit = connection.emit.bind(connection);
      let sawError = false;
      let delayed = false;
      connection.emit = (event: string, ...args: unknown[]) => {
        if (event === 'errorMessage') sawError = true;
        if (event === 'readyForQuery' && sawError && !delayed) {
          delayed = true;
          setTimeout(() => emit(event, ...args), 300);
          return true;
        }
        return emit(event, ...args);
      };
      try {
        const failing = pinned.query('SELECT 1/0');
        const successor = pinned.query('SELECT 2 AS two');
        await rejectsWith(failing, /division by zero/);
        const failedAt = Date.now();
        expect((await successor).rows[0].two).toBe(2);
        const successorAt = submitted.find((entry) =>
          entry.sql.includes('2 AS two'),
        )?.at as number;
        expect(successorAt - failedAt).toBeGreaterThanOrEqual(250);
      } finally {
        connection.emit = emit;
      }
    } finally {
      submitted.restore();
    }
  });

  it('rejects calls waiting behind an idle open transaction at once when the session is destroyed, released or lost', async () => {
    for (const close of ['destroy', 'release', 'terminate'] as const) {
      const db = await open({ max: 2 });
      const { session, pinned } = await pin(db);
      const pid = await pidOf(pinned);
      const handle = await pinned.beginTransaction?.();
      if (!handle) throw new Error('no beginTransaction');
      const queued = pinned.query('SELECT 1');
      const queuedTx = pinned.transaction?.(async () => 1);
      await sleep(50);

      const started = Date.now();
      if (close === 'destroy') session.destroy?.();
      else if (close === 'release') void session.release();
      else {
        await db.query('SELECT pg_terminate_backend($1)', [pid]);
      }
      const expected =
        close === 'terminate'
          ? /Session connection was lost/
          : /Session has been released/;
      const outcome = await within(queued, 3_000);
      expect(outcome, close).not.toBe('timeout');
      await rejectsWith(queued, expected);
      await rejectsWith(queuedTx, expected);
      await rejectsWith(pinned.query('SELECT 1'), expected);
      expect(handle.isActive(), close).toBe(false);
      await rejectsWith(handle.commit(), expected);
      expect(Date.now() - started, close).toBeLessThan(5_000);
    }
  });

  it('destroy() of an idle session writes nothing to the socket', async () => {
    const net = await import('node:net');
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    await pinned.query('SELECT 1');
    const writes: number[] = [];
    const original = net.Socket.prototype.write;
    net.Socket.prototype.write = function (this: unknown, ...args: unknown[]) {
      const chunk = args[0];
      if (chunk instanceof Uint8Array) writes.push(chunk[0]);
      return Reflect.apply(original, this, args);
    } as typeof original;
    try {
      session.destroy?.();
      await sleep(50);
    } finally {
      net.Socket.prototype.write = original;
    }
    // 0x58 ('X') is the protocol's Terminate message.
    expect(writes).not.toContain(0x58);
    expect(session.isActive()).toBe(false);
  });

  it('a plain statement queued behind another plain statement takes no transaction-turn timeout', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    await pinned.query('SELECT 1');
    const delays: number[] = [];
    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((
      handler: never,
      delay?: number,
      ...rest: never[]
    ) => {
      delays.push(Number(delay));
      return original(handler, delay, ...rest);
    }) as typeof setTimeout;
    let slow: Promise<unknown>;
    let queued: Promise<unknown>;
    try {
      slow = pinned.query('SELECT pg_sleep(0.3)');
      queued = Promise.all([
        pinned.query('SELECT 1'),
        pinned.list('pg_namespace', {}),
        pinned.tableExists('pg_class'),
      ]);
    } finally {
      globalThis.setTimeout = original;
    }
    await slow;
    await queued;
    expect(delays.filter((delay) => delay >= 30_000)).toEqual([]);
  });

  it('discards the session when BEGIN times out client-side, so no later write lands in an abandoned transaction', async () => {
    const db = await open({ url: timeoutUrl(300), max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('begintimeout');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    const submitted = recordSubmissions();
    let restoreDelay = () => {};
    try {
      await session.query('SELECT 1');
      const client = submitted.at(-1)?.client as {
        connection: { emit: (event: string, ...args: unknown[]) => boolean };
      };
      restoreDelay = delayReadyAfter(client, 'BEGIN', 600);
      await rejectsWith(
        pinned.transaction?.(async () => {}),
        /timeout/i,
      );
    } finally {
      submitted.restore();
    }
    expect(session.isActive()).toBe(false);
    await rejectsWith(
      pinned.insert(table, { id: 1 }),
      /Session connection was lost/,
    );
    restoreDelay();
    expect((await db.list(table, {})).length).toBe(0);
    await db.query(`DROP TABLE ${table}`);
  });

  it('keeps a queued raw session.query to its issue-time deadline and never sends it after expiry', async () => {
    const db = await open({ url: timeoutUrl(300), max: 2 });
    const { session } = await pin(db);
    const table = tableName('rawdeadline');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const submitted = recordSubmissions();
    try {
      const slow = session.query('SELECT pg_sleep(1)');
      // Both deadlines run from the call, so this one can reject first.
      slow.catch(() => {});
      const queuedInsert = session.query(`INSERT INTO ${table} VALUES (1)`);
      const started = Date.now();
      await rejectsWith(queuedInsert, /timeout/i);
      // Rejected at its own deadline, not when the long statement finished.
      expect(Date.now() - started).toBeLessThan(800);
      await rejectsWith(slow, /timeout/i);
      await sleep(1_000);
      expect(
        submitted.filter((entry) => entry.sql.includes('INSERT INTO')),
      ).toEqual([]);
    } finally {
      submitted.restore();
    }
    expect((await db.list(table, {})).length).toBe(0);
    expect(session.isActive()).toBe(true);
    expect((await session.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    await db.query(`DROP TABLE ${table}`);
  });

  it('schema helpers reject when their DDL times out client-side with an unknown outcome', async () => {
    const db = await open({ url: timeoutUrl(500), max: 3 });
    const { pinned } = await pin(db);
    const table = tableName('ddltimeout');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    const syncing = pinned.syncSchema?.(
      `CREATE INDEX ${table}_idx ON ${table} (id)`,
    );
    syncing?.catch(() => {});
    const outcome = await within(syncing, 5_000);
    expect(outcome).not.toBe('timeout');
    await rejectsWith(syncing, /timeout/i);
    await blocker.rollback();
    await db.query(`DROP TABLE ${table}`);
  });

  it('a terminated backend with a localised severity still ends the session, through the connection events', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const pid = await pidOf(pinned);
    const submitted = recordSubmissions();
    let restore = () => {};
    try {
      await session.query('SELECT 1');
      const client = submitted.at(-1)?.client as {
        connection: { emit: (event: string, ...args: unknown[]) => boolean };
      };
      const connection = client.connection;
      const emit = connection.emit.bind(connection);
      // lc_messages = 'de': the severity text is translated, the SQLSTATE
      // (57P01 admin_shutdown) is not.
      connection.emit = (event: string, ...args: unknown[]) => {
        if (event === 'errorMessage') {
          (args[0] as { severity?: string }).severity = 'SCHWERWIEGEND';
        }
        return emit(event, ...args);
      };
      restore = () => {
        connection.emit = emit;
      };
      const observed = pinned.query('SELECT pg_sleep(5)').then(
        () => 'resolved',
        () => 'rejected',
      );
      await waitFor(async () => {
        const running = await db.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid = $1 AND query LIKE 'SELECT pg_sleep%'",
          [pid],
        );
        return running.rows[0].n === 1;
      });
      await db.query('SELECT pg_terminate_backend($1)', [pid]);
      expect(await observed).toBe('rejected');
      // Not recognised from the translated severity; the socket closing is.
      await waitFor(() => !session.isActive(), 5_000);
      await rejectsWith(
        pinned.query('SELECT 1'),
        /Session connection was lost/,
      );
    } finally {
      restore();
      submitted.restore();
    }
  });

  it('release() keeps the queue closed until ReadyForQuery while the socket is live', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const submitted = recordSubmissions();
    let restoreDelay = () => {};
    try {
      await session.query('SELECT 1');
      const client = submitted.at(-1)?.client as {
        connection: { emit: (event: string, ...args: unknown[]) => boolean };
      };
      restoreDelay = delayReadyAfter(client, 'errorMessage', 300);
      const failing = pinned.query('SELECT 1/0');
      await rejectsWith(failing, /division by zero/);
      const failedAt = Date.now();
      await session.release();
      const rollbackAt = submitted.find((entry) => entry.sql === 'ROLLBACK')
        ?.at as number;
      expect(rollbackAt - failedAt).toBeGreaterThanOrEqual(250);
    } finally {
      restoreDelay();
      submitted.restore();
    }
  });
});

/** A session that never calls database(): the raw path as on main. */
async function rawSession(db: DatabaseInterface): Promise<SessionHandle> {
  const session = await db.acquireSession?.();
  if (!session) throw new Error('adapter does not expose acquireSession()');
  sessions.push(session);
  return session;
}

describe.skipIf(!available)('SessionHandle review round 4', () => {
  it('a raw-only session submits synchronously, so reusing a parameter array is safe', async () => {
    const db = await open({ max: 2 });
    const session = await rawSession(db);
    const table = tableName('rawreuse');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const submitted = recordSubmissions();
    try {
      const values = [1];
      const first = session.query(`INSERT INTO ${table} VALUES ($1)`, values);
      // Handed to node-postgres during the call, as on main.
      expect(
        submitted.filter((entry) => entry.sql.includes('INSERT INTO')),
      ).toHaveLength(1);
      values[0] = 2;
      await first;
    } finally {
      submitted.restore();
    }
    expect((await db.list(table, {})).map((row) => row.id)).toEqual([1]);
    await db.query(`DROP TABLE ${table}`);
  });

  it('once database() is used, a raw call captures its values at issue time', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('fiforeuse');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    const values = [1];
    const first = session.query(`INSERT INTO ${table} VALUES ($1)`, values);
    values[0] = 2;
    const second = session.query(`INSERT INTO ${table} VALUES ($1)`, values);
    await Promise.all([first, second]);
    expect((await pinned.list(table, {})).map((row) => row.id).sort()).toEqual([
      1, 2,
    ]);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('a raw-only session’s release() settles after a client timeout while the blocker is held', async () => {
    const db = await open({ url: timeoutUrl(300), max: 3 });
    const session = await rawSession(db);
    const table = tableName('rawcleanup');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    try {
      await rejectsWith(
        session.query(`SELECT count(*) FROM ${table}`),
        /timeout/i,
      );
      const outcome = await within(session.release(), 3_000);
      expect(outcome).not.toBe('timeout');
      expect(session.isActive()).toBe(false);
    } finally {
      await blocker.rollback();
    }
    await db.query(`DROP TABLE ${table}`);
  });

  it('once database() is used, release() honours the deadline while the blocker is held, then discards the lease', async () => {
    const db = await open({ url: timeoutUrl(300), max: 3 });
    const { session, pinned } = await pin(db);
    const table = tableName('fifocleanup');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    try {
      await rejectsWith(
        pinned.query(`SELECT count(*) FROM ${table}`),
        /timeout/i,
      );
      const outcome = await within(session.release(), 3_000);
      expect(outcome).not.toBe('timeout');
      expect(session.isActive()).toBe(false);
    } finally {
      await blocker.rollback();
    }
    await db.query(`DROP TABLE ${table}`);
  });

  it('withdraws expired queued raw calls at their deadline without sending them', async () => {
    const db = await open({ url: timeoutUrl(200), max: 3 });
    const { session, pinned } = await pin(db);
    const table = tableName('fifoexpire');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    const submitted = recordSubmissions();
    try {
      const blocked = pinned.query(`SELECT count(*) FROM ${table}`);
      blocked.catch(() => {});
      const started = performance.now();
      const attempts = Array.from({ length: 20 }, (_, i) =>
        session.query(`INSERT INTO ${table} VALUES ($1)`, i),
      );
      const outcomes = await Promise.allSettled(attempts);
      expect(outcomes.every((o) => o.status === 'rejected')).toBe(true);
      expect(performance.now() - started).toBeLessThan(1_500);
      expect(
        submitted.filter((entry) => entry.sql.includes('INSERT INTO')),
      ).toEqual([]);
    } finally {
      submitted.restore();
      await blocker.rollback();
    }
    expect((await db.list(table, {})).length).toBe(0);
    await db.query(`DROP TABLE ${table}`);
  });

  it('measures a queued raw call’s deadline on a monotonic clock', async () => {
    const db = await open({ url: timeoutUrl(2_000), max: 2 });
    const { session, pinned } = await pin(db);
    const slow = pinned.query('SELECT pg_sleep(0.3)');
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now');
    try {
      const queued = session.query('SELECT 1 AS ok');
      // The wall clock jumps forward an hour while the call waits its turn.
      clock.mockImplementation(() => realNow() + 3_600_000);
      expect((await queued).rows[0].ok).toBe(1);
    } finally {
      clock.mockRestore();
    }
    await slow;
  });

  it('a bind-parameter count error leaves the session usable on the same backend', async () => {
    const db = await open({ max: 2 });
    const raw = await rawSession(db);
    const { session, pinned } = await pin(db);
    for (const handle of [raw, session] as const) {
      const pid = await pidOf(handle);
      await rejectsWith(handle.query('SELECT $1::int, $2::int', 1), /.+/);
      expect(handle.isActive()).toBe(true);
      expect(await pidOf(handle)).toBe(pid);
    }
    await rejectsWith(pinned.query('SELECT $1::int, $2::int', [1]), /.+/);
    expect(session.isActive()).toBe(true);
    expect((await pinned.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });

  it('refuses a NULL-key upsert even when the record changes between reads', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('getterkey');
    await pinned.query(
      `CREATE TABLE ${table} (id int, tag text, label text, UNIQUE (id, tag))`,
    );
    let reads = 0;
    const record = {
      id: 1,
      label: 'a',
      get tag() {
        reads += 1;
        return reads === 1 ? 'x' : null;
      },
    };
    const submitted = recordSubmissions();
    try {
      await rejectsWith(
        pinned.upsert(table, ['id', 'tag'], record),
        /nullsDistinct: true/,
      );
    } finally {
      submitted.restore();
    }
    expect(
      submitted
        .filter((entry) => catalogProbe.test(entry.sql))
        .map((e) => e.sql),
    ).toEqual([]);
    expect(await pinned.list(table, {})).toEqual([]);
    await pinned.query(`DROP TABLE ${table}`);
  });
});

/** A connection URL for the test server with a client-side query_timeout. */
function timeoutUrl(ms: number): string {
  const host = process.env.SQLOO_HOST || 'localhost';
  const port = Number(process.env.SQLOO_PORT) || 5432;
  const user = encodeURIComponent(process.env.SQLOO_USER || 'postgres');
  const password = encodeURIComponent(process.env.SQLOO_PASSWORD || 'postgres');
  const database = process.env.SQLOO_DATABASE || 'testdb';
  return `postgresql://${user}:${password}@${host}:${port}/${database}?query_timeout=${ms}`;
}

/**
 * Delays the next ReadyForQuery the client receives after `trigger` (a
 * command tag such as 'BEGIN', or the protocol event 'errorMessage') by
 * `ms`. Returns a function that restores normal delivery.
 */
function delayReadyAfter(
  client: {
    connection: { emit: (event: string, ...args: unknown[]) => boolean };
  },
  trigger: string,
  ms: number,
): () => void {
  const connection = client.connection;
  const emit = connection.emit.bind(connection);
  let armed = false;
  let delayed = false;
  connection.emit = (event: string, ...args: unknown[]) => {
    if (event === trigger) armed = true;
    if (
      event === 'commandComplete' &&
      (args[0] as { text?: string } | undefined)?.text === trigger
    ) {
      armed = true;
    }
    if (event === 'readyForQuery' && armed && !delayed) {
      delayed = true;
      setTimeout(() => emit(event, ...args), ms);
      return true;
    }
    return emit(event, ...args);
  };
  return () => {
    connection.emit = emit;
  };
}

describe.skipIf(!available)('SessionHandle review round 5', () => {
  it('database() refuses while a direct session.query() is still running', async () => {
    const db = await open({ max: 2 });
    const session = await rawSession(db);
    const running = session.query('SELECT pg_sleep(0.3)');
    expect(() => session.database?.()).toThrow(/needs an idle session/);
    await running;
    expect(session.database?.()).toBeDefined();
  });

  it('database() refuses while a transaction opened with session.query(BEGIN) is open', async () => {
    const db = await open({ max: 2 });
    const session = await rawSession(db);
    await session.query('BEGIN');
    expect(() => session.database?.()).toThrow(
      /reports a transaction open.*status T/,
    );
    await session.query('ROLLBACK');
    expect(session.database?.()).toBeDefined();
  });

  it('a managed transaction refuses to run inside a caller-owned transaction, whose rows stay uncommitted', async () => {
    const db = await open({ max: 3 });
    const { session, pinned } = await pin(db);
    const table = tableName('callertx');
    await pinned.query(`CREATE TABLE ${table} (id int)`);
    await session.query('BEGIN');
    await session.query(`INSERT INTO ${table} VALUES (1)`);
    await rejectsWith(
      pinned.transaction?.(async () => {}),
      /transaction already open.*status T/,
    );
    await rejectsWith(
      pinned.beginTransaction?.(),
      /transaction already open.*status T/,
    );
    // The refusal sent nothing and kept the lease.
    expect(session.isActive()).toBe(true);
    expect((await db.list(table, {})).length).toBe(0);
    await session.query('ROLLBACK');
    expect((await db.list(table, {})).length).toBe(0);
    await pinned.transaction?.(async (tx) => {
      await tx.insert(table, { id: 2 });
    });
    expect((await db.list(table, {})).map((row) => row.id)).toEqual([2]);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('captures a queued write’s parameters at the call, including a reused array and a mutated Buffer', async () => {
    const db = await open({ max: 2 });
    const { pinned } = await pin(db);
    const table = tableName('capture');
    await pinned.query(
      `CREATE TABLE ${table} (id int, payload bytea, at timestamptz, doc jsonb)`,
    );
    const handle = await pinned.beginTransaction?.();
    if (!handle) throw new Error('no beginTransaction');
    const at = new Date('2020-01-02T03:04:05.000Z');
    const doc = { tenant: 'a' };
    const values: unknown[] = [1, Buffer.from([1, 2, 3]), at, doc];
    const queued = pinned.query(
      `INSERT INTO ${table} (id, payload, at, doc) VALUES ($1, $2, $3, $4)`,
      values,
    );
    values[0] = 99;
    (values[1] as Buffer)[0] = 9;
    at.setUTCFullYear(1999);
    doc.tenant = 'b';
    await handle.commit();
    await queued;
    const rows = await pinned.query(
      `SELECT id, encode(payload, 'hex') AS hex, at = '2020-01-02T03:04:05Z'::timestamptz AS at_kept, doc->>'tenant' AS tenant FROM ${table}`,
    );
    expect(rows.rows).toEqual([
      { id: 1, hex: '010203', at_kept: true, tenant: 'a' },
    ]);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('a statement-level 57P01 (forwarded, not local) leaves the session usable; schema helpers still fail on it', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const pid = await pidOf(pinned);
    const raise = tableName('raise57');
    await pinned.query(
      `CREATE FUNCTION ${raise}() RETURNS int LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = '57P01', MESSAGE = 'remote server shut down'; END $$`,
    );
    await rejectsWith(pinned.query(`SELECT ${raise}()`), /remote server/);
    expect(session.isActive()).toBe(true);
    expect(await pidOf(pinned)).toBe(pid);
    await rejectsWith(session.query(`SELECT ${raise}()`), /remote server/);
    expect(session.isActive()).toBe(true);

    // Tolerated DDL never tolerates a shutdown code.
    await rejectsWith(
      pinned.syncSchema?.(
        `CREATE MATERIALIZED VIEW ${raise}_mv AS SELECT ${raise}() AS v`,
      ),
      /remote server/,
    );
    expect(session.isActive()).toBe(true);
    expect(await pidOf(pinned)).toBe(pid);
    await pinned.query(`DROP FUNCTION ${raise}()`);
  });
});

describe.skipIf(!available)('SessionHandle review round 6', () => {
  it('refuses a managed transaction on a pooled client whose previous borrower left a transaction open', async () => {
    const db = await open({ max: 1 });
    const observer = await open({ max: 1 });
    const table = tableName('leaked');
    await observer.query(`CREATE TABLE ${table} (id int)`);
    // A raw root query leaves BEGIN; INSERT open and returns the client.
    await db.query(`BEGIN; INSERT INTO ${table} VALUES (1)`);
    const session = await rawSession(db);
    const pinned = session.database?.();
    if (!pinned) throw new Error('no database()');
    await rejectsWith(
      pinned.transaction?.(async () => {}),
      /transaction already open.*status T/,
    );
    expect(session.isActive()).toBe(true);
    expect((await observer.list(table, {})).length).toBe(0);
    await session.query('ROLLBACK');
    expect((await observer.list(table, {})).length).toBe(0);
    await observer.query(`DROP TABLE ${table}`);
  });

  it('a schema helper rejects when a translated FATAL (transaction_timeout) ends the backend during blocked DDL', async () => {
    const db = await open({ max: 3 });
    const { session, pinned } = await pin(db);
    const version = Number(
      (await pinned.query('SHOW server_version_num')).rows[0]
        .server_version_num,
    );
    if (version < 170000) return;
    const table = tableName('txtimeout');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    const submitted = recordSubmissions();
    let restore = () => {};
    try {
      await session.query("SET transaction_timeout = '400ms'");
      const client = submitted.at(-1)?.client as {
        connection: { emit: (event: string, ...args: unknown[]) => boolean };
      };
      const connection = client.connection;
      const emit = connection.emit.bind(connection);
      connection.emit = (event: string, ...args: unknown[]) => {
        if (event === 'errorMessage') {
          (args[0] as { severity?: string }).severity = 'SCHWERWIEGEND';
        }
        return emit(event, ...args);
      };
      restore = () => {
        connection.emit = emit;
      };
      await rejectsWith(
        pinned.syncSchema?.(`CREATE INDEX ${table}_idx ON ${table} (id)`),
        /Session connection was lost/,
      );
    } finally {
      restore();
      submitted.restore();
      await blocker.rollback();
    }
    await db.query(`DROP TABLE ${table}`);
  });

  it('counts a queued raw call’s query_timeout from the public call, including parameter encoding', async () => {
    const db = await open({ url: timeoutUrl(100), max: 2 });
    const { session, pinned } = await pin(db);
    const table = tableName('slowencode');
    await pinned.query(`CREATE TABLE ${table} (v text)`);
    const slowValue = {
      toPostgres() {
        const started = Date.now();
        while (Date.now() - started < 150) {
          // Busy: encoding uses the whole budget.
        }
        return 'x';
      },
    };
    const submitted = recordSubmissions();
    try {
      await rejectsWith(
        session.query(`INSERT INTO ${table} VALUES ($1)`, slowValue),
        /timeout/i,
      );
    } finally {
      submitted.restore();
    }
    expect(
      submitted.filter((entry) => entry.sql.includes('INSERT INTO')),
    ).toEqual([]);
    expect((await pinned.list(table, {})).length).toBe(0);
    await pinned.query(`DROP TABLE ${table}`);
  });

  it('returns a parameter encoding failure as a rejection on every public path', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const circular = /circular/i;

    let viaClient: Promise<unknown> | undefined;
    expect(() => {
      viaClient = pinned.client.query('SELECT $1::text', [cyclic]);
    }).not.toThrow();
    await rejectsWith(viaClient, circular);
    await rejectsWith(pinned.query('SELECT $1::text', [cyclic]), circular);
    await rejectsWith(
      session.query('SELECT $1::text', cyclic),
      /Failed to execute session query/,
    );
    await pinned.transaction?.(async (tx) => {
      let viaTx: Promise<unknown> | undefined;
      expect(() => {
        viaTx = tx.client.query('SELECT $1::text', [cyclic]);
      }).not.toThrow();
      await rejectsWith(viaTx, circular);
      // Nothing was sent, so the transaction is unharmed.
      expect((await tx.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    });
    expect(session.isActive()).toBe(true);
    expect((await pinned.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
  });

  it('database() on a destroyed session throws the closed-session error', async () => {
    const db = await open({ max: 2 });
    const session = await rawSession(db);
    session.destroy?.();
    expect(() => session.database?.()).toThrow(/Session has been released/);
  });
});

describe.skipIf(!available)('SessionHandle review round 7', () => {
  it('a schema helper settles a tolerated error on its own statement, not behind later queued work', async () => {
    const db = await open({ max: 3 });
    const { pinned } = await pin(db);
    const sequence = tableName('dupseq');
    const table = tableName('lockedlater');
    await pinned.query(`CREATE SEQUENCE ${sequence}`);
    await db.query(`CREATE TABLE ${table} (id int)`);
    const blocker = await db.beginTransaction?.();
    if (!blocker) throw new Error('no beginTransaction');
    await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    try {
      // The duplicate is a tolerated server error; the query queued behind
      // it waits on a lock released only after the helper returns.
      const syncing = pinned.syncSchema?.(`CREATE SEQUENCE ${sequence}`);
      const blocked = pinned.query(`SELECT count(*)::int AS n FROM ${table}`);
      blocked.catch(() => {});
      const outcome = await within(syncing, 5_000);
      expect(outcome).not.toBe('timeout');
      expect((outcome as { error?: unknown }).error).toBeUndefined();
      await blocker.rollback();
      expect((await blocked).rows[0].n).toBe(0);
    } finally {
      if (blocker.isActive()) await blocker.rollback();
    }
    await pinned.query(`DROP TABLE ${table}`);
    await pinned.query(`DROP SEQUENCE ${sequence}`);
  });

  it('redacts an error with the parameters as submitted, not the caller’s overwritten array', async () => {
    const db = await open({ max: 2 });
    const { session, pinned } = await pin(db);
    const marker = 'redaction-marker-7f3a91';
    const leaked = (error: unknown): string => {
      const e = error as Error & { context?: unknown };
      return JSON.stringify({
        message: e.message,
        cause: (e.cause as Error | undefined)?.message,
        context: e.context,
      });
    };
    for (const run of [
      (values: unknown[]) => session.query('SELECT $1::uuid AS v', values),
      (values: unknown[]) => pinned.query('SELECT $1::uuid AS v', values),
    ]) {
      const values: unknown[] = [marker];
      const pending = run(values);
      values[0] = 'something-else';
      const error = await pending.then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(leaked(error)).not.toContain(marker);
    }
  });
});

describe.skipIf(!available)('SessionHandle review round 8', () => {
  it('a second client-side DDL timeout propagates at once instead of waiting behind its lock', async () => {
    const db = await open({ url: timeoutUrl(500), max: 4 });
    const { pinned } = await pin(db);
    const first = tableName('ddlfirst');
    const second = tableName('ddlsecond');
    await db.query(`CREATE TABLE ${first} (id int)`);
    await db.query(`CREATE TABLE ${second} (id int)`);
    const holderA = await db.beginTransaction?.();
    const holderB = await db.beginTransaction?.();
    if (!holderA || !holderB) throw new Error('no beginTransaction');
    await holderA.query(`LOCK TABLE ${first} IN ACCESS EXCLUSIVE MODE`);
    await holderB.query(`LOCK TABLE ${second} IN ACCESS EXCLUSIVE MODE`);
    try {
      const syncing = pinned.syncSchema?.(
        `CREATE INDEX ${first}_idx ON ${first} (id);\nCREATE INDEX ${second}_idx ON ${second} (id)`,
      );
      syncing?.catch(() => {});
      // The first DDL times out client-side, then finishes once A lets go;
      // the second then times out behind B, which lets go only after the
      // helper has returned.
      // (With the schema scope failing fast, the helper may return before
      // this fires.)
      const releaseA = setTimeout(() => {
        if (holderA.isActive()) holderA.rollback().catch(() => {});
      }, 900);
      syncing?.finally(() => clearTimeout(releaseA)).catch(() => {});
      const outcome = await within(syncing, 6_000);
      expect(outcome).not.toBe('timeout');
      await rejectsWith(syncing, /timeout/i);
    } finally {
      if (holderA.isActive()) await holderA.rollback();
      if (holderB.isActive()) await holderB.rollback();
    }
    await db.query(`DROP TABLE ${first}`);
    await db.query(`DROP TABLE ${second}`);
  });

  it('after an intolerable failure, a schema helper enqueues nothing more and reports that failure', async () => {
    const db = await open({ url: timeoutUrl(500), max: 3 });
    const { pinned } = await pin(db);
    const table = tableName('failfast');
    const sequence = tableName('failfastseq');
    await db.query(`CREATE TABLE ${table} (id int)`);
    const holder = await db.beginTransaction?.();
    if (!holder) throw new Error('no beginTransaction');
    await holder.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    const submitted = recordSubmissions();
    try {
      // The index times out client-side and stays blocked; the holder lets
      // go only after the helper has returned.
      const syncing = pinned.syncSchema?.(
        `CREATE INDEX ${table}_idx ON ${table} (id);\nCREATE SEQUENCE ${sequence}`,
      );
      syncing?.catch(() => {});
      const outcome = await within(syncing, 5_000);
      expect(outcome).not.toBe('timeout');
      await rejectsWith(syncing, /timeout/i);
      expect(
        submitted.filter((entry) => entry.sql.includes('CREATE SEQUENCE')),
      ).toEqual([]);
    } finally {
      submitted.restore();
      await holder.rollback();
    }
    const exists = await db.query(
      'SELECT count(*)::int AS n FROM pg_class WHERE relname = $1',
      [sequence],
    );
    expect(exists.rows[0].n).toBe(0);
    await db.query(`DROP TABLE ${table}`);
  });

  it('before database(), session.query() redacts against the caller’s array, as node-postgres binds from it', async () => {
    const db = await open({ max: 2 });
    const session = await rawSession(db);
    const marker = 'redaction-marker-4c2e88';
    // A busy raw-only client: the cast is queued inside node-postgres and
    // bound from the array when it is submitted.
    const slow = session.query('SELECT pg_sleep(0.3)');
    const values: unknown[] = ['placeholder'];
    const pending = session.query('SELECT $1::uuid AS v', values);
    values[0] = marker;
    await slow;
    const error = (await pending.then(
      () => undefined,
      (caught: unknown) => caught,
    )) as Error & { context?: unknown };
    expect(error).toBeInstanceOf(Error);
    const text = JSON.stringify({
      message: error.message,
      cause: (error.cause as Error | undefined)?.message,
      context: error.context,
    });
    expect(text).not.toContain(marker);
  });
});
