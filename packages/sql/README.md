# @happyvertical/sql

Database interface with support for SQLite (via LibSQL/Turso), PostgreSQL, DuckDB, and a JSON adapter (DuckDB-backed). Provides a unified API across all backends with template literal queries, CRUD helpers, transactions, schema synchronization, and vector search (PostgreSQL via pgvector).

## Installation

```bash
# Requires GitHub Packages registry
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

// PostgreSQL SQL is passed through unchanged, so native operators are safe.
await pgDb.query(`SELECT ('{"db":true}'::jsonb ? 'db') AS has_db`);
```

For PostgreSQL, a single array argument is treated as a values list unless the SQL shows a single array-typed placeholder, such as `$1::text[]`, `CAST($1 AS text[])`, or `ANY($1)`. Transaction handles follow the same raw query behavior as the root database handle.

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

### WHERE Clause Building

```typescript
import { buildWhere } from '@happyvertical/sql';

const { sql, values } = buildWhere({
  status: 'active',
  'price >': 100,
  'category in': ['electronics', 'books'],
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

## Adapters

| Adapter | `type` | Backend | Notes |
|---------|--------|---------|-------|
| SQLite | `'sqlite'` | LibSQL (`@libsql/client`) | Supports `:memory:`, file, and remote Turso URLs |
| PostgreSQL | `'postgres'` | `pg` Pool | Connection pooling, pgvector support |
| DuckDB | `'duckdb'` | `@duckdb/node-api` | JSON file auto-registration, write-back strategies |
| JSON | `'json'` | DuckDB in-memory | Queries JSON files as tables, connection caching |

## API Overview

**Factory**: `getDatabase(options)` — creates or returns a cached database connection.

**Interface** (`DatabaseInterface`): `many`, `single`, `pluck`, `execute`, `query`, `insert`, `get`, `list`, `update`, `upsert`, `getOrInsert`, `delete`, `count`, `table`, `tableExists`, `syncSchema`, `transaction`, `beginTransaction`, `vector`.

**Utilities**: `buildWhere`, `syncSchema`, `tableExists`, `escapeSqlValue`, `validateColumnName`, `formatDbError`, `convertUniqueIndexesToInlineConstraints`.

**Schema**: `DatabaseSchemaManager` for JSON manifest-based schema initialization with dependency resolution.

## License

ISC
