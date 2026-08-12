import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDatabase } from './index';
import {
  clearPostgresConnectionCache,
  getPostgresConnectionCacheKey,
  getDatabase as getPostgresDatabase,
} from './postgres';
import { ConnectionCache } from './shared/connection-cache';
import { createDuckDBResourceCloser } from './shared/duckdb-resources';
import { redactDatabaseUrl } from './shared/redact-database-url';
import { getCachedSqliteDatabase } from './shared/sqlite-connection-cache';
import {
  createNativeSqliteCloser,
  getNativeSqliteDatabase,
} from './sqlite-native';

const jsonDirectories: string[] = [];

afterEach(async () => {
  await clearPostgresConnectionCache();
  for (const directory of jsonDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('shared connection cache policy', () => {
  it('does not retain or deduplicate cache:false resources', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let created = 0;

    const first = await cache.getOrCreate(
      'unique-namespace-1',
      { cache: false },
      async () => ({ id: ++created }),
      async () => {},
    );
    const second = await cache.getOrCreate(
      'unique-namespace-2',
      { cache: false },
      async () => ({ id: ++created }),
      async () => {},
    );

    expect(first).not.toBe(second);
    expect(cache.size).toBe(0);
  });

  it('awaits eviction closure before returning a replacement', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let created = 0;
    let releaseClose: (() => void) | undefined;
    const closeStarted = vi.fn();
    const close = async () => {
      closeStarted();
      await new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
    };

    const first = await cache.getOrCreate(
      'db',
      {},
      async () => ({ id: ++created }),
      close,
    );
    const replacementPromise = cache.getOrCreate(
      'db',
      { clearCache: true },
      async () => ({ id: ++created }),
      close,
    );

    await vi.waitFor(() => expect(closeStarted).toHaveBeenCalledOnce());
    expect(created).toBe(1);
    releaseClose?.();
    const replacement = await replacementPromise;
    expect(replacement).not.toBe(first);
    expect(created).toBe(2);
  });

  it('blocks ordinary same-key callers behind an active eviction', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let created = 0;
    let releaseClose: (() => void) | undefined;
    const closeStarted = vi.fn();
    const create = async () => ({ id: ++created });
    const close = async () => {
      closeStarted();
      await new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
    };
    await cache.getOrCreate('db', {}, create, close);

    const eviction = cache.evict('db', close);
    await vi.waitFor(() => expect(closeStarted).toHaveBeenCalledOnce());
    const ordinaryCaller = cache.getOrCreate('db', {}, create, close);
    await Promise.resolve();
    expect(created).toBe(1);

    releaseClose?.();
    await eviction;
    expect((await ordinaryCaller).id).toBe(2);
  });

  it('cannot republish an initializer that eviction caught in flight', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let releaseFirst: ((value: { id: number }) => void) | undefined;
    let created = 0;
    const closed: number[] = [];
    let releaseClose: (() => void) | undefined;
    const create = () => {
      created += 1;
      if (created === 1) {
        return new Promise<{ id: number }>((resolve) => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve({ id: created });
    };
    const close = async (value: { id: number }) => {
      closed.push(value.id);
      await new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
    };

    const initializing = cache.getOrCreate('db', {}, create, close);
    const eviction = cache.evict('db', close);
    releaseFirst?.({ id: 1 });

    await vi.waitFor(() => expect(closed).toEqual([1]));
    expect(created).toBe(1);
    releaseClose?.();
    await eviction;
    const initialized = await initializing;
    const cached = await cache.getOrCreate('db', {}, create, close);

    expect(closed).toEqual([1]);
    expect(initialized.id).toBe(2);
    expect(cached).toBe(initialized);
    expect(created).toBe(2);
  });

  it('replaces a rejected stale initializer after eviction', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let rejectFirst: ((error: Error) => void) | undefined;
    let created = 0;
    const create = () => {
      created += 1;
      if (created === 1) {
        return new Promise<{ id: number }>((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Promise.resolve({ id: created });
    };
    const initializing = cache.getOrCreate('db', {}, create, async () => {});
    const replacement = cache.getOrCreate(
      'db',
      { clearCache: true },
      create,
      async () => {},
    );
    rejectFirst?.(new Error('stale initialization failed'));

    await expect(initializing).rejects.toThrow('stale initialization failed');
    await expect(replacement).resolves.toEqual({ id: 2 });
  });

  it('reclaims namespace state after unique evictions', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    for (let index = 0; index < 1_000; index += 1) {
      await cache.evict(`unique-${index}`, async () => {});
    }
    expect(cache.size).toBe(0);
  });

  it('cancels an initializer caught by clear without repopulating', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let releaseFirst: ((value: { id: number }) => void) | undefined;
    const initializing = cache.getOrCreate(
      'db',
      {},
      () =>
        new Promise<{ id: number }>((resolve) => {
          releaseFirst = resolve;
        }),
      async () => {},
    );
    const clearing = cache.clear(async () => {});
    releaseFirst?.({ id: 1 });

    await clearing;
    expect(cache.size).toBe(0);
    await expect(initializing).rejects.toThrow(
      'Database connection initialization was cancelled by cache clear',
    );
    expect(cache.size).toBe(0);
  });

  it('upgrades an active eviction to clear cancellation', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let releaseFirst: ((value: { id: number }) => void) | undefined;
    let created = 0;
    const initializing = cache.getOrCreate(
      'db',
      {},
      () => {
        created += 1;
        return new Promise<{ id: number }>((resolve) => {
          releaseFirst = resolve;
        });
      },
      async () => {},
    );
    const eviction = cache.evict('db', async () => {});
    const clearing = cache.clear(async () => {});
    releaseFirst?.({ id: 1 });

    await Promise.all([eviction, clearing]);
    await expect(initializing).rejects.toThrow(
      'Database connection initialization was cancelled by cache clear',
    );
    expect(created).toBe(1);
    expect(cache.size).toBe(0);
  });

  it('cancels a same-key caller already queued behind eviction', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let created = 0;
    let releaseClose: (() => void) | undefined;
    const create = async () => ({ id: ++created });
    const close = async () =>
      new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
    await cache.getOrCreate('db', {}, create, close);

    const eviction = cache.evict('db', close);
    await vi.waitFor(() => expect(releaseClose).toBeTypeOf('function'));
    const queued = cache.getOrCreate('db', {}, create, close);
    const clearing = cache.clear(close);
    releaseClose?.();

    await Promise.all([eviction, clearing]);
    await expect(queued).rejects.toThrow(
      'Database connection initialization was cancelled by cache clear',
    );
    expect(created).toBe(1);
    expect(cache.size).toBe(0);
  });

  it('does not serve a replacement until a failed close is retried successfully', async () => {
    const cache = new ConnectionCache<{ id: number }>();
    let created = 0;
    let closes = 0;
    const create = async () => ({ id: ++created });
    const close = async () => {
      closes += 1;
      if (closes === 1) throw new Error('close failed');
    };
    await cache.getOrCreate('db', {}, create, close);
    const firstClear = cache.getOrCreate(
      'db',
      { clearCache: true },
      create,
      close,
    );
    const secondClear = cache.getOrCreate(
      'db',
      { clearCache: true },
      create,
      close,
    );
    await expect(firstClear).rejects.toThrow('close failed');
    await expect(secondClear).rejects.toThrow('close failed');
    expect(created).toBe(1);
    await expect(cache.getOrCreate('db', {}, create, close)).rejects.toThrow(
      'close failed',
    );
    await expect(
      cache.getOrCreate('db', { clearCache: true }, create, close),
    ).resolves.toEqual({ id: 2 });
  });

  it('awaits every key close and retries only failed resources', async () => {
    const cache = new ConnectionCache<{ id: string }>();
    let releaseB: (() => void) | undefined;
    let aCloses = 0;
    let bCloses = 0;
    const close = async ({ id }: { id: string }) => {
      if (id === 'a') {
        aCloses += 1;
        if (aCloses === 1) throw new Error('a close failed');
        return;
      }
      bCloses += 1;
      await new Promise<void>((resolve) => {
        releaseB = resolve;
      });
    };
    await cache.getOrCreate('a', {}, async () => ({ id: 'a' }), close);
    await cache.getOrCreate('b', {}, async () => ({ id: 'b' }), close);
    const clearing = cache.clear(close);
    await vi.waitFor(() => expect(releaseB).toBeTypeOf('function'));
    let settled = false;
    void clearing
      .catch(() => {})
      .finally(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseB?.();
    await expect(clearing).rejects.toThrow('a close failed');
    expect(bCloses).toBe(1);
    await cache.clear(close);
    expect(aCloses).toBe(2);
    expect(bCloses).toBe(1);
  });
});

describe('PostgreSQL cache identity', () => {
  it('uses explicit opaque dbid unchanged and a keyed secret-sensitive implicit identity', async () => {
    const explicit = await getPostgresConnectionCacheKey({
      dbid: 'caller-owned-identity',
      password: 'ignored-by-explicit-id',
    });
    const firstOptions = {
      url: 'postgresql://cache-user:first-secret@localhost:5432/cache-db',
      user: 'cache-user',
      password: 'first-secret',
      max: 7,
    };
    const rotatedOptions = {
      ...firstOptions,
      url: firstOptions.url.replace('first-secret', 'second-secret'),
      password: 'second-secret',
    };
    const firstKey = await getPostgresConnectionCacheKey(firstOptions);
    const rotatedKey = await getPostgresConnectionCacheKey(rotatedOptions);

    expect(explicit).toBe('caller-owned-identity');
    expect(firstKey).not.toBe(rotatedKey);
    expect(firstKey).toMatch(/^pg:hmac-sha256:v1:[a-f0-9]{64}$/);
    expect(firstKey).not.toContain('cache-user');
    expect(firstKey).not.toContain('first-secret');
    expect(firstKey).not.toContain('url');
    expect(firstKey).not.toContain('password');
    expect(firstKey).not.toContain('max');
  });

  it('does not reuse a pool after password rotation or with cache:false', async () => {
    const base = {
      host: 'localhost',
      port: 5432,
      database: 'cache-policy-test',
      user: 'cache-policy-user',
    };
    const first = await getPostgresDatabase({ ...base, password: 'one' });
    const rotated = await getPostgresDatabase({ ...base, password: 'two' });
    const uncachedOne = await getPostgresDatabase({
      ...base,
      password: 'one',
      cache: false,
    });
    const uncachedTwo = await getPostgresDatabase({
      ...base,
      password: 'one',
      cache: false,
    });

    expect(rotated.client).not.toBe(first.client);
    expect(uncachedOne.client).not.toBe(first.client);
    expect(uncachedTwo.client).not.toBe(uncachedOne.client);
    await uncachedOne.close?.();
    await uncachedTwo.close?.();
  });

  it('distinguishes explicit empty credentials from environment credentials', async () => {
    const previousPassword = process.env.HAVE_SQL_PASSWORD;
    process.env.HAVE_SQL_PASSWORD = 'environment-password';
    try {
      const base = {
        database: 'cache-policy-empty-credential',
        user: 'cache-policy-user',
      };
      const inheritedKey = await getPostgresConnectionCacheKey(base);
      const emptyKey = await getPostgresConnectionCacheKey({
        ...base,
        password: '',
      });
      const inherited = await getPostgresDatabase(base);
      const explicitEmpty = await getPostgresDatabase({
        ...base,
        password: '',
      });

      expect(emptyKey).not.toBe(inheritedKey);
      expect(explicitEmpty.client).not.toBe(inherited.client);
      await inherited.close?.();
      await explicitEmpty.close?.();
    } finally {
      if (previousPassword === undefined) {
        delete process.env.HAVE_SQL_PASSWORD;
      } else {
        process.env.HAVE_SQL_PASSWORD = previousPassword;
      }
    }
  });

  it('rejects a malformed environment port before identity or pool creation', async () => {
    const previous = process.env.HAVE_SQL_PORT;
    process.env.HAVE_SQL_PORT = 'not-a-port';
    try {
      await expect(
        getPostgresConnectionCacheKey({ database: 'env-port' }),
      ).rejects.toThrow('port');
    } finally {
      if (previous === undefined) delete process.env.HAVE_SQL_PORT;
      else process.env.HAVE_SQL_PORT = previous;
    }
  });

  it.each([
    { option: { max: Number.NaN }, message: 'pool max' },
    { option: { max: Number.POSITIVE_INFINITY }, message: 'pool max' },
    { option: { port: Number.NaN }, message: 'port' },
    { option: { port: 0 }, message: 'port' },
    { option: { port: 65_536 }, message: 'port' },
  ])('rejects invalid PostgreSQL pool identity input: $option', async ({
    option,
    message,
  }) => {
    await expect(
      getPostgresDatabase({
        database: 'cache-policy-invalid-number',
        ...option,
      }),
    ).rejects.toThrow(message);
  });

  it('coalesces concurrent pool shutdown calls', async () => {
    const db = await getPostgresDatabase({
      dbid: 'postgres-idempotent-close',
      database: 'cache-policy-test',
    });
    await expect(
      Promise.all([db.close?.(), db.close?.(), db.client.end()]),
    ).resolves.toHaveLength(3);
  });

  it('awaits pool closure before returning an evicted replacement', async () => {
    const options = {
      dbid: 'postgres-awaited-eviction',
      database: 'cache-policy-test',
    };
    const first = await getPostgresDatabase(options);
    const originalClose = first.close?.bind(first);
    let releaseClose: (() => void) | undefined;
    const closeStarted = vi.fn();
    vi.spyOn(first, 'close').mockImplementation(async () => {
      closeStarted();
      await new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
      await originalClose?.();
    });

    const replacementPromise = getPostgresDatabase({
      ...options,
      clearCache: true,
    });
    await vi.waitFor(() => expect(closeStarted).toHaveBeenCalledOnce());
    releaseClose?.();
    const replacement = await replacementPromise;

    expect(replacement).not.toBe(first);
    await replacement.close?.();
  });
});

describe('adapter resource semantics', () => {
  it('retries a failed SQLite close while deduplicating the active attempt', async () => {
    let closeCalls = 0;
    const fake = {
      close: async () => {
        closeCalls += 1;
        if (closeCalls === 1) throw new Error('synthetic close failure');
      },
    };
    const db = await getCachedSqliteDatabase(
      'libsql',
      { dbid: 'sqlite-close-retry' },
      async () => fake as never,
    );
    await expect(Promise.all([db.close?.(), db.close?.()])).rejects.toThrow(
      'synthetic close failure',
    );
    expect(closeCalls).toBe(1);
    await expect(db.close?.()).resolves.toBeUndefined();
    expect(closeCalls).toBe(2);
  });

  it('fails both SQLite paths closed until a dbid-wide clear retry succeeds', async () => {
    const dbid = 'sqlite-group-close-retry';
    let releaseClose: (() => void) | undefined;
    let closeCalls = 0;
    let libsqlCreates = 0;
    const native = {
      close: async () => {
        closeCalls += 1;
        if (closeCalls === 1) {
          await new Promise<void>((resolve) => {
            releaseClose = resolve;
          });
          throw new Error('native group close failed');
        }
      },
    };
    await getCachedSqliteDatabase(
      'native',
      { dbid },
      async () => native as never,
    );
    const clearing = getCachedSqliteDatabase(
      'libsql',
      { dbid, clearCache: true },
      async () => ({ id: ++libsqlCreates }) as never,
    );
    await vi.waitFor(() => expect(releaseClose).toBeTypeOf('function'));
    const ordinary = getCachedSqliteDatabase(
      'libsql',
      { dbid },
      async () => ({ id: ++libsqlCreates }) as never,
    );
    await Promise.resolve();
    expect(libsqlCreates).toBe(0);
    releaseClose?.();
    await expect(clearing).rejects.toThrow('native group close failed');
    await expect(ordinary).rejects.toThrow('native group close failed');
    await expect(
      getCachedSqliteDatabase(
        'libsql',
        { dbid },
        async () => ({ id: ++libsqlCreates }) as never,
      ),
    ).rejects.toThrow('native group close failed');

    const recovered = await getCachedSqliteDatabase(
      'libsql',
      { dbid, clearCache: true },
      async () => ({ id: ++libsqlCreates }) as never,
    );
    expect(recovered).toMatchObject({ id: 1 });
    expect(closeCalls).toBe(2);
  });

  it.each([
    undefined,
    null,
    false,
    0,
    '',
  ])('retains a falsy SQLite group close rejection: %s', async (reason) => {
    const dbid = `sqlite-falsy-close-${String(reason)}`;
    let closeCalls = 0;
    await getCachedSqliteDatabase(
      'native',
      { dbid },
      async () =>
        ({
          close: async () => {
            closeCalls += 1;
            if (closeCalls === 1) throw reason;
          },
        }) as never,
    );
    const clearOutcome = await getCachedSqliteDatabase(
      'libsql',
      { dbid, clearCache: true },
      async () => ({}) as never,
    ).then(
      () => ({ fulfilled: true, reason: undefined }),
      (caught) => ({ fulfilled: false, reason: caught }),
    );
    expect(clearOutcome).toEqual({ fulfilled: false, reason });
    const ordinaryOutcome = await getCachedSqliteDatabase(
      'libsql',
      { dbid },
      async () => ({}) as never,
    ).then(
      () => ({ fulfilled: true, reason: undefined }),
      (caught) => ({ fulfilled: false, reason: caught }),
    );
    expect(ordinaryOutcome).toEqual({ fulfilled: false, reason });
    await expect(
      getCachedSqliteDatabase(
        'libsql',
        { dbid, clearCache: true },
        async () => ({}) as never,
      ),
    ).resolves.toBeDefined();
    expect(closeCalls).toBe(2);
  });

  it('retries only failed native SQLite resources after attempting all closes', async () => {
    let listenerCalls = 0;
    let honkerCalls = 0;
    let databaseCalls = 0;
    const listener = {
      close() {
        listenerCalls += 1;
      },
    };
    const close = createNativeSqliteCloser(
      new Set([listener]),
      {
        close() {
          honkerCalls += 1;
        },
      },
      {
        close() {
          databaseCalls += 1;
          if (databaseCalls === 1)
            throw new Error('native database close failed');
        },
      },
    );
    await expect(Promise.all([close(), close()])).rejects.toThrow(
      'native database close failed',
    );
    expect([listenerCalls, honkerCalls, databaseCalls]).toEqual([1, 1, 1]);
    await expect(close()).resolves.toBeUndefined();
    expect([listenerCalls, honkerCalls, databaseCalls]).toEqual([1, 1, 2]);
  });
  it.each([
    'postgres',
    'sqlite',
    'json',
    'duckdb',
  ] as const)('rejects an empty dbid for %s', async (type) => {
    await expect(
      getDatabase({
        type,
        dbid: '',
        url: type === 'json' ? '/unused' : ':memory:',
      } as never),
    ).rejects.toThrow('non-empty');
  });

  it('redacts malformed URL credentials and credential-shaped query params', () => {
    const secret = 'synthetic-secret';
    for (const delimiter of ['', '/extra', '?extra', '#extra']) {
      const redacted = redactDatabaseUrl(
        `https://user:${secret}${delimiter}@[invalid/path?authToken=${secret}&api_key=${secret}`,
      );
      expect(redacted).not.toContain(secret);
      expect(redacted).not.toContain('user:');
    }
  });

  it('redacts whitespace-bearing credentials in malformed URLs', () => {
    const secret = 'abc def';
    const redacted = redactDatabaseUrl(`https://user:${secret}@[invalid/path`);
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain('user:');
  });

  it('does not expose whitespace-bearing LibSQL credentials in adapter errors', async () => {
    const secret = 'adapter secret';
    let caught: unknown;
    try {
      await getDatabase({
        type: 'sqlite',
        cache: false,
        url: `https://user:${secret}@[invalid`,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it.each([
    't%6fken',
    'p%61ssword',
    'se%63ret',
    'api_%6bey',
  ])('redacts malformed URL values for encoded credential key %s', async (encodedKey) => {
    const secret = 'encoded-query-secret';
    const malformedUrl = `libsql://[invalid?${encodedKey}=${secret}`;
    expect(redactDatabaseUrl(malformedUrl)).not.toContain(secret);

    let caught: unknown;
    try {
      await getDatabase({
        type: 'sqlite',
        cache: false,
        url: malformedUrl,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it.each([
    'libsql://[invalid?token=LEFTSECRET@RIGHTSECRET',
    'libsql://[invalid#LEFTSECRET@RIGHTSECRET',
  ])('redacts malformed secret suffix containing @ in %s', async (url) => {
    expect(redactDatabaseUrl(url)).not.toContain('LEFTSECRET');
    expect(redactDatabaseUrl(url)).not.toContain('RIGHTSECRET');

    let caught: unknown;
    try {
      await getDatabase({ type: 'sqlite', cache: false, url });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain('LEFTSECRET');
    expect(JSON.stringify(caught)).not.toContain('RIGHTSECRET');
    expect(String(caught)).not.toContain('LEFTSECRET');
    expect(String(caught)).not.toContain('RIGHTSECRET');
  });

  it.each([
    ['libsql:/user:ONESLASHSECRET@[invalid', 'ONESLASHSECRET'],
    ['https:/user:HTTPSECRET@[invalid', 'HTTPSECRET'],
    [' libsql:/user:LEADSECRET@[invalid', 'LEADSECRET'],
    ['\tlibsql:/user:TABSECRET@[invalid', 'TABSECRET'],
    ['libsql:///user:TRIPLESECRET@host', 'TRIPLESECRET'],
    ['libsql:////user:FOURSECRET@host', 'FOURSECRET'],
    ['libsql:///user:ENCSECRET%40host', 'ENCSECRET'],
    ['lib\nsql:/user:INNERSECRET@[invalid', 'INNERSECRET'],
    ['ht\ttps:/user:INNERSECRET@[invalid', 'INNERSECRET'],
    ['lib\rsql:/user:INNERSECRET@[invalid', 'INNERSECRET'],
    ['libsql\n:/user:INNERSECRET@[invalid', 'INNERSECRET'],
  ])('does not reclassify malformed remote URL %s as a local file', async (url, secret) => {
    expect(redactDatabaseUrl(url)).not.toContain(secret);

    let caught: unknown;
    try {
      await getDatabase({ type: 'sqlite', cache: false, url });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it('does not expose malformed LibSQL URL credentials in adapter errors', async () => {
    const secret = 'synthetic-libsql-secret';
    let caught: unknown;
    try {
      await getDatabase({
        type: 'sqlite',
        cache: false,
        url: `https://user:${secret}@[invalid/path?authToken=${secret}`,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it.each([
    '/extra',
    '?extra',
    '#extra',
  ])('redacts malformed LibSQL credentials containing %s before @', async (delimiter) => {
    const secret = 'synthetic-reserved-secret';
    let caught: unknown;
    try {
      await getDatabase({
        type: 'sqlite',
        cache: false,
        url: `https://user:${secret}${delimiter}@[invalid`,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it('redacts credential-shaped LibSQL URL fragments in adapter errors', async () => {
    const secret = 'fragment-synthetic-secret';
    let caught: unknown;
    try {
      await getDatabase({
        type: 'sqlite',
        cache: false,
        url: `libsql://user:password@%#authToken=${secret}`,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(String(caught)).not.toContain(secret);
  });

  it('attempts both DuckDB closes and retries only the resource that failed', async () => {
    let connectionCalls = 0;
    let instanceCalls = 0;
    const close = createDuckDBResourceCloser(
      {
        closeSync() {
          connectionCalls += 1;
          if (connectionCalls === 1) throw new Error('connection close failed');
        },
      },
      {
        closeSync() {
          instanceCalls += 1;
        },
      },
    );
    await expect(close()).rejects.toThrow('connection close failed');
    expect(instanceCalls).toBe(1);
    await expect(close()).resolves.toBeUndefined();
    await close();
    expect(connectionCalls).toBe(2);
    expect(instanceCalls).toBe(1);
  });
  it('closes and recreates a cached SQLite adapter', async () => {
    const options = {
      type: 'sqlite' as const,
      url: ':memory:',
      dbid: 'sqlite-cache-policy',
    };
    const uncachedOne = await getDatabase({ ...options, cache: false });
    const uncachedTwo = await getDatabase({ ...options, cache: false });
    expect(uncachedTwo).not.toBe(uncachedOne);
    expect(await uncachedOne.pluck`SELECT 1`).toBe(1);
    expect(await uncachedTwo.pluck`SELECT 2`).toBe(2);
    await uncachedOne.close?.();
    await uncachedTwo.close?.();

    const first = await getDatabase(options);
    const close = vi.spyOn(first, 'close');
    const replacement = await getDatabase({ ...options, clearCache: true });

    expect(close).toHaveBeenCalledOnce();
    expect(replacement).not.toBe(first);
    expect(await replacement.pluck`SELECT 1`).toBe(1);
    await replacement.close?.();
  });

  it('evicts a native SQLite adapter through the LibSQL path', async () => {
    const options = {
      url: ':memory:',
      dbid: 'sqlite-native-to-libsql',
    };
    const native = await getNativeSqliteDatabase(options);
    const close = vi.spyOn(native, 'close');
    const libsql = await getDatabase({
      ...options,
      type: 'sqlite',
      clearCache: true,
    });

    expect(close).toHaveBeenCalledOnce();
    expect(libsql).not.toBe(native);
    expect(await libsql.pluck`SELECT 1`).toBe(1);
    await libsql.close?.();
  });

  it('evicts a LibSQL adapter through the native SQLite path', async () => {
    const options = {
      url: ':memory:',
      dbid: 'sqlite-libsql-to-native',
    };
    const libsql = await getDatabase({ type: 'sqlite', ...options });
    const close = vi.spyOn(libsql, 'close');
    const native = await getNativeSqliteDatabase({
      ...options,
      clearCache: true,
    });

    expect(close).toHaveBeenCalledOnce();
    expect(native).not.toBe(libsql);
    expect(await native.pluck`SELECT 1`).toBe(1);
    await native.close?.();
  });

  it('returns distinct usable uncached JSON adapters and closes on eviction', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'have-sql-cache-policy-'));
    jsonDirectories.push(directory);
    const options = { type: 'json' as const, url: directory };
    const uncachedOne = await getDatabase({ ...options, cache: false });
    const uncachedTwo = await getDatabase({ ...options, cache: false });
    expect(uncachedTwo).not.toBe(uncachedOne);
    expect(await uncachedOne.pluck`SELECT 1`).toBe(1);
    expect(await uncachedTwo.pluck`SELECT 2`).toBe(2);
    await uncachedOne.close?.();
    await uncachedTwo.close?.();

    const cached = await getDatabase(options);
    const close = vi.spyOn(cached, 'close');
    const replacement = await getDatabase({ ...options, clearCache: true });
    expect(close).toHaveBeenCalledOnce();
    expect(replacement).not.toBe(cached);
    await replacement.close?.();
  });

  it('documents DuckDB flags as fresh-per-call no-ops', async () => {
    const first = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      cache: true,
    });
    const second = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      clearCache: true,
    });

    expect(second).not.toBe(first);
    expect(await first.pluck`SELECT 1`).toBe(1);
    expect(await second.pluck`SELECT 2`).toBe(2);
    await first.close?.();
    await second.close?.();
  });

  it('preserves DatabaseError context for DuckDB initialization failures', async () => {
    let caught: unknown;
    try {
      await getDatabase({
        type: 'duckdb',
        url: ':memory:',
        schemas: { broken: { ddl: 'THIS IS NOT SQL' } },
      } as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('DatabaseError');
    expect(String(caught)).toContain('Failed to create DuckDB connection');
    expect(JSON.stringify(caught)).toContain(':memory:');
  });
});
