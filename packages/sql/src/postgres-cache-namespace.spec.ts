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
  const legacy = (globalThis as Record<string, unknown>)[LEGACY_SLOT] as
    | ConnectionCache<DatabaseInterface>
    | undefined;
  await legacy?.clear(async () => {});
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

function standIn(): DatabaseInterface {
  return { url, client: {}, query: async () => ({ rows: [] }) } as never;
}

describe('PostgreSQL connection cache namespace', () => {
  it('derives v2 keys and prefixes explicit dbid keys', async () => {
    expect(await getPostgresConnectionCacheKey({ url })).toMatch(
      /^pg:hmac-sha256:v2:[0-9a-f]{64}$/,
    );
    expect(await getPostgresConnectionCacheKey({ dbid: 'caller-id' })).toBe(
      'pg:dbid:v2:caller-id',
    );
  });

  it('keeps its entries out of the slot older copies read', async () => {
    const db = await getDatabase({ type: 'postgres', url });
    expect(isDatabaseRoot(db)).toBe(true);
    expect(
      (globalThis as Record<string, unknown>)
        .__haveSqlPostgresConnectionCacheV2,
    ).toBeInstanceOf(Object);
    expect(
      (globalThis as Record<string, unknown>)[LEGACY_SLOT],
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
});
