import { DatabaseError } from '@happyvertical/utils';

/**
 * Refuses a `client` option on an adapter that does not use one.
 *
 * Only PGlite uses an injected client. The other adapters used to drop the
 * option and open a connection from the URL, connection fields or the
 * environment, so a caller who supplied a role- or schema-scoped client got a
 * different connection without being told, and (on PostgreSQL) the same
 * cached pool as a plain URL open. Refusing before any cache lookup makes that
 * impossible. `undefined` and `null` count as absent.
 */
export function refuseUnusedClientOption(
  options: object,
  adapter: 'postgres' | 'sqlite' | 'duckdb' | 'json',
): void {
  const client = (options as { client?: unknown }).client;
  if (client === undefined || client === null) return;
  throw new DatabaseError(
    `The ${adapter} adapter does not accept a client option: it never uses a supplied client and would open its own connection instead.`,
    {
      adapter,
      hint:
        adapter === 'postgres'
          ? 'Remove client only if connecting from url, the connection fields or the environment is what you intend. If your code needs the client it supplied (for example one bound to a role or schema), keep that binding through an integration that supports it, such as type: "pglite" with client for PGlite, or let this error propagate.'
          : 'Remove client only if opening the database from its url is what you intend; otherwise let this error propagate. Only the PGlite adapter (type: "pglite") accepts an injected client.',
    },
  );
}

/**
 * Every top-level option any adapter reads (the properties of
 * `DatabaseOptions`, `DatabaseCacheOptions`, `SqliteOptions`,
 * `PostgresOptions`, `DuckDBOptions`, `JSONOptions` and `PGliteOptions`),
 * except `client`, which the caller reads once itself. A spec pins this list
 * against those interfaces.
 */
export const OPEN_OPTION_NAMES = [
  'type',
  'url',
  'authToken',
  'encryptionKey',
  'transactionQueueTimeout',
  'dbid',
  'cache',
  'clearCache',
  'schemas',
  'capabilities',
  'secureFile',
  'database',
  'host',
  'user',
  'password',
  'port',
  'max',
  'connectionTimeoutMillis',
  'idleTimeoutMillis',
  'dataDir',
  'autoRegisterJSON',
  'writeStrategy',
  'persistent',
  'autoRegister',
  'eagerLoadTables',
  'onTableLoadError',
  'extensions',
  'pglite',
] as const;

/**
 * Captures the options of one `getDatabase()` call as a plain object, before
 * the call yields. Each supported option is read directly by name, once,
 * without enumerating the caller's object, so a getter, an inherited
 * property, a non-enumerable property or a Proxy `get` trap supplies its
 * value exactly as the caller exposes it. `client` is passed in, already read
 * once by the caller. Nothing the caller does to its object afterwards
 * (adding `client`, changing `url` or `dbid`) changes this open.
 *
 * Nested option objects (`capabilities`, `secureFile`, `pglite`) are kept by
 * reference.
 */
export function readOpenOptions(
  options: object,
  client: unknown,
): Record<string, unknown> {
  const source = options as Record<string, unknown>;
  const captured: Record<string, unknown> = {};
  for (const name of OPEN_OPTION_NAMES) {
    const value = source[name];
    if (value !== undefined || name in source) captured[name] = value;
  }
  // An explicitly present `client: undefined` is kept, so it still shadows a
  // HAVE_SQL_CLIENT environment value as a user-supplied option does.
  if (client !== undefined || 'client' in source) captured.client = client;
  return captured;
}

/**
 * Refuses a PGlite `client` that is present but not an object (`false`, `0`,
 * a string): treating it as "no client" would mark an adapter-owned root, and
 * using it would open nothing. `undefined` and `null` count as absent.
 */
export function refuseInvalidPGliteClient(client: unknown): void {
  if (
    client === undefined ||
    client === null ||
    typeof client === 'object' ||
    typeof client === 'function'
  ) {
    return;
  }
  throw new DatabaseError(
    'PGlite client must be a PGlite instance, or omitted',
    {
      adapter: 'pglite',
      hint: 'Pass a PGlite instance as client, or leave client out to let the adapter open its own.',
    },
  );
}

/** A process-unique identity for an in-memory SQLite database. */
export function generateMemoryDbId(): string {
  return `memory-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
