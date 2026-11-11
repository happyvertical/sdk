# @happyvertical/sql

Database interface with support for SQLite (via LibSQL/Turso), PostgreSQL, PGlite (Postgres in WebAssembly, for browsers and serverless Node), DuckDB, and a JSON adapter (DuckDB-backed). Provides a unified API across all backends with template literal queries, CRUD helpers, transactions, schema synchronization, and vector search (PostgreSQL via pgvector).

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

// Local file under an application-custodied data directory (macOS and Linux)
const secureFileDb = await getDatabase({
  type: 'sqlite',
  url: './data/app.db',
  secureFile: {
    driver: 'node:sqlite',
    custody: 'trusted-parent',
    root: './data',
  },
});

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
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
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

PostgreSQL also accepts `max` (20 by default), `connectionTimeoutMillis`, and
`idleTimeoutMillis`. Lifecycle timeouts must be integer milliseconds from `0`
through Node.js's maximum timer delay of `2,147,483,647`; `0` disables the
corresponding timeout. Omitted timeout values retain `pg`'s defaults.

### PGlite: Postgres in the browser and in serverless Node

`type: 'pglite'` runs real PostgreSQL compiled to WebAssembly
([`@electric-sql/pglite`](https://github.com/electric-sql/pglite)). It speaks the
same Postgres dialect as the `pg` adapter — native UUID ids and foreign keys,
BIGINT, migrations, `ON CONFLICT` upserts — so code and migrations written for
Postgres run unchanged. It needs no server, which also makes it a convenient
Postgres for Node tests.

`@electric-sql/pglite` is an **optional peer dependency**. Install it only where
you use the adapter; it is imported lazily when a pglite database is created,
and a missing install throws a `PGlitePeerMissingError` with the install command.

```bash
pnpm add @happyvertical/sql @electric-sql/pglite
```

**In a browser, import the adapter from its own entry point.** The package root
also reaches Node-only adapters (`pg`, libsql, DuckDB), so a bundler targeting a
page should use `@happyvertical/sql/pglite`, whose import graph contains no
`node:` built-ins and no `pg`:

```typescript
import { getDatabase } from '@happyvertical/sql/pglite';

const db = await getDatabase({ dataDir: 'idb://planner' });

await db.query('CREATE TABLE IF NOT EXISTS tasks (id uuid PRIMARY KEY, title text)');
await db.insert('tasks', { id: crypto.randomUUID(), title: 'Ship it' });

await db.transaction(async (tx) => {
  await tx.insert('tasks', { id: crypto.randomUUID(), title: 'Write docs' });
});
```

In Node (or anywhere the root entry is fine), `getDatabase({ type: 'pglite' })`
from `@happyvertical/sql` reaches the same adapter.

### Browser-safe query helpers: `@happyvertical/sql/query`

Code that only builds SQL, or works on a database it was handed, should import
`@happyvertical/sql/query` rather than the root. Its import graph has no `node:`
built-ins and no driver packages (`pg`, libsql, DuckDB), so it bundles for a
page. The root keeps re-exporting everything.

```typescript
import {
  bucketExpr,
  buildAggregate,
  buildWhere,
  raw,
  syncSchema,
  tableExists,
  validateColumnName,
} from '@happyvertical/sql/query';
```

It exports `validateColumnName`, `escapeSqlValue`, `buildWhere`, `raw`,
`formatDbError`, `buildAggregate`, `bucketExpr`, `tableExists`, `syncSchema`,
`DatabaseSchemaManager`, `convertUniqueIndexesToInlineConstraints`, and all the
shared types and error classes (`NestedTransactionError`, `DatabaseInterface`, ...).
`getDatabase`, the doctor framework, and the Postgres CLI helpers stay root-only
because they reach drivers or Node built-ins.

#### Persistence: `dataDir`

| `dataDir` | Storage | Where |
|-----------|---------|-------|
| omitted, `'memory://'` | In memory; gone when the database closes | Everywhere |
| `'idb://<name>'` | IndexedDB | Browser |
| `'opfs-ahp://<name>'` | Origin Private File System | Browser (in a worker) |
| a filesystem path, e.g. `'./data/app'` | Directory on disk | Node, Bun, Deno |

`url` is accepted as an alias, so `HAVE_SQL_URL=idb://planner` selects the
location. A persistent `dataDir` is its own cache identity — two PGlite
instances on the same storage would corrupt it — so repeated
`getDatabase()` calls for it return one instance. An in-memory database is
private to the call that created it; pass the same `dbid` to share one.

#### Extensions and further options

`extensions` is forwarded to PGlite, so pass the extension objects its packages
export. The `vector` capability then works as it does on PostgreSQL:

```typescript
import { vector } from '@electric-sql/pglite-pgvector';

const db = await getDatabase({
  type: 'pglite',
  dataDir: 'idb://notes',
  extensions: { vector },
});

await db.vector.ensureColumn('notes', 'embedding', 384);
```

`pglite: { ... }` forwards anything else to PGlite's constructor
(`relaxedDurability`, `initialMemory`, `loadDataDir`, `parsers`, ...).
`client` builds the adapter on an instance you created, such as a
`PGliteWorker` that keeps the database off the main thread; the adapter never
closes it.

#### Differences from the `pg` adapter

- **One connection.** PGlite runs a single backend, so transactions take turns,
  exactly as on the SQLite adapters (see [Transactions](#transactions)). A
  statement issued outside a transaction while one is open waits for it, and
  both reject at `transactionQueueTimeout` (30s by default) with an explanation
  rather than hanging. Inside a `transaction()` callback, use the `tx` you were
  handed; a top-level `db.*` call there waits on the connection its own caller
  holds.
- **Nested transactions use the handle you are given.** Browsers have no
  `AsyncLocalStorage`, so each nested callback receives a handle bound to its own
  savepoint. Call `tx.transaction()` on that handle, not on the outer one.
- **No `acquireSession()`.** There is no second connection to pin.
- **`schemas` is ignored**, as on `pg`: tables are managed by migrations.
- `db.client` is the underlying `PGlite` instance. Using it directly bypasses the
  transaction lock.

### Connection caching and cleanup

PostgreSQL, JSON, and explicitly identified SQLite connections are shared by
default. Pass `cache: false` when a caller needs a distinct adapter that is
never read from or inserted into the shared cache:

```typescript
const isolated = await getDatabase({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  cache: false,
});

try {
  await isolated.query('SELECT 1');
} finally {
  await isolated.close?.();
}
```

`clearCache: true` preserves the existing evict-then-cache behavior: it waits
for the matching cached or initializing adapter to close, then returns a fresh
cached adapter. Combine it with `cache: false` to evict first and return an
uncached replacement. A concurrent initializer caught by eviction is closed
and cannot repopulate the cache.

With automatic file registration enabled (the default), cached JSON adapters
also detect external changes to JSON data and companion `.schema.sql` files when
a later `getDatabase()` call acquires the same cache identity. A changed, added,
or removed source file causes the old DuckDB adapter to close before one fresh
shared adapter is created. Existing references point to the closed adapter
after replacement; acquire the database again before continuing work after an
external file change. Writes made through the adapter refresh its snapshot and
do not invalidate the adapter itself when the tracked sources are otherwise
unchanged. If an external change is already visible before an adapter export,
the export fails closed so the caller can reacquire the database and retry.
Freshness checks are not a cross-process file lock: an external process writing
the same table's JSON or companion schema file at the same instant as an adapter
export remains last-writer-wins and must be coordinated by the application.

The JSON adapter's exported `clearConnectionCache()` helper is asynchronous:
always `await clearConnectionCache()` before opening a replacement connection.

An explicit `dbid` is an opaque, stable caller-owned cache identity and must be
non-empty. Without
one, PostgreSQL derives a credential- and pool-option-sensitive identity using
a process-keyed digest. The pool identity includes `max`,
`connectionTimeoutMillis`, and `idleTimeoutMillis`; connection URLs, usernames,
passwords, and option names are not stored in readable cache keys. SQLite
caches only connections with a `dbid` (automatically assigned to the default
`:memory:` path). JSON derives an identity from its directory and behavior
options.

DuckDB already creates a fresh adapter for every call, so `cache` and
`clearCache` are accepted for uniform configuration but do not change its
behavior. Call `close()` on uncached and DuckDB adapters when finished.

Configuration is also loaded from `HAVE_SQL_*` environment variables (e.g. `HAVE_SQL_TYPE`, `HAVE_SQL_URL`). User-provided options take precedence.

### Secure local SQLite acquisition

Secure mode requires an explicit custody contract:

```typescript
secureFile: {
  driver: 'node:sqlite',
  custody: 'trusted-parent',
  root: './data', // optional; defaults to the database's direct parent
}
```

Boolean `true` fails closed. Before loading the driver, the adapter verifies
that the database is beneath the custody root, that static path components are
real directories rather than symlinks, and that the root plus database-parent
chain is owned by the current uid with no group/world write permission. An
existing leaf must likewise be a current-user-owned regular file with no
group/world write permission. A missing leaf is created exclusively with mode
`0600` before driver acquisition, independent of a permissive process umask, and
is removed if the driver cannot acquire it and its device/inode identity is
still unchanged. If identity inspection itself fails, acquisition fails closed
and leaves the restrictive empty leaf in place rather than risking deletion of
a replacement. On macOS, every inspected component and existing leaf must also
have no ACL entry that grants authority; restrictive deny-only entries
(including the standard home-directory `group:everyone deny delete` entry) are
accepted. ACL inspection errors or unrecognized/ambiguous ACL entries fail
closed.
The adapter invokes `/bin/ls -lde -- <path>` directly with an argument vector,
never through a shell, and parses every numbered ACL entry even when macOS's
extended-attribute `@` marker takes display precedence over the ACL `+` marker.
Ancestors above the custody root may not allow replacement by another principal
and must be owned either by the current uid or privileged uid `0` (the explicit
system-root exception). A sticky root-owned shared parent such as `/tmp` is
accepted. The application must create and retain custody of this directory;
mode `0700` with no permissive ACL is the conventional choice.

After custody validation, the adapter opens the path with Node's built-in
`node:sqlite` driver. Static ancestor and leaf symlinks are rejected. Under the
contract, other principals cannot replace entries beneath the current-user-owned
custody root, so there is no cross-principal pathname race between validation
and open. This is not an atomic path boundary against a hostile process
running as the same account: that process can already read, rewrite, unlink, or
replace an unencrypted user-owned database and its directory. Separating
same-account processes requires OS sandboxing plus a descriptor-relative/custom
SQLite VFS. Keep the custody contract in force for the full connection lifetime.

The secure path is supported on macOS and Linux with Node.js 24.18.0 or newer,
and on Windows when the caller supplies `windowsCustody`:

```typescript
secureFile: {
  driver: 'node:sqlite',
  custody: 'trusted-parent',
  windowsCustody: {
    // Throw or reject to refuse. Receives the drive-root-to-parent chain and,
    // when it exists, the database leaf last.
    verify: async (paths) => assertPrivateToCurrentUser(paths),
  },
}
```

Node cannot read NTFS ACLs, so on Windows the caller owns the trust policy
(which accounts may hold access) and the adapter owns no ACL code. The adapter
still performs its own structural walk: lexical containment under the custody
root, no symlinks or junctions (`lstat`), canonical native `realpath` equal to
each path (catches mount points and `subst` drives), a regular-file leaf with
`nlink === 1`, and a stable bigint `dev`/`ino`/`birthtimeNs` leaf identity
across checks. `verify` runs before the leaf is created and again afterwards
with the leaf appended (an existing leaf is verified on both passes); a created
leaf is removed if the second pass fails. Without `windowsCustody`, Windows
fails closed. The option is ignored on macOS and Linux.
The runtime version is checked before `node:sqlite` is imported or the database
is opened. Secure mode fails closed on older or malformed runtime versions,
other platforms, and when combined with remote LibSQL URLs, `:memory:`, LibSQL
authentication or encryption, or optional native capabilities. Omit
`secureFile` to retain the existing LibSQL behavior on older consumers.

Every secure prepared statement enables exact BigInt reads. Safe SQLite integer
columns retain legacy JavaScript `number` results; integers outside the safe
range are returned as `bigint`, and `bigint` parameters bind exactly. Boolean
parameters are normalized to SQLite integers (`1`/`0`) at the driver boundary;
objects and arrays continue through the adapter's JSON serialization unchanged.
The public row-count contract remains `number`, so an exact `changes` metric
above `Number.MAX_SAFE_INTEGER` fails explicitly instead of rounding.

Secure connections also guard the public `client.execute()` seam with the same
invocation and transaction-scope lifetime rules as the database helpers. A
client call accepted before `close()` drains first; calls made after close or
after a transaction scope ends reject without reaching SQLite. Use
`database.transaction()` or `database.beginTransaction()` for transaction
control—direct `client.transaction()` and transaction-scoped `client.close()`
fail closed. Raw `BEGIN`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, and
`RELEASE` statements are likewise rejected through root and transaction-scoped
database/client routes so they cannot create an untracked transaction, bypass
callback/manual rollback, or invalidate an owned savepoint. A parent transaction
handle also rejects when invoked from inside a nested callback; use the nested
callback's handle or wait for the child to settle before reusing its parent.
If SQLite itself ends a transaction through a statement policy
such as `ON CONFLICT ROLLBACK`, already-accepted later work rejects before
execution and commit reports the automatic rollback. If an explicit rollback
fails, the secure client is invalidated and rejects later work rather than
returning a connection with uncertain transaction state to service.

Every static component must be a real path component. For example, macOS exposes
`/var` as a symlink, so use the resolved `/private/var/...` path when secure
acquisition is intentional. Secure mode requires the package's supported Node
runtime with built-in `node:sqlite`; it installs no additional native peer.
Default LibSQL use remains unchanged.

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

When a raw query or schema alteration fails, the adapter throws a
`DatabaseError` whose message includes the database driver's diagnostic. The
error also carries a native `cause`, and `JSON.stringify(error)` includes a
shallow cause summary with common driver fields such as `code`, `detail`,
`hint`, `severity`, and `errno`.

The cause is a sanitized snapshot rather than the original driver object.
Statements, bound parameter values, connection credentials, and
credential-shaped driver text are redacted from the message, context, cause,
stack, and JSON form. This makes the error safe for ordinary application and CI
logging while keeping migration failures actionable. Use the driver's error
code and the non-secret diagnostic details for troubleshooting; do not expect
`error.cause` to have object identity with the driver's thrown error.

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

A batch `insert()` writes one column list for every row, taken from the first
record, so every record in the batch must have the same keys. Key *order* does
not matter — each record is projected through the column list — but a record
with an extra or missing key is rejected with a `DatabaseError` rather than
silently dropping the extra or writing `NULL` for the missing one. Split records
of differing shapes into separate `insert()` calls, or fill the gaps with an
explicit `null`.

`upsert()` treats `NULL` values in conflict columns as matching existing `NULL`
values so nullable composite keys update the existing row instead of inserting a
duplicate. Pass `{ nullsDistinct: true }` as the fourth argument to preserve the
database-native behavior where `NULL` conflict values are distinct.

On DuckDB, conflict columns identify the existing row and are not reassigned by
the update arm. A key-only upsert therefore preserves the existing row.

For PostgreSQL 15+, a matching `UNIQUE (...) NULLS NOT DISTINCT` index lets
nullable upserts use one native `ON CONFLICT` statement. An ordinary `UNIQUE`
constraint still treats `NULL` values as distinct, so the adapter retains its
race-safe NULL-aware fallback for that schema.

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
DuckDB, JSON and PGlite — a connection can only be in one transaction at a time, so
**transactions are serialized per connection**: an overlapping `transaction()`
waits for the one in progress instead of interleaving with it. A call that waits
longer than `transactionQueueTimeout` (30s by default) rejects rather than
stalling indefinitely.

DuckDB and JSON handles also queue every individual statement on their shared
connection, because `@duckdb/node-api` cannot run two at once: overlapping
`db.*` calls used to abort each other with a bare
`Failed to execute prepared statement`. That queue is per statement, so a
transaction callback's own statements never wait on their transaction.

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
- Inside a `transaction()` callback, use the `tx` you were handed. With secure
  SQLite and remote LibSQL, calling a top-level `db.*` or `db.client.execute()`
  method is rejected
  immediately so detached work cannot escape into autocommit after the callback
  ends. While a manual transaction handle is open, top-level calls wait on its
  connection and reject at `transactionQueueTimeout` rather than hang forever.

Nested SQLite and PostgreSQL scopes use savepoints. If sibling nested scopes are
started concurrently on one transaction, they serialize so the stack-ordered
savepoint lifecycle remains intact. On secure SQLite and remote LibSQL,
operations invoked through a parent handle from outside an open child
savepoint queue behind that child; a
child rollback therefore cannot silently remove a successful parent operation.
The enclosing commit or rollback drains all
accepted child scopes before ending the transaction. PostgreSQL pools separate
connections, so top-level transactions there run concurrently and never queue;
PGlite has one connection and queues them like SQLite does.
Remote LibSQL uses a dedicated write transaction for each callback or manual
handle. It acquires the write transaction before invoking the callback or
returning the handle, and never replays a callback. Use `tx.client.execute()`
for raw driver statements within that transaction; native operations on the root
`db.client` use separate streams. If a statement ends the transaction (for
example, `INSERT OR ROLLBACK` hits a conflict), the handle rejects later
statements and commit rather than letting work continue in autocommit.
An ordinary handled constraint failure can still leave the transaction active.

In remote SQLite queries with positional
arguments, `$1`, `$2`, and so on refer to the same argument slots as SQLite's
`?1`, `?2`, including repeated or reordered references. Named parameters with
an argument object are available through `client.execute()`.

The remote transaction integration test is opt-in. Point one or both variables
at a disposable writable sqld database. For a server that requires
authentication, also set `SDK_TEST_SQLITE_AUTH_TOKEN`.

```bash
SDK_TEST_SQLITE_HTTP_URL='http://127.0.0.1:8080' \
SDK_TEST_SQLITE_LIBSQL_URL='libsql://127.0.0.1:8080?tls=0' \
pnpm --filter @happyvertical/sql exec vitest --config ../../vitest.package.config.ts run src/sqlite-remote-transaction.spec.ts
```

PostgreSQL CRUD helpers apply the same value serialization both inside and
outside a transaction: objects and arrays are encoded for JSON/JSONB columns,
dates use ISO timestamps, binary buffers and views retain their native `bytea`
representation, `null` remains SQL `NULL`, and scalar values pass through
unchanged. If a PostgreSQL statement aborts a transaction, later
operations and commit preserve the first statement error rather than replacing
it with the generic `25P02 current transaction is aborted` state error.
Every SQLite transaction-scoped operation is registered when its public method
is called. Ending a callback or invoking a manual handle's commit/rollback
seals the scope synchronously, drains operations already accepted, and rejects
later operations so work cannot escape into autocommit after the transaction.
If a SQLite statement failure is intentionally recoverable, attach an explicit
`.catch(...)` or `.then(..., onRejected)` to the transaction-scoped operation.
Passing it through `Promise.resolve`, `Promise.all`, or an async helper only
counts as recovery when the derived rejection is itself awaited or caught. A
detached rejected adoption fails closed and rolls back. `Promise.allSettled`
intentionally consumes each rejection, so using it permits the transaction to
commit after the caller inspects those results.

While transaction-scoped Promise observations are active, SQLite temporarily
enables a process-wide Node Promise lifecycle hook and an
`unhandledRejection` observer. Both are removed when the accepted work drains;
another reason to always end a manual `beginTransaction()` handle in `finally`
is that an abandoned handle can retain this bookkeeping as well as its database
connection.

### Identifiers

Every adapter quotes CRUD column identifiers, including insert/upsert column
lists, conflict targets, SET clauses and WHERE fields. Keyword columns such as
`order`, `group`, `from`, `select`, `values` and `user` work without special input.
Table names retain the restricted `[a-zA-Z_][a-zA-Z0-9_]*` contract. Bare CRUD
column names follow the same pattern; values are always bound parameters.

PostgreSQL and PGlite preserve PostgreSQL's established unquoted folding:
`camelCase` addresses the physical column `camelcase`. For an exact mixed-case
or spaced physical column, use an explicitly double-delimited identifier:

```typescript
await db.insert('items', { order: 1, '"MixedCase"': 'exact', '"Full Name"': 'Ada' });
await db.update('items', { '"Full Name" like': 'A%' }, { order: 2 });
```

Double an embedded double quote inside a delimited identifier. Malformed
identifiers, empty names, NUL bytes and non-string identifiers are rejected.
Record keys represent one column. WHERE and aggregate identifiers can instead
be qualified: `alias.order` quotes each component, while `"foo.bar"` addresses
one column whose name contains a literal dot. Delimited names are identifiers,
never raw expressions; use `raw()` only for developer-authored WHERE SQL.

DuckDB and JSON `upsert()` retain their existing literal physical-name record
and conflict keys, so `Full Name`, `user-id`, `2024_total`, `foo.bar` and embedded
quotes work directly there. A key containing outer quote characters is also
literal in these existing upsert paths; it is never silently renamed. For strict
`insert`/`update` and WHERE inputs, explicitly delimit such names as above.
JSON catalog loading and writeback preserve the original physical keys.

Standalone `buildWhere`, `buildAggregate` and `bucketExpr` preserve ordinary
identifier SQL output by default and automatically quote keywords and explicit
delimited identifiers. New builder calls should pass `{ quoteIdentifiers: true }`
as the fourth argument to quote every identifier component. Adapter CRUD methods
select this policy automatically. Raw expression keys retain their SQL exactly.
There is no adapter `orderBy`, aggregate or record `exists` method: execute
`buildAggregate()` output for ordered/aggregate queries, and use `tableExists()`
for table existence. Standalone `renderExpression` retains its exact physical
identifier spelling contract.

Known-dialect ALTER helpers quote column and index identifiers. The schema
manifest manager has no dialect tag and preserves bare ordinary spelling
(including PostgreSQL folding), quoting keywords and explicitly delimited names.
Schema DDL, types, defaults/checks, partial-index WHERE expressions, foreign-key
actions and trigger syntax/bodies remain developer-authored SQL contracts.

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

`contains` performs a literal, case-sensitive substring match on text. `%`,
`_`, and `\` are ordinary characters in its value, so
`{ 'description contains': '100%_off\\today' }` searches for that exact text;
it does not provide JSON containment. The value must be a string; an empty
string matches every non-NULL text value. Adapter methods such as `list()`
select the dialect automatically. When calling `buildWhere()` directly with
`contains`, pass the adapter type as its third argument so it can emit the
correct case-sensitive expression:

```typescript
buildWhere({ 'description contains': '100% cotton' }, 1, 'sqlite');
```

`like` remains pattern-based: `%` matches any sequence and `_` matches one
character. Every adapter now uses an explicit backslash escape character, so
`\%`, `\_`, and `\\` in the pattern match a literal percent sign, underscore,
and backslash respectively. Escape the JavaScript string as well; for example,
`{ 'name like': '%100\\%%' }` matches text containing the literal `100%`.

Supports 2D array format for OR/AND compound logic:
```typescript
buildWhere([
  [{ status: 'active' }, { 'price >': 100 }],
  [{ status: 'pending' }, { priority: 'high' }],
]);
// WHERE (status = $1 AND price > $2) OR (status = $3 AND priority = $4)
```

Every condition key is validated as a plain SQL identifier, with or without an
operator suffix, so mapping untrusted input into a key throws instead of
emitting attacker-controlled SQL. To use expression text as a key, wrap it in
`raw()`:

```typescript
import { buildWhere, raw } from '@happyvertical/sql';

buildWhere({
  status: 'active',              // validated as an identifier
  [raw('LOWER(name) like')]: '%shirt%',  // caller-authored SQL
});
```

`raw()` asserts that the caller, not the request, authored that SQL — never
build its argument from end-user input. It marks a key rather than sanitizing
it: it stops an expression key being used by accident, but a caller that maps an
entire attacker-controlled string into a key can still reach raw SQL, so keep
validating at your own trust boundary. Enforcement is at runtime — `WhereClause`
keys are plain `string`, so TypeScript will not flag an unmarked expression key.

The same validation applies to every adapter method that takes a `where`
(`get`, `list`, `update`, `delete`, `count`, `getOrInsert`), not just to
`buildWhere` itself.

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
  { quoteIdentifiers: true },
);

const rows = await db.query(aggregate.sql, aggregate.values);
```

`buildAggregate()` emits parameterized SQL and values, reuses `buildWhere()`
semantics for `where` and `having`, and maps time buckets per adapter:
PostgreSQL, DuckDB, and JSON use `date_trunc(...)`; SQLite uses portable
`strftime(...)`/`date(...)` expressions.

#### Joins, row expressions and filtered aggregates

A spec can join tables, aggregate a computed value, and count or sum only the
rows a predicate holds for. All three are structured data (never SQL text):
identifiers are validated, strings and dates are bound, and an aggregate that
takes an `expr` or `filter` must be `count`, `sum`, `avg`, `min` or `max`.
Other parts of an `AggregateSpec` predate this and are not hardened for
untrusted input: `fn` is free-form for a plain column, and `raw()` keys in
`where`/`having` use a string prefix that JSON can forge. Validate specs built
from untrusted input before passing them in.

```typescript
const aggregate = buildAggregate(
  {
    from: 'time_entries',
    fromAlias: 'te',
    joins: [
      {
        table: 'work_orders',
        alias: 'wo',
        type: 'left', // 'inner' (default) or 'left'
        on: {
          op: 'and',
          operands: [
            { op: 'eq', left: { col: 'te.work_order_id' }, right: { col: 'wo.id' } },
            // Put the tenant equality in ON so ids that collide across tenants never match.
            { op: 'eq', left: { col: 'te.tenant_id' }, right: { col: 'wo.tenant_id' } },
          ],
        },
      },
    ],
    select: [
      { column: 'wo.title', as: 'title' },
      { column: 'wo.estimated_hours', as: 'estimated_hours' },
      { fn: 'sum', column: 'te.hours', as: 'booked' },
      // Filtered count: rows where the predicate is true (false and NULL are skipped).
      {
        fn: 'count',
        filter: { op: 'gt', left: { col: 'te.hours' }, right: { value: 8 } },
        as: 'long_days',
      },
      // A row expression, aggregated.
      {
        fn: 'avg',
        expr: { op: 'secondsBetween', later: { col: 'te.ended_at' }, earlier: { col: 'te.started_at' } },
        as: 'avg_seconds',
      },
    ],
    where: { 'te.tenant_id': tenantId },
  },
  1,
  'postgres',
);
```

- **Joins.** `from` takes an optional `fromAlias`; each join has a `table`, a
  unique `alias` (letters, digits, underscore) and a required `on` expression.
  With joins, a table-qualified column must be `alias.column` where the alias
  is `from`, `fromAlias` or a join alias; anything else is rejected. The
  builder does not know what a tenant is: the caller puts the tenant condition
  in `on` and in `where`.
- **Expressions.** Operands are `{ col }`, `{ value }` or a node:
  `add | sub | mul | div` (`div` is fractional and returns NULL for a zero
  divisor), `secondsBetween` (timestamp difference in seconds),
  `eq | ne | lt | lte | gt | gte` (`eq`/`ne` against a NULL literal compare with
  `IS [NOT] NULL`), `and | or | not`, `isNull | isNotNull`, `coalesce` and
  `asText` (`CAST(x AS TEXT)`, `VARCHAR` on DuckDB/JSON). `asText` on both
  sides lets a join compare keys of different types, such as a text reference
  with a native `uuid` id that PostgreSQL will not compare directly; a text
  value that is not a uuid then matches nothing rather than failing the query.
  A cast column cannot use its index, so cast only when the types differ.
  Numbers, booleans and null are inlined after validation; strings and dates
  are bound as parameters. Expressions are limited to depth 24 and 1024 nodes per spec.
- **Where an expression goes.** `{ expr, as }` in `select` is a grouping key
  (grouped by its position, so a bound value is not repeated); `expr` on an
  aggregate replaces `column`; `filter` on an aggregate restricts its rows
  (rendered as `CASE WHEN`, the same on every dialect); `whereExpr` is a row
  predicate ANDed with the whole of `where` (OR groups included). `having` and `orderBy` refer to any of them by
  alias, as before.
- **Parameters.** Values are numbered in build order (select, joins, `where`,
  `whereExpr`, `having`, paging) and returned in that order. A parameter used
  by a select expression is referenced again, with the same number, when
  `having` names its alias; adapters that rewrite `$N` must resolve each
  occurrence by number (the bundled ones do).
- Date literals follow `buildWhere`: PostgreSQL binds them as `CAST($N AS
  TIMESTAMPTZ)`; DuckDB and JSON bind them as `CAST($N AS
  TIMESTAMP)`, which is read in the session time zone, so compare a
  `TIMESTAMPTZ` column against a date there with the zone in mind.
- Specs without these fields produce the SQL they always did, except that a
  dotted column with no `as` (`t.region`, which used to alias to the invalid
  `t.region`) now aliases to its last segment. Two select items that resolve to
  the same alias are rejected.

### Portable scalar expressions and generated columns

`renderExpression` is exported from the root and browser-safe `@happyvertical/sql/query`.
It uses the same expression renderer as `buildAggregate`, with a quoted-identifier
policy for standalone expressions and the existing aggregate policy for compatibility.

```typescript
import { renderExpression } from '@happyvertical/sql/query';

const rendered = renderExpression(
  { op: 'round', value: { op: 'mul', left: { col: 'total' }, right: { value: 0.2 } }, digits: { value: 2 } },
  { dialect: 'postgres', mode: 'ddl', resolveColumn: name => name },
);
// { sql, values: [], resultType: 'number', immutable: { sqlite: true, postgres: true, duckdb: true } }
```

`mode: 'query'` binds strings and typed date literals as `$N` parameters and returns
`values`; finite numbers, booleans and NULL remain inline. `mode: 'ddl'` safely
inlines literals and requires immutability on **every** dialect. JSON uses DuckDB
semantics. `resolveColumn` maps a logical column to an identifier string or
`{ name, type }`. Dots delimit identifier components, each double-quoted; it never
accepts SQL. For temporal columns, `type: 'date'` means a native SQL DATE and
`type: 'datetime'` means a native TIMESTAMP WITHOUT TIME ZONE containing UTC
wall-clock fields (SQLite stores either as ISO text). Supplying this metadata is a
caller assertion about the actual schema. Unknown, text and timezone-aware
columns cannot be used in generated temporal operations: PostgreSQL extraction
from TIMESTAMPTZ can depend on the session timezone.

New nodes are closed JSON data (unknown/missing fields are rejected):

| Node shape | Result type | NULL and portable semantics |
| --- | --- | --- |
| `{ op: 'case', branches: [{ when, then }], else }` | common branch type, otherwise `unknown` | Ordered first true condition wins; false/NULL conditions continue; selected NULL remains NULL. Conditions must be SQL booleans. |
| `{ op: 'if', condition, then, else }` | common branch type | One-branch CASE; false/NULL selects else. |
| `{ op: 'round', value, digits }` | number | Strict NULL; halfway cases round away from zero, including negative digits. Integer digits are bounded to -12..12. |
| `{ op: 'abs' / 'floor' / 'ceil', value }` | number | Strict NULL; ordinary mathematical absolute value, floor and ceiling. |
| `{ op: 'least' / 'greatest', operands }` | number | At least two numeric operands; **any** NULL yields NULL, including on PostgreSQL. |
| `{ op: 'mod', left, right }` | number | Fractional remainder with dividend's sign; NULL operand or zero divisor yields NULL. Existing `div` also yields NULL for zero. |
| `{ op: 'concat', operands }` | text | At least one text operand; concatenation with any NULL yields NULL. |
| `{ op: 'lower' / 'upper', value }` | text | Strict NULL; ASCII A-Z/a-z conversion only. Non-ASCII characters are preserved identically across dialects. |
| `{ op: 'trim', value }` | text | Strict NULL; removes ASCII spaces from both ends, preserving tabs/newlines. |
| `{ op: 'length', value }` | number | Strict NULL; Unicode code-point count, not grapheme count. |
| `{ op: 'substring', value, start, length }` | text | Strict NULL; positive one-based integer start, nonnegative integer length, both at most 2147483647. Out-of-string start returns empty text. |
| `{ op: 'year' / 'month' / 'day', value }` | number | Strict NULL; UTC calendar part for typed dates/datetimes. |
| `{ op: 'daysBetween', later, earlier }` | number | Strict NULL; signed calendar-date difference, discarding time of day. |
| `{ op: 'addDays', value, days }` | date | Strict NULL; add integer calendar days (-365000..365000), discarding time of day. Canonical YYYY-MM-DD text at the expression boundary; native DATE internally for composition. |
| `{ value: { kind: 'date' / 'datetime', iso } }` | date / datetime | JSON-safe typed literal; date requires YYYY-MM-DD, datetime requires ISO seconds and explicit Z/offset (up to millisecond precision). Gregorian calendar/leap days are validated. Datetimes are canonicalized to UTC before timezone-free SQL casts. |

All function arguments above are expression operands (`{ col }`, `{ value }`, or
another node). Numeric functions require SQL numeric values, text functions SQL
text values, and conditional branches compatible SQL types; this renderer does
not inspect a live schema or emulate dialect-specific implicit conversions.
Invalid literal integer arguments throw; dynamic NULL/out-of-range/fractional
integer arguments yield NULL without unsafe casts. An `addDays` result outside
years 0001..9999 yields NULL before formatting or nested date operations. Legacy
JavaScript `Date` query literals retain their
existing casts (including PostgreSQL TIMESTAMPTZ); generated use requires the new
typed literals. Generated `asText` also requires known number/text/boolean input;
date-to-text casts and unknown types can depend on session settings. SQL DATE/TIMESTAMP literal projections use native database result
representations; date-valued formula projections use canonical ISO text.

Every new node is immutable on SQLite, PostgreSQL and DuckDB with these input
type contracts. `case`/`if` report their common result type (`null` when all
branches are NULL, otherwise `unknown` for mixed types); existing `coalesce`
propagates types too. `immutable` reports each dialect independently and includes
children. A nonimmutable child (legacy Date, or a temporal operation on an unknown
column) makes generated use fail with `ExpressionError.code: 'NON_IMMUTABLE'`.
Invalid data uses `INVALID_EXPRESSION`; depth >24, >1024 nodes or >262144 cumulative
SQL characters during rendering uses `EXPRESSION_LIMIT`. SQL expansion guards
apply before nested portable guards can allocate exponentially large strings.

Tests execute each node on SQLite, PGlite and DuckDB and create generated columns
and expression indexes on SQLite/PostgreSQL. DuckDB supports virtual generated
columns but rejects indexes on generated columns (constant expressions can instead
fail its requirement to reference a base column); these index limitations are
asserted explicitly. This API renders expressions; callers create schema DDL.

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

On PostgreSQL, `syncSchema()` recognizes `CREATE [UNIQUE] INDEX CONCURRENTLY
[IF NOT EXISTS]` statements, including optional `USING` index methods, and
skips indexes that already exist when a schema is applied again.

PostgreSQL `tableExists()`, `getTableSchema()`, and `syncSchema()` resolve an
unqualified table name through the executing connection's `search_path`, so a
non-`public` schema can be used without changing the API. Root PostgreSQL
helpers use a pool: do not issue `SET search_path` on one root call and assume
later root helpers will use that same session. Configure the path for every
pool connection, or keep transaction-scoped schema work on the supplied `tx`
handle with `SET LOCAL search_path` before calling `tx.tableExists()` or
`tx.syncSchema()`. `acquireSession()` pins raw PostgreSQL queries to one
connection for session-scoped state; root metadata helpers are not part of
that raw session handle.

### Vector Search (PostgreSQL)

PostgreSQL adapters (and PGlite with its pgvector extension) expose `db.vector` when pgvector is available:

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
| SQLite | `'sqlite'` | LibSQL (`@libsql/client`) by default; built-in `node:sqlite` for capabilities and `secureFile` | Supports `:memory:`, file, and remote Turso URLs by default. Native capabilities are local-only; trusted-parent secure files are macOS/Linux, or Windows with a caller-supplied `windowsCustody.verify` |
| PostgreSQL | `'postgres'` | `pg` Pool | Connection pooling, pgvector support |
| PGlite | `'pglite'` | `@electric-sql/pglite` (optional peer) | Postgres in WebAssembly. Browser-safe via `@happyvertical/sql/pglite`; persists to IndexedDB, OPFS, or a directory; single connection |
| DuckDB | `'duckdb'` | `@duckdb/node-api` | JSON file auto-registration, write-back strategies |
| JSON | `'json'` | DuckDB in-memory | Queries JSON files as tables, connection caching |

## API Overview

**Factory**: `getDatabase(options)` — creates or returns a cached database connection.

**Interface** (`DatabaseInterface`): `many`, `single`, `pluck`, `execute`, `query`, `insert`, `get`, `list`, `update`, `upsert`, `getOrInsert`, `delete`, `count`, `table`, `tableExists`, `syncSchema`, `transaction`, `beginTransaction`, `vector`, `notifications`, `close`.

**Utilities**: `buildWhere`, `raw`, `syncSchema`, `tableExists`, `escapeSqlValue`, `validateColumnName`, `formatDbError`, `convertUniqueIndexesToInlineConstraints`.

**Schema**: `DatabaseSchemaManager` for JSON manifest-based schema initialization with dependency resolution.

## License

ISC

### SQLite lock contention and recovery

The local file-backed libsql driver can retain a failed statement after
`SQLITE_BUSY`. The adapter closes that poisoned connection instead of silently
reconnecting and losing connection-local state. The error (possibly nested in
`DatabaseError.cause`) has `code: 'SQLITE_BUSY'` and
`connectionInvalidated: true`; later queries on that instance fail likewise.
Reacquire with `getDatabase` (the same `dbid` evicts the closed cached instance),
restore any PRAGMAs or temporary tables, and retry the **entire transaction**
with bounded backoff. No partial statements are replayed automatically. This
recovery applies to local file libsql, not remote, native-capability, secure,
or in-memory adapters. Applications should use an explicit connection factory
when automating recovery so initialization is repeated deliberately.
