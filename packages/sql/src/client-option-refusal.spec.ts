import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseError } from '@happyvertical/utils';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  clearPostgresConnectionCache,
  type DatabaseInterface,
  describeHandle,
  getDatabase,
  isDatabaseRoot,
} from './index';
import { getDatabase as getPGliteDatabase } from './pglite';
import type { ConnectionCache } from './shared/connection-cache';
import { TRANSACTION_SCOPE } from './shared/handle-provenance';

/**
 * Only PGlite uses an injected `client`. Every other adapter refuses the
 * option before any cache lookup or connection, instead of opening something
 * else from the URL or the environment (sdk#1249).
 */

let dir: string;
const pgUrl = 'postgresql://hv:secret@db.invalid:5432/hv_client_refusal';
const injected = { query: async () => ({ rows: [] }) };
const callerClients: Array<{ close(): Promise<void> }> = [];

beforeAll(async () => {
  dir = await mkdtemp(join(await realpath(tmpdir()), 'hv-sql-client-'));
  // Load the PostgreSQL adapter so its cache exists before any size check.
  await import('./postgres');
});

afterAll(async () => {
  for (const client of callerClients.splice(0)) await client.close();
  await rm(dir, { recursive: true, force: true });
});

afterEach(async () => {
  delete process.env.HAVE_SQL_URL;
  await clearPostgresConnectionCache();
});

function postgresCache(): ConnectionCache<DatabaseInterface> {
  const cache = (globalThis as Record<string, unknown>)
    .__haveSqlPostgresConnectionCacheV2 as
    | ConnectionCache<DatabaseInterface>
    | undefined;
  if (!cache) throw new Error('PostgreSQL cache not initialised');
  return cache;
}

async function callerPGlite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = await PGlite.create();
  callerClients.push(client);
  return client;
}

/** One call: a DatabaseError naming the option, with the migration hint. */
async function expectRefused(options: Record<string, unknown>) {
  const error = await getDatabase(options as never).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DatabaseError);
  expect((error as DatabaseError).message).toMatch(/client option/);
  expect(String((error as DatabaseError).context?.hint)).toMatch(
    /Remove client only if/,
  );
}

describe('client option refusal', () => {
  it('PostgreSQL refuses client with a URL, with a dbid, and with an environment URL', async () => {
    await expectRefused({ type: 'postgres', client: injected, url: pgUrl });
    await expectRefused({
      type: 'postgres',
      client: injected,
      url: pgUrl,
      dbid: `client-refusal-${randomUUID()}`,
    });
    process.env.HAVE_SQL_URL = pgUrl;
    await expectRefused({ type: 'postgres', client: injected });
  });

  it('PostgreSQL refuses before the cache: a refused miss adds no entry, the next plain open creates the first one', async () => {
    const dbid = `client-refusal-${randomUUID()}`;
    const before = postgresCache().size;
    await expectRefused({
      type: 'postgres',
      client: injected,
      url: pgUrl,
      dbid,
    });
    expect(postgresCache().size).toBe(before);

    const plain = await getDatabase({ type: 'postgres', url: pgUrl, dbid });
    expect(postgresCache().size).toBe(before + 1);
    expect(isDatabaseRoot(plain)).toBe(true);
  });

  it('a refused clearCache open leaves the cached PostgreSQL pool in place', async () => {
    const dbid = `client-refusal-${randomUUID()}`;
    const plain = await getDatabase({ type: 'postgres', url: pgUrl, dbid });
    await expectRefused({
      type: 'postgres',
      client: injected,
      url: pgUrl,
      dbid,
      clearCache: true,
    });
    expect(await getDatabase({ type: 'postgres', url: pgUrl, dbid })).toBe(
      plain,
    );
    expect((plain.client as { ended?: boolean }).ended).toBe(false);
  });

  it('refuses against the options as they are at the call, even when the caller edits them afterwards', async () => {
    const options: Record<string, unknown> = {
      type: 'postgres',
      url: pgUrl,
      dbid: `client-refusal-${randomUUID()}`,
      client: injected,
    };
    const first = getDatabase(options as never);
    delete options.client;
    const second = getDatabase(options as never);
    await expect(first).rejects.toBeInstanceOf(DatabaseError);
    const plain = await second;
    expect(isDatabaseRoot(plain)).toBe(true);
  });

  it('PostgreSQL treats client: undefined and client: null as absent', async () => {
    for (const client of [undefined, null]) {
      const db = await getDatabase({
        type: 'postgres',
        url: pgUrl,
        client,
        cache: false,
      } as never);
      expect(describeHandle(db)).toMatchObject({
        role: 'root',
        clientSource: 'adapter',
      });
      await db.close?.();
    }
  });

  it('SQLite (libsql, secureFile, native), DuckDB and JSON refuse client', async () => {
    await expectRefused({ type: 'sqlite', url: ':memory:', client: injected });
    await expectRefused({
      type: 'sqlite',
      url: join(dir, `secure-${randomUUID()}.db`),
      secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
      client: injected,
    });
    await expectRefused({
      type: 'sqlite',
      url: ':memory:',
      capabilities: { vector: true },
      client: injected,
    });
    await expectRefused({ type: 'duckdb', url: ':memory:', client: injected });
    await expectRefused({
      type: 'json',
      url: ':memory:',
      dbid: randomUUID(),
      client: injected,
    });
  });

  it('a refused clearCache open leaves the cached SQLite database in place', async () => {
    const dbid = randomUUID();
    const plain = await getDatabase({ type: 'sqlite', url: ':memory:', dbid });
    try {
      await plain.query('CREATE TABLE kept (id INTEGER PRIMARY KEY)');
      await expectRefused({
        type: 'sqlite',
        url: ':memory:',
        dbid,
        clearCache: true,
        client: injected,
      });
      const again = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        dbid,
      });
      expect(again).toBe(plain);
      await again.query('SELECT * FROM kept');
    } finally {
      await plain.close?.();
    }
  });

  it('SQLite treats client: null as absent', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
      client: null,
    } as never);
    expect(isDatabaseRoot(db)).toBe(true);
    await db.close?.();
  });
});

describe('PGlite client option', () => {
  it('still accepts an injected client', async () => {
    const pg = await callerPGlite();
    const db = await getDatabase({ type: 'pglite', client: pg });
    try {
      expect(describeHandle(db)).toMatchObject({
        role: 'root',
        clientSource: 'caller',
      });
      expect((await db.query('SELECT 1 AS one')).rows[0].one).toBe(1);
    } finally {
      await db.close?.();
    }
  });

  it('refuses a client that is not an object instead of claiming adapter ownership', async () => {
    for (const client of [false, 0, '', 'pglite', true]) {
      await expect(
        getDatabase({ type: 'pglite', client } as never),
      ).rejects.toBeInstanceOf(DatabaseError);
      await expect(
        getPGliteDatabase({ client } as never),
      ).rejects.toBeInstanceOf(DatabaseError);
    }
  });

  it('reads client once at the call: a client assigned while the open is pending is ignored (root entry)', async () => {
    const pg = await callerPGlite();
    const options: Record<string, unknown> = {
      type: 'pglite',
      dbid: randomUUID(),
    };
    const pending = getDatabase(options as never);
    options.client = pg;
    const db = await pending;
    try {
      expect(db.client).not.toBe(pg);
      expect(describeHandle(db).clientSource).toBe('adapter');
    } finally {
      await db.close?.();
    }
  });

  it('reads client once at the call: a client assigned while the open is pending is ignored (pglite entry)', async () => {
    const pg = await callerPGlite();
    const options: Record<string, unknown> = { dbid: randomUUID() };
    const pending = getPGliteDatabase(options as never);
    options.client = pg;
    const db = await pending;
    try {
      expect(db.client).not.toBe(pg);
      expect(describeHandle(db).clientSource).toBe('adapter');
    } finally {
      await db.close?.();
    }
  });
});

describe('options are captured once, at the call', () => {
  it('a client added to the options while the open is pending does not reject it', async () => {
    const options: Record<string, unknown> = {
      type: 'postgres',
      url: pgUrl,
      dbid: `snapshot-${randomUUID()}`,
    };
    const pending = getDatabase(options as never);
    options.client = injected;
    const db = await pending;
    expect(isDatabaseRoot(db)).toBe(true);
  });

  it('changing url or dbid while the open is pending does not redirect it (PostgreSQL)', async () => {
    const dbidA = `snapshot-a-${randomUUID()}`;
    const urlB = 'postgresql://hv:secret@db.invalid:5432/hv_snapshot_b';
    const options: Record<string, unknown> = {
      type: 'postgres',
      url: pgUrl,
      dbid: dbidA,
    };
    const pending = getDatabase(options as never);
    options.url = urlB;
    options.dbid = `snapshot-b-${randomUUID()}`;
    const db = await pending;
    expect(
      await getDatabase({ type: 'postgres', url: pgUrl, dbid: dbidA }),
    ).toBe(db);
    const reopened = db.reopenOptions?.() as { url?: string } | undefined;
    expect(reopened?.url).toBe(pgUrl);
  });

  it('changing url while the open is pending does not redirect it (SQLite)', async () => {
    const fileA = join(dir, `snap-a-${randomUUID()}.db`);
    const fileB = join(dir, `snap-b-${randomUUID()}.db`);
    const options: Record<string, unknown> = {
      type: 'sqlite',
      url: `file:${fileA}`,
      cache: false,
    };
    const pending = getDatabase(options as never);
    options.url = `file:${fileB}`;
    const db = await pending;
    try {
      expect(db.url).toBe(`file:${fileA}`);
    } finally {
      await db.close?.();
    }
  });

  it('still propagates a generated in-memory SQLite dbid through the caller’s object', async () => {
    const options: Record<string, unknown> = {
      type: 'sqlite',
      url: ':memory:',
    };
    const [first, concurrent] = await Promise.all([
      getDatabase(options as never),
      getDatabase(options as never),
    ]);
    try {
      expect(typeof options.dbid).toBe('string');
      expect(concurrent).toBe(first);
      expect(await getDatabase(options as never)).toBe(first);
    } finally {
      await first.close?.();
    }
  });

  it('keeps an inherited or non-enumerable PGlite client instead of returning a cached plain root', async () => {
    const pg = await callerPGlite();
    const dbid = randomUUID();
    const plain = await getDatabase({ type: 'pglite', dbid });
    try {
      const inherited = Object.assign(Object.create({ client: pg }), {
        type: 'pglite',
        dbid,
      });
      const hidden = Object.defineProperty({ type: 'pglite', dbid }, 'client', {
        value: pg,
        enumerable: false,
      });
      for (const options of [inherited, hidden]) {
        const db = await getDatabase(options as never);
        expect(db).not.toBe(plain);
        expect(db.client).toBe(pg);
        expect(describeHandle(db).clientSource).toBe('caller');
        expect(isDatabaseRoot(db)).toBe(false);
        await db.close?.();
      }
      const viaSubpath = await getPGliteDatabase(
        Object.assign(Object.create({ client: pg }), { dbid }) as never,
      );
      expect(viaSubpath).not.toBe(plain);
      expect(viaSubpath.client).toBe(pg);
      await viaSubpath.close?.();
    } finally {
      await plain.close?.();
    }
  });

  it('reads a getter-backed client exactly once per open (root and pglite entries)', async () => {
    const pg = await callerPGlite();
    for (const [entry, open] of [
      ['root', (o: object) => getDatabase(o as never)],
      ['pglite', (o: object) => getPGliteDatabase(o as never)],
    ] as const) {
      let reads = 0;
      const options = Object.defineProperty(
        entry === 'root' ? { type: 'pglite' } : {},
        'client',
        {
          get() {
            reads += 1;
            return pg;
          },
          enumerable: true,
        },
      );
      const db = await open(options);
      expect(reads, entry).toBe(1);
      expect(db.client).toBe(pg);
      await db.close?.();
    }
  });

  it('keeps an inherited PGlite dataDir (pglite entry)', async () => {
    const dataDir = `memory://inherited-${randomUUID()}`;
    const db = await getPGliteDatabase(Object.create({ dataDir }) as never);
    try {
      expect(db.url).toBe(dataDir);
    } finally {
      await db.close?.();
    }
  });
});

describe('instance pass-through and configuration reads', () => {
  it('passes a wrapper over a transaction handle through untouched, even with an environment database configured', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    const savedType = process.env.HAVE_SQL_TYPE;
    const savedUrl = process.env.HAVE_SQL_URL;
    process.env.HAVE_SQL_TYPE = 'sqlite';
    process.env.HAVE_SQL_URL = ':memory:';
    try {
      await db.transaction?.(async (tx) => {
        const wrapper = new Proxy(
          {},
          {
            get: (_target, key) => Reflect.get(tx, key),
          },
        );
        expect(await getDatabase(wrapper as never)).toBe(wrapper);
        expect(Reflect.get(wrapper, TRANSACTION_SCOPE)).toBe('callback');
      });
    } finally {
      if (savedType === undefined) delete process.env.HAVE_SQL_TYPE;
      else process.env.HAVE_SQL_TYPE = savedType;
      if (savedUrl === undefined) delete process.env.HAVE_SQL_URL;
      else process.env.HAVE_SQL_URL = savedUrl;
      await db.close?.();
    }
  });

  it('passes an instance with an unrelated throwing getter through', async () => {
    const instance = {
      client: {},
      insert: async () => undefined,
      get: async () => undefined,
      query: async () => ({ rows: [] }),
      get unrelated(): never {
        throw new Error('must not be read');
      },
    };
    expect(await getDatabase(instance as never)).toBe(instance);
  });

  it('keeps a PGlite client a Proxy supplies only through get, against a populated cache (root and pglite entries)', async () => {
    const pg = await callerPGlite();
    const dbid = randomUUID();
    const plain = await getDatabase({ type: 'pglite', dbid });
    const proxied = (target: object) =>
      new Proxy(target, {
        get: (t, key) => (key === 'client' ? pg : Reflect.get(t, key)),
      });
    try {
      for (const db of [
        await getDatabase(proxied({ type: 'pglite', dbid }) as never),
        await getPGliteDatabase(proxied({ dbid }) as never),
      ]) {
        expect(db).not.toBe(plain);
        expect(db.client).toBe(pg);
        expect(describeHandle(db).clientSource).toBe('caller');
        await db.close?.();
      }
    } finally {
      await plain.close?.();
    }
  });

  it('refuses a PostgreSQL client a Proxy supplies only through get', async () => {
    const dbid = `proxied-${randomUUID()}`;
    await getDatabase({ type: 'postgres', url: pgUrl, dbid });
    const options = new Proxy(
      { type: 'postgres', url: pgUrl, dbid },
      { get: (t, key) => (key === 'client' ? injected : Reflect.get(t, key)) },
    );
    await expectRefused(options as never);
  });

  it('refuses before writing anything to the caller’s object, and gives a non-extensible object the DatabaseError', async () => {
    await expectRefused(
      Object.preventExtensions({
        type: 'sqlite',
        url: ':memory:',
        client: injected,
      }) as never,
    );
    const options: Record<string, unknown> = {
      url: ':memory:',
      client: injected,
    };
    await expectRefused(options);
    expect(Object.keys(options).sort()).toEqual(['client', 'url']);
  });

  it('treats a null in-memory SQLite dbid as absent and propagates the generated one', async () => {
    const options: Record<string, unknown> = {
      type: 'sqlite',
      url: ':memory:',
      dbid: null,
    };
    const first = await getDatabase(options as never);
    try {
      expect(typeof options.dbid).toBe('string');
      expect(await getDatabase(options as never)).toBe(first);
    } finally {
      await first.close?.();
    }
  });
});

describe('round-5 review cases', () => {
  const withEnv = async (
    values: Record<string, string>,
    body: () => Promise<void>,
  ) => {
    const saved: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    try {
      await body();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };

  it('reads a callable configuration like any other object, keeping its PGlite client against an environment-selected cache', async () => {
    const pg = await callerPGlite();
    const dbid = randomUUID();
    const plain = await getDatabase({ type: 'pglite', dbid });
    try {
      await withEnv(
        { HAVE_SQL_TYPE: 'pglite', HAVE_SQL_DBID: dbid },
        async () => {
          const config = Object.assign(() => undefined, {
            type: 'pglite',
            dbid,
            client: pg,
          });
          const db = await getDatabase(config as never);
          expect(db).not.toBe(plain);
          expect(db.client).toBe(pg);
          expect(describeHandle(db).clientSource).toBe('caller');
          await db.close?.();
        },
      );
    } finally {
      await plain.close?.();
    }
  });

  it('an explicit client: undefined still wins over HAVE_SQL_CLIENT', async () => {
    await withEnv({ HAVE_SQL_CLIENT: 'from-environment' }, async () => {
      const db = await getDatabase({
        type: 'postgres',
        url: pgUrl,
        client: undefined,
        cache: false,
      } as never);
      expect(isDatabaseRoot(db)).toBe(true);
      await db.close?.();
    });
  });

  it('a refused PGlite client writes nothing to the caller, even with the type inferred from the environment', async () => {
    await withEnv({ HAVE_SQL_TYPE: 'pglite' }, async () => {
      const options: Record<string, unknown> = { client: false };
      await expect(getDatabase(options as never)).rejects.toBeInstanceOf(
        DatabaseError,
      );
      expect(Object.keys(options)).toEqual(['client']);
    });
  });

  it('reusing a frozen in-memory SQLite options object reopens the same database', async () => {
    const options = Object.freeze({ type: 'sqlite', url: ':memory:' });
    const first = await getDatabase(options as never);
    try {
      await first.query('CREATE TABLE frozen_reuse (id INTEGER PRIMARY KEY)');
      const second = await getDatabase(options as never);
      expect(second).toBe(first);
      await second.query('SELECT * FROM frozen_reuse');
    } finally {
      await first.close?.();
    }
  });
});
