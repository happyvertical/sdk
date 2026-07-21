# @happyvertical/sql

Database interface with support for SQLite (via LibSQL/Turso), PostgreSQL, DuckDB, and a JSON adapter (DuckDB-backed). Provides a unified API across all backends with template literal queries, CRUD helpers, transactions, schema synchronization, and vector search (PostgreSQL via pgvector).

## Installation

```bash
pnpm add @happyvertical/sql
```

## Usage

### Connecting to a Database

```typescript
import { getDatabase } from '@happyvertical/sql';

// SQLite (in-memory)
const db = await getDatabase({ type: 'sqlite', url: ':memory:' });

// SQLite (file)
const fileDb = await getDatabase({ type: 'sqlite', url: 'file:./app.db' });

// LibSQL/Turso (remote)
const tursoDb = await getDatabase({
  type: 'sqlite',
  url: 'libsql://your-database.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// PostgreSQL
const pgDb = await getDatabase({
  type: 'postgres',
  url: 'postgresql://user:pass@localhost:5432/dbname',
});

// DuckDB with JSON file auto-registration
const duckDb = await getDatabase({
  type: 'duckdb',
  url: ':memory:',
  dataDir: './data',
  autoRegisterJSON: true,
});

// JSON adapter (DuckDB-backed, reads/writes JSON files)
const jsonDb = await getDatabase({
  type: 'json',
  url: './data',
  writeStrategy: 'immediate',
});
```

Configuration is also loaded from `HAVE_SQL_*` environment variables (e.g. `HAVE_SQL_TYPE`, `HAVE_SQL_URL`). User-provided options take precedence.

### Template Literal Queries

```typescript
// Returns all rows
const posts = await db.many`SELECT * FROM posts WHERE published = ${true}`;

// Returns a single row or null
const post = await db.single`SELECT * FROM posts WHERE id = ${postId}`;

// Returns first column of first row
const count = await db.pluck`SELECT COUNT(*) FROM posts WHERE author = ${name}`;

// Executes without returning results
await db.execute`DELETE FROM posts WHERE id = ${postId}`;
```

Shorthand aliases: `oo` (many), `oO` (single), `ox` (pluck), `xx` (execute).

Interpolated values are always passed as parameterized values (never string-concatenated), with placeholder format handled per adapter (`?` for SQLite/DuckDB, `$1`/`$2` for PostgreSQL).

### Raw Queries

```typescript
// Raw queries use each adapter's native placeholder syntax.
await pgDb.query('SELECT * FROM posts WHERE id = $1', postId);
await pgDb.query('SELECT * FROM posts WHERE id = $1', [postId]);
await pgDb.query('SELECT * FROM posts WHERE id = ANY($1)', postIds);

// Legacy ? placeholders are converted only when unambiguous.
await pgDb.query('SELECT * FROM posts WHERE id = ?', postId);

// Native operators remain safe; prefer $1 placeholders when mixing operators and values.
await pgDb.query(`SELECT ('{"db":true}'::jsonb ? 'db') AS has_db`);
```

For PostgreSQL, a single array argument is treated as a values list unless the SQL shows a single array-typed placeholder, such as `$1::text[]`, `CAST($1 AS text[])`, `ANY($1)`, or the equivalent legacy `?` placeholder form. Transaction handles follow the same raw query behavior as the root database handle.

### CRUD Helpers

```typescript
await db.insert('posts', { id: 'p1', title: 'Hello', author: 'Alice' });
await db.insert('posts', [{ id: 'p2', title: 'A' }, { id: 'p3', title: 'B' }]);

const post = await db.get('posts', { id: 'p1' });
const recent = await db.list('posts', { author: 'Alice', 'created_at >': '2024-01-01' });
await db.update('posts', { id: 'p1' }, { title: 'Updated' });
await db.upsert('posts', ['id'], { id: 'p1', title: 'Upserted' });
await db.delete('posts', { id: 'p1' });
const total = await db.count('posts');
const filtered = await db.count('posts', { published: true });

const user = await db.getOrInsert('users', { email: 'a@b.com' }, { id: 'u1', email: 'a@b.com', name: 'A' });

// Table-scoped helper
const postsTable = db.table('posts');
await postsTable.insert({ id: 'p4', title: 'Scoped' });
const p = await postsTable.get({ id: 'p4' });
```

`upsert()` treats `NULL` values in conflict columns as matching existing `NULL`
values so nullable composite keys update the existing row instead of inserting a
duplicate. Pass `{ nullsDistinct: true }` as the fourth argument to preserve the
database-native behavior where `NULL` conflict values are distinct.

### Transactions

```typescript
// Callback-based (auto commit/rollback)
await db.transaction(async (tx) => {
  await tx.insert('users', { id: 'u1', name: 'Alice' });
  await tx.insert('profiles', { user_id: 'u1', bio: 'Dev' });
});

// Manual control via beginTransaction()
const tx = await db.beginTransaction();
try {
  await tx.insert('orders', { id: 'o1', total: 100 });
  await tx.commit();
} catch (e) {
  await tx.rollback();
  throw e;
}
```

On the single-connection adapters — SQLite (both the LibSQL and native paths),
DuckDB and JSON — a connection can only be in one transaction at a time, so
**transactions are serialized per connection**: an overlapping `transaction()`
waits for the one in progress instead of interleaving with it. A call that waits
longer than `transactionQueueTimeout` (30s by default) rejects rather than
stalling indefinitely.

```typescript
const db = await getDatabase({
  type: 'sqlite',
  url: 'file:app.db',
  transactionQueueTimeout: 60_000, // longer transactions, or heavier bursts
});
```

Two consequences worth knowing:

- A `beginTransaction()` handle owns the connection until you commit or roll it
  back. End it in a `finally` — a handle that is never ended holds the
  connection for the life of the process, and every later transaction on it
  fails with the queue timeout.
- Inside a `transaction()` callback, use the `tx` you were handed. Calling a
  top-level `db.*` method that opens its own transaction makes it wait on the
  connection its own caller is holding.

PostgreSQL pools its connections, so transactions there run concurrently and
never queue.

### Identifiers

Table and column names are interpolated into SQL rather than bound as
parameters, so every CRUD method validates them: an identifier must match
`[a-zA-Z_][a-zA-Z0-9_]*`. Qualified names (`schema.table`), quoted names and
anything containing whitespace are rejected. Values are always parameterized and
are unaffected.

Note that `buildWhere` treats a condition key carrying an explicit operator
suffix (`'price >'`, `'name like'`) as SQL expression text and does **not**
validate it. That is deliberate, and it means those keys must stay
developer-controlled — never build them from request input.

### WHERE Clause Building

```typescript
import { buildWhere } from '@happyvertical/sql';

const { sql, values } = buildWhere({
  status: 'active',
  'price >': 100,
  'category in': ['electronics', 'books'],
  'status not in': ['archived'],
  'name like': '%shirt%',
  deleted_at: null,         // IS NULL
  'updated_at !=': null,    // IS NOT NULL
});
// Use with raw query: db.query(`SELECT * FROM products ${sql}`, values)
```

Supports 2D array format for OR/AND compound logic:
```typescript
buildWhere([
  [{ status: 'active' }, { 'price >': 100 }],
  [{ status: 'pending' }, { priority: 'high' }],
]);
// WHERE (status = $1 AND price > $2) OR (status = $3 AND priority = $4)
```

Condition keys with explicit operator suffixes are emitted as SQL
field/expression text. Keep those keys developer-controlled; do not pass
end-user input as condition keys.

### Aggregate Query Building

```typescript
import { buildAggregate } from '@happyvertical/sql';

const aggregate = buildAggregate(
  {
    from: 'orders',
    select: [
      { bucket: 'month', column: 'created_at', as: 'month' },
      { column: 'customer_id' },
      { fn: 'sum', column: 'total', as: 'revenue' },
      { fn: 'count', as: 'order_count' },
    ],
    where: { status: 'paid' },
    having: { 'revenue >': 0 },
    orderBy: ['month ASC', 'revenue DESC'],
    limit: 100,
  },
  1,
  'postgres',
);

const rows = await db.query(aggregate.sql, aggregate.values);
```

`buildAggregate()` emits parameterized SQL and values, reuses `buildWhere()`
semantics for `where` and `having`, and maps time buckets per adapter:
PostgreSQL, DuckDB, and JSON use `date_trunc(...)`; SQLite uses portable
`strftime(...)`/`date(...)` expressions.

### Schema Synchronization

```typescript
import { syncSchema } from '@happyvertical/sql';

await syncSchema({
  db,
  schema: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE
    );
  `,
});

const exists = await db.tableExists('users');
```

### Vector Search (PostgreSQL)

PostgreSQL adapters expose `db.vector` when pgvector is available:

```typescript
await db.vector.ensureColumn('documents', 'embedding', 1536);
await db.vector.ensureIndex('documents', 'embedding', { metric: 'cosine' });
await db.vector.upsertVector('documents', { id: 'doc-1' }, 'embedding', vector);
const results = await db.vector.search('documents', 'embedding', queryVector, { limit: 10 });
```

### Optional SQLite Capabilities

SQLite keeps the existing LibSQL adapter path by default. For local development
and tests, opt into native SQLite capabilities with `capabilities`. This switches
the adapter to Node's built-in `node:sqlite` for local files or `:memory:` and
rejects remote `libsql://`, `http://`, and `https://` URLs.

```bash
pnpm add -D @sqliteai/sqlite-vector @russellthehippo/honker-node
```

```typescript
type SqliteCapabilitiesOptions = {
  notifications?: boolean | {
    watcherBackend?: 'polling' | 'kernel' | 'shm';
    maxReaders?: number;
  };
  vector?: boolean | {
    preload?: boolean;
    quantization?: 'turbo4' | 'turbo3' | 'turbo2' | 'uint8' | 'int8' | '1bit';
    maxMemory?: string;
  };
};
```

```typescript
const db = await getDatabase({
  type: 'sqlite',
  url: 'file:./dev.db',
  capabilities: {
    vector: { quantization: 'turbo4', preload: true },
    notifications: { watcherBackend: 'polling' },
  },
});

await db.vector?.ensureColumn('documents', 'embedding', 1536);
await db.vector?.upsertVector('documents', { id: 'doc-1' }, 'embedding', vector);
const matches = await db.vector?.search('documents', 'embedding', queryVector, {
  limit: 10,
  metric: 'cosine',
  where: 'status = $2',
  params: ['published'],
});

const listener = db.notifications!.listen('jobs');
await db.notifications!.notify('jobs', { id: 'job-1' });
for await (const message of listener) {
  console.log(message.channel, message.payload);
  break;
}
await db.notifications!.waitForUpdate({ timeoutMs: 5000 });
await db.close?.();
```

`@sqliteai/sqlite-vector` is loaded lazily through `getExtensionPath()` and only
mutates schema when `ensureColumn()` or `ensureIndex()` is called. SQLite vector
search uses the same `db.vector` API as PostgreSQL. `ensureIndex()` creates a
quantized sqlite-vector index with `turbo4` by default, and filtered searches can
keep PostgreSQL-style `$2`, `$3`, etc. placeholders in `VectorSearchOptions.where`.

`@russellthehippo/honker-node` is loaded lazily as a sidecar connection to the
same file. Honker bootstraps its `_honker_*` tables on open and requires a
file-backed database, so `:memory:` is rejected when notifications are enabled.
When notifications are enabled, `db.notifications` exposes `notify()`,
`listen()`, `waitForUpdate()`, and `prune()`; call `db.close?.()` when a test or
worker is done so watcher handles and sidecar connections are released.

Both packages are optional peers. `sqlite-vector` uses a custom license declared
as `SEE LICENSE IN LICENSE.md`; keep it opt-in and review the upstream
[license](https://github.com/sqliteai/sqlite-vector/blob/main/LICENSE.md) before
shipping it beyond development or test environments.

## Adapters

| Adapter | `type` | Backend | Notes |
|---------|--------|---------|-------|
| SQLite | `'sqlite'` | LibSQL (`@libsql/client`) by default; native `node:sqlite` when capabilities are enabled | Supports `:memory:`, file, and remote Turso URLs by default. Native capabilities are local-only |
| PostgreSQL | `'postgres'` | `pg` Pool | Connection pooling, pgvector support |
| DuckDB | `'duckdb'` | `@duckdb/node-api` | JSON file auto-registration, write-back strategies |
| JSON | `'json'` | DuckDB in-memory | Queries JSON files as tables, connection caching |

## API Overview

**Factory**: `getDatabase(options)` — creates or returns a cached database connection.

**Interface** (`DatabaseInterface`): `many`, `single`, `pluck`, `execute`, `query`, `insert`, `get`, `list`, `update`, `upsert`, `getOrInsert`, `delete`, `count`, `table`, `tableExists`, `syncSchema`, `transaction`, `beginTransaction`, `vector`, `notifications`, `close`.

**Utilities**: `buildWhere`, `syncSchema`, `tableExists`, `escapeSqlValue`, `validateColumnName`, `formatDbError`, `convertUniqueIndexesToInlineConstraints`.

**Schema**: `DatabaseSchemaManager` for JSON manifest-based schema initialization with dependency resolution.

## License

ISC
