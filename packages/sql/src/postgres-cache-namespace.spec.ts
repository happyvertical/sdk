import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeHandle, getDatabase, isDatabaseRoot } from './index';
import { getPostgresConnectionCacheKey } from './postgres';
import { ConnectionCache } from './shared/connection-cache';
import type { DatabaseInterface } from './shared/types';

/**
 * An older copy of this package in the same process ignores a `client` option
 * and reads the PostgreSQL connection cache it finds on `globalThis`. This
 * copy keeps its entries where an older copy cannot derive them, so an older
 * copy's open can never return an object this copy created and described as
 * a root (sdk#1249).
 */

const LEGACY_SLOT = '__haveSqlPostgresConnectionCache';
const url = 'postgresql://hv:secret@db.invalid:5432/hv_namespace';

const envKeys = [
  'HAVE_SQL_URL',
  'HAVE_SQL_HOST',
  'HAVE_SQL_PORT',
  'HAVE_SQL_DATABASE',
  'HAVE_SQL_USER',
  'HAVE_SQL_PASSWORD',
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  // Empty, never replace, the legacy slot: on a build that still used it,
  // the adapter holds a reference to that same cache object.
  for (const name of [LEGACY_SLOT, V118_SLOT]) {
    const older = (globalThis as Record<string, unknown>)[name] as
      | ConnectionCache<DatabaseInterface>
      | undefined;
    await older?.clear(async () => {});
  }
  const { clearPostgresConnectionCache } = await import('./index');
  await clearPostgresConnectionCache();
});

/** The cache key an older copy (v1 domain) derives for `{ url }`. */
async function legacyKey(): Promise<string> {
  const identity = JSON.stringify({
    url,
    host: 'localhost',
    port: 5432,
    database: null,
    user: null,
    password: null,
    max: 20,
    connectionTimeoutMillis: null,
    idleTimeoutMillis: null,
  });
  const hmacKey = await (
    globalThis as { __haveSqlPostgresCacheHmacKey?: Promise<CryptoKey> }
  ).__haveSqlPostgresCacheHmacKey;
  if (!hmacKey) throw new Error('HMAC key not generated yet');
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(
      `@happyvertical/sql:postgres-cache:v1\0${identity}`,
    ),
  );
  return `pg:hmac-sha256:v1:${Buffer.from(signature).toString('hex')}`;
}

/** What an older copy's `getDatabase({ type: 'postgres', client, url })` does. */
async function legacyOpen(
  create: () => Promise<DatabaseInterface>,
): Promise<DatabaseInterface> {
  const slot = globalThis as Record<string, unknown>;
  slot[LEGACY_SLOT] ??= new ConnectionCache<DatabaseInterface>();
  const cache = slot[LEGACY_SLOT] as ConnectionCache<DatabaseInterface>;
  return cache.getOrCreate(await legacyKey(), {}, create, async () => {});
}

/**
 * A 0.118.0 copy: it reads the V2 slot with v2 keys, ignores `client`, and
 * records the roots it creates in the provenance registry it shares through
 * `Symbol.for('@happyvertical/sql/handle-provenance:v1')`.
 */
const V118_SLOT = '__haveSqlPostgresConnectionCacheV2';
const V118_REGISTRY = Symbol.for('@happyvertical/sql/handle-provenance:v1');

async function v118Key(): Promise<string> {
  const identity = JSON.stringify({
    url,
    host: 'localhost',
    port: 5432,
    database: null,
    user: null,
    password: null,
    max: 20,
    connectionTimeoutMillis: null,
    idleTimeoutMillis: null,
  });
  await getPostgresConnectionCacheKey({ url }); // the shared HMAC key exists
  const hmacKey = await (
    globalThis as { __haveSqlPostgresCacheHmacKey?: Promise<CryptoKey> }
  ).__haveSqlPostgresCacheHmacKey;
  if (!hmacKey) throw new Error('HMAC key not generated yet');
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(
      `@happyvertical/sql:postgres-cache:v2\0${identity}`,
    ),
  );
  return `pg:hmac-sha256:v2:${Buffer.from(signature).toString('hex')}`;
}

function v118Registry(): WeakMap<object, unknown> {
  const host = globalThis as Record<PropertyKey, unknown>;
  if (!Object.getOwnPropertyDescriptor(host, V118_REGISTRY)) {
    Object.defineProperty(host, V118_REGISTRY, {
      value: Object.freeze({ version: 1, records: new WeakMap() }),
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
  return (host[V118_REGISTRY] as { records: WeakMap<object, unknown> }).records;
}

/** What a 0.118.0 copy's `getDatabase({ type: 'postgres', client, url })` does. */
async function v118Open(
  create: () => Promise<DatabaseInterface>,
): Promise<DatabaseInterface> {
  const slot = globalThis as Record<string, unknown>;
  slot[V118_SLOT] ??= new ConnectionCache<DatabaseInterface>();
  const cache = slot[V118_SLOT] as ConnectionCache<DatabaseInterface>;
  return cache.getOrCreate(
    await v118Key(),
    {},
    async () => {
      const db = await create();
      if (!v118Registry().has(db)) {
        v118Registry().set(
          db,
          Object.freeze({
            role: 'root',
            engine: 'postgres',
            owner: Object.freeze({}),
            rootReads: 'isolated',
            clientSource: 'adapter',
          }),
        );
      }
      return db;
    },
    async () => {},
  );
}

function standIn(): DatabaseInterface {
  return { url, client: {}, query: async () => ({ rows: [] }) } as never;
}

describe('PostgreSQL connection cache namespace', () => {
  it('derives v3 keys and prefixes explicit dbid keys', async () => {
    expect(await getPostgresConnectionCacheKey({ url })).toMatch(
      /^pg:hmac-sha256:v3:[0-9a-f]{64}$/,
    );
    expect(await getPostgresConnectionCacheKey({ dbid: 'caller-id' })).toBe(
      'pg:dbid:v3:caller-id',
    );
  });

  it('keeps its entries out of the slot older copies read', async () => {
    const db = await getDatabase({ type: 'postgres', url });
    expect(isDatabaseRoot(db)).toBe(true);
    expect(
      (globalThis as Record<string, unknown>)
        .__haveSqlPostgresConnectionCacheV3,
    ).toBeInstanceOf(Object);
    expect(
      (globalThis as Record<string, unknown>)[LEGACY_SLOT],
    ).toBeUndefined();
    expect(
      (globalThis as Record<string, unknown>)[V118_SLOT] as
        | ConnectionCache<DatabaseInterface>
        | undefined,
    ).toBeUndefined();
  });

  it('an older copy’s client open after a new URL open never returns the claimed root', async () => {
    const db = await getDatabase({ type: 'postgres', url });
    const sentinel = standIn();
    const older = await legacyOpen(async () => sentinel);
    expect(older).toBe(sentinel);
    expect(older).not.toBe(db);
    expect(isDatabaseRoot(older)).toBe(false);
    expect(describeHandle(older).role).toBe('unknown');
  });

  it('a new URL open after an older copy’s client open returns its own root', async () => {
    // Generate the shared HMAC key first, as any earlier open would.
    await getPostgresConnectionCacheKey({ url });
    const sentinel = standIn();
    expect(await legacyOpen(async () => sentinel)).toBe(sentinel);
    const db = await getDatabase({ type: 'postgres', url });
    expect(db).not.toBe(sentinel);
    expect(isDatabaseRoot(db)).toBe(true);
    expect(isDatabaseRoot(sentinel)).toBe(false);
  });

  // 0.118.0 records roots but ignores `client`, so a pool it hands to a
  // `{ client, url }` open is not something this copy may call a root.
  it('a 0.118.0 copy’s client open after a new URL open never returns this copy’s root, nor one it calls a root', async () => {
    const db = await getDatabase({ type: 'postgres', url });
    const sentinel = standIn();
    const older = await v118Open(async () => sentinel);
    expect(older).not.toBe(db);
    expect(isDatabaseRoot(older)).toBe(false);
    expect(describeHandle(older).role).toBe('unknown');
    expect(isDatabaseRoot(db)).toBe(true);
  });

  it('a new URL open after a 0.118.0 copy’s client open returns its own root, and the older pool is not a root here', async () => {
    const sentinel = standIn();
    expect(await v118Open(async () => sentinel)).toBe(sentinel);
    const db = await getDatabase({ type: 'postgres', url });
    expect(db).not.toBe(sentinel);
    expect(isDatabaseRoot(db)).toBe(true);
    expect(isDatabaseRoot(sentinel)).toBe(false);
    expect(describeHandle(sentinel).role).toBe('unknown');
  });
});
