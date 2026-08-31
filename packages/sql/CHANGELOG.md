# @happyvertical/sql

## 0.89.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.89.2

## 0.89.1

### Patch Changes

- d26f687: Recognize PostgreSQL `CREATE INDEX CONCURRENTLY` statements during schema synchronization so repeated syncs skip indexes that already exist.
  - @happyvertical/utils@0.89.1

## 0.89.0

### Minor Changes

- d914770: Add a portable, case-sensitive `contains` WHERE operator for literal text
  substrings. `like` now emits an explicit backslash escape character on every
  adapter while preserving `%` and `_` as pattern wildcards.

### Patch Changes

- c882a7f: Forward PostgreSQL connection and idle timeout options to connection pools and include them in derived cache identities.
  - @happyvertical/utils@0.89.0

## 0.88.2

### Patch Changes

- 596e262: Expose sanitized database driver diagnostics through `DatabaseError` messages,
  native causes, and JSON serialization while redacting SQL statements, bound
  values, and credential-shaped details.
- Updated dependencies [596e262]
  - @happyvertical/utils@0.88.2

## 0.88.1

### Patch Changes

- 7cad57d: Fix PostgreSQL schema synchronization so quoted named table constraints are not
  mistaken for missing columns.
  - @happyvertical/utils@0.88.1

## 0.88.0

### Patch Changes

- @happyvertical/utils@0.88.0

## 0.87.0

### Patch Changes

- @happyvertical/utils@0.87.0

## 0.86.4

### Patch Changes

- Updated dependencies [7515331]
  - @happyvertical/utils@0.86.4

## 0.86.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.86.3

## 0.86.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.86.2

## 0.86.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.86.1

## 0.86.0

### Patch Changes

- @happyvertical/utils@0.86.0

## 0.85.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.5

## 0.85.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.4

## 0.85.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.2

## 0.85.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.85.1

## 0.85.0

### Patch Changes

- @happyvertical/utils@0.85.0

## 0.84.0

### Minor Changes

- 867a83c: **Breaking:** the identifier validators now reject non-string arguments instead of coercing them. `validateTableName`, `validateColumnName`, `validateIndexName` and the aggregate identifier check gated on `regex.test(value)`, which calls `toString` on its argument. Five non-string shapes therefore passed validation by coercing to a legal identifier — `null` → `"null"`, `undefined` → `"undefined"`, a boxed `new String('users')`, a single-element array `['users']`, and any object with a conforming `toString`. Passing one of those to an SDK method that names a table or column now throws `Invalid table name` / `Invalid column name` rather than silently coercing. TypeScript callers are unaffected — the parameters were always typed `string`.

  This closes a validate-then-interpolate gap: because validation coerced the value and the SQL was built from a _second_ coercion of the same value, an object whose `toString` returned a benign name on the first read and a hostile one on the second passed the check and then reached SQL. It was a near-miss rather than a live exploit — it needs a crafted object identity that `JSON.parse` cannot produce, so request-shaped input could not reach it — but validation and interpolation must agree on the identifier, which is the whole point of the identifier work in #1114.

  The `upsert` paths on all five adapters had the same shape for column lists: they validated one enumeration of `Object.keys(data)` and then re-enumerated the record when building SQL, so a `Proxy` with an `ownKeys` trap could present different keys to each. Each adapter now serializes/snapshots the record once and threads that single enumeration through both validation and SQL. On PostgreSQL and both SQLite adapters the same divergence existed for `conflictColumns` — validated through a copy, then interpolated bare into `ON CONFLICT(...)` from the live array — so those are now snapshotted once and threaded through too. The DuckDB and JSON `update` paths, which read column names and values from two separate enumerations, now read values through the validated key list so a hostile object cannot bind values to the wrong columns.

### Patch Changes

- @happyvertical/utils@0.84.0

## 0.83.0

### Minor Changes

- f3a5a10: Make JSON-adapter data-file load failures observable to calling code. When a `.json` data file parses but its records cannot be inserted into the table created for it — a renamed or dropped column, a `NOT NULL` / `PRIMARY KEY` violation, or a file whose fields match no column — the adapter still keeps that table (present but empty) and loads every other table, but the failure was previously only visible as a `console.error` on stderr, so calling code could not tell an empty table apart from one that failed to load. The JSON adapter now exposes a `getTableLoadErrors()` method returning the `{ table, filePath, error }` failures (accumulated across the connection's lifetime, covering both connection-time and deferred `syncSchema()` / `execute()` loads), and accepts an `onTableLoadError` callback in `JSONOptions` for real-time notification. A new `JSONTableLoadError` type is exported.

  This is additive and JSON-specific — the shared `DatabaseInterface` is unchanged. The JSON adapter is the only one that loads a data file into a constrained table (where a bad file yields the silent present-but-empty case); the DuckDB adapter exposes JSON files as views, and the others have no connection-time file load. Because connections are cached per URL, `getTableLoadErrors()` reflects the shared connection's failures; the `onTableLoadError` callback is registered only for the `getDatabase()` call that first opens a URL.

### Patch Changes

- @happyvertical/utils@0.83.0

## 0.82.0

### Minor Changes

- e806b9f: **Breaking:** condition keys are now validated as plain SQL identifiers whether or not they carry an operator suffix. Previously a key ending in a recognised operator (`>`, `like`, `in`, …) suppressed identifier validation for the whole key, so everything before the operator was emitted as raw SQL — `{ "name = '' OR 1=1 --  =": x }` was accepted and injected. Keys _without_ an operator suffix were already validated, which made the escape hatch easy to cross by accident: the same condition object was safe or unsafe depending on whether the caller appended an operator.

  Expression keys now require the new `raw()` marker, which states that the SQL is caller-authored:

  ```typescript
  import { buildWhere, raw } from "@happyvertical/sql";

  buildWhere({ "LOWER(status) =": "paid" }); // now throws
  buildWhere({ [raw("LOWER(status) =")]: "paid" }); // WHERE LOWER(status) = $1
  ```

  `raw()` prefixes the expression with a fixed, non-secret marker that `buildWhere` strips before emitting SQL. The point is worth stating plainly: this stops an expression key being used _by accident_ — the shape of the key no longer grants raw access, only a call to `raw()` does — but it is not a sanitizer. A caller that maps an entire attacker-controlled string into a key, marker included, can still reach raw SQL, so continue to validate at your own trust boundary. The marker holds no secret, so keys stay readable in errors, logs and `DatabaseError` context, and wrapping one expression never changes what an unmarked key means elsewhere.

  This also removes an inconsistency inside the package: `buildAggregate` already validated where-keys regardless of operator suffix and rejected the expression shape `buildWhere` accepted. Both builders now behave the same, `buildAggregate` composes its `HAVING` expressions through `raw()`, and a `raw()` key in `having` is emitted verbatim instead of being expanded as a select alias.

  **Scope of the break.** This is not limited to callers of `buildWhere` and `buildAggregate`. Every adapter routes the caller's `where` through `buildWhere`, so `get`, `list`, `update`, `delete`, `count` and `getOrInsert` on the PostgreSQL, SQLite, sqlite-native, DuckDB and JSON adapters are affected too — `db.list('users', { 'LOWER(email) =': x })` now throws. (`upsert` matches on `conflictColumns`, not a `where`, so it is unaffected.)

  To migrate, wrap developer-authored expression keys in `raw()`. Plain identifiers, with or without operator suffixes (`'price >'`, `'orders.total <='`), are unaffected. Note that enforcement is at runtime: `WhereClause` keys are plain `string`, so TypeScript will not flag an unmarked expression key at the call site.

### Patch Changes

- 0a09b0e: Restore CI coverage for the PostgreSQL pgvector adapter and fix three vector specs that bound the table name as a parameter.

  `postgres-vector.spec.ts` early-returns every test when the `vector` extension is unavailable, so it reported green without asserting anything. The service-container Postgres job ran `postgres:18-alpine` (no pgvector), so the adapter had no real CI coverage; it now runs a digest-pinned `pgvector/pgvector:pg17` image so the suite executes.

  With the suite running, three `upsertVector` verification queries failed: they built `SELECT ... FROM "${testTable}"` through the `single` tagged template, which parameterizes the table name (`FROM "$1"`) so Postgres rejects it. They now build the SQL as a plain string via `db.query(...)`, matching the passing queries in the same file.

  - @happyvertical/utils@0.82.0

## 0.81.0

### Minor Changes

- e0f8551: Fix concurrent `transaction()` calls corrupting each other on the single-connection adapters (SQLite via LibSQL, SQLite via `node:sqlite`, DuckDB and JSON). `transaction()` issued `BEGIN` straight onto the shared connection with no serialization and no record of whether one was already open, so two calls that merely overlapped in time destroyed each other: the second `BEGIN` threw, its `catch` ran `ROLLBACK`, and that rollback ended the _first_ transaction — leaving part of its writes durable, part lost, and its promise rejected, so a caller correctly retrying on rejection was reasoning about a transaction it believed had never happened. No nesting was required; two concurrent requests were enough, which made it reachable from any server handling more than one at a time.

  Transactions are now serialized per connection for their whole `BEGIN` … `COMMIT`/`ROLLBACK` span, including the null-aware upsert path, which opens a transaction on the same connection. Re-entrant calls are unaffected: nesting still re-enters under a `SAVEPOINT` on SQLite and is still refused on DuckDB and JSON, and a transaction-scoped upsert does not open its own transaction.

  **Behaviour changes to be aware of.** Overlapping transactions now queue where they previously failed immediately, so a call that used to error at once may instead wait. The new `transactionQueueTimeout` option (default 30s, must be positive and finite) bounds that wait and reports which of the usual causes applies; it is read when the connection is created, so cached connections keep the first caller's value. The clock starts when the call queues rather than when the connection frees, so it bounds the total wait — raise it for sustained bursts on one connection, not just for long transactions. A `beginTransaction()` handle now holds the connection until it is committed or rolled back: end handles in a `finally`, because one that is never ended blocks every later transaction on that connection. `beginTransaction()` called inside a transaction on the native SQLite path now refuses with `NestedTransactionError` instead of throwing a raw SQLite error. A `COMMIT` that throws now attempts a `ROLLBACK` before handing the connection on, so a failed commit cannot leave the connection inside a transaction for the next caller to trip over.

### Patch Changes

- 7d993be: Fix `count()` throwing on the LibSQL SQLite adapter whenever it is called without a `where` clause. (The native SQLite path, used when a `capabilities` option is set, was unaffected.) The no-condition branch built its query through the `pluck` tagged template, which parameterizes every interpolation, so the table name was bound as a value and the adapter emitted `SELECT COUNT(*) FROM ?` — SQLite rejects a parameter in identifier position, surfacing as `DatabaseError: Failed to count records in table`. `db.count(table)` and `db.count(table, {})` had therefore never worked on that adapter; the branch that takes conditions built its SQL correctly, and the no-condition shape was only ever exercised against the JSON adapter, which builds it correctly too, so nothing covered the adapter that got it wrong. The query is now built the same way the conditional branch builds it, which is safe because `validateTableName()` already runs on the table name first. Adds coverage for the no-`where` call shape across every adapter.
- b9aff6e: Fix batch `insert()` writing a record's values into the wrong columns. The column list is taken from the first record, but the PostgreSQL adapter (top-level, `transaction()`-scoped and `beginTransaction()` paths) and the libsql SQLite adapter took each row's values from that row's own key order via `Object.values(record)`. A later record carrying the same keys in a different insertion order therefore had its values cross-assigned into each other's columns, silently and with no error at any layer — privilege-escalation-shaped wherever part of a batch is attacker-influenced, since reordering your own keys steers your own value into a column you were not meant to write. Every adapter now projects each record through the resolved column list, so key order is irrelevant.

  Batches whose records disagree on their key set are now rejected with a `DatabaseError` naming the offending record index and keys, on all five adapters. A single INSERT emits one column list for every row, so an extra key was previously dropped silently. A missing key was silently written as `NULL` on DuckDB and JSON, and on the two positional adapters shifted every following value — corrupting the row on PostgreSQL and libsql, though a batch whose _last_ record was the short one happened to bind NULL on libsql too. A key whose value is `undefined` counts as absent, so `{ ...base, optional: undefined }` is now rejected consistently rather than throwing on the adapters that strip undefined before binding and writing `NULL` on the ones that do not. Callers who relied on ragged batches filling gaps with `NULL` — which worked on DuckDB and JSON — must now pass that `null` explicitly or split the batch into separate `insert()` calls. An empty batch is a no-op returning `affected: 0` rather than a `TypeError` on three of the adapters, except on a read-only JSON database, which still rejects any write.

  The JSON adapter's startup file loader is deliberately exempt from the new validation: it reads records out of a `.json` file rather than from a caller, where optional fields are ordinary, and its failures are swallowed as warnings — so validating there would turn a partial load into a silently empty table. Relatedly, the JSON adapter now binds `undefined` as `NULL` instead of failing the statement with DuckDB's "Cannot create values of type ANY", which previously made any data file whose records omitted a field load zero rows.

- 2ac632c: Fix the JSON adapter failing to load any data file whose records have different key sets — that is, any file with an optional field. The loader derived its whole column list from the first record alone, so a later record missing that key bound `undefined`, DuckDB rejected the multi-row INSERT with "Cannot create values of type ANY", and every row was lost. `loadJSONData` swallowed the failure as a dismissive `console.warn`, so the caller was left with a table that existed but held zero rows and no meaningful error. In the mirror case — a later record carrying a field the first record lacked — the insert succeeded with the correct row count while that column was silently dropped.

  Columns are now unioned across all records, a record omitting a key binds `NULL`, and a field with no matching column (including a case-variant of one already claimed) is reported and skipped instead of costing the whole load. Non-object array elements are skipped rather than emitting phantom all-`NULL` rows. When a file that did parse still cannot be loaded, the adapter now logs the failure loudly (`console.error`, stating the table is left empty) rather than hiding it — while still loading every other table in the same data directory or `syncSchema()` call. An unreadable or malformed file remains tolerated with a warning.

- e0f8551: Fix transaction-scoped PostgreSQL methods throwing raw `pg` errors instead of `DatabaseError`. The transaction interfaces were hand-maintained copies of the pool-backed methods that called the client bare, so `instanceof DatabaseError` answered differently depending on whether the call was inside a transaction — and the difference was invisible, because `pg` exports its own class also named `DatabaseError`, making `err.name`, `err.constructor.name` and any logged stack read the same either way. Error handling of the form `if (e instanceof DatabaseError) { ... } else throw e` silently took the wrong branch inside transactions, and the failures also lost the structured `sql`/`values`/`originalError` context exactly where diagnosis matters most.

  Both interfaces are now built from one client-bound factory, so there is a single implementation of each method and the error contract cannot drift again.

  **Behaviour changes to be aware of.** Inside a transaction, `get`, `list`, `update`, `delete`, `count`, `query` and the template-literal methods now reject with `DatabaseError`, so a caller that was reading `err.code` off the raw `pg` error will find it flattened into the `context.originalError` string, exactly as it already was outside transactions. `insert` deliberately stays unwrapped on both paths so the driver error — and its `code` — still reaches callers. Value serialization is _not_ unified: the pool-backed `insert`/`update` keep applying `serializeRecord` and the transaction-scoped ones keep passing values through untouched, because PostgreSQL accepts a raw JS array for a `text[]` column and a JSON string for `jsonb` but not the reverse, and collapsing them would have silently broken one shape of write and corrupted `bytea`. `tx.syncSchema()` now scopes each failure it tolerates to a savepoint: without that, a swallowed DDL error aborted the transaction, and `COMMIT` on an aborted transaction succeeds with a ROLLBACK tag, so the caller was told work committed that had been discarded.

- e0f8551: Fix `tx.tableExists()` and `tx.syncSchema()` running outside the transaction on the PostgreSQL adapter. Both were carried over from the enclosing scope into the transaction-scoped interfaces, and both close over the _pool_ rather than the transaction's client, so they executed on a different connection. `tx.tableExists()` could not see a table created earlier in the same transaction, and — the damaging one — `tx.syncSchema()` committed its DDL immediately, so "run my migration inside a transaction so it rolls back cleanly on failure" left a partially-applied migration applied. The behaviour also differed silently by adapter: on the single-connection adapters the same calls do run inside the transaction, so code developed against SQLite changed behaviour when deployed on PostgreSQL. Both are now built per client alongside every other transaction-scoped method.
- e0f8551: Fix SQL injection through unvalidated table and column identifiers. `validateTableName()` was applied to `delete` and `count` but not to `get`, `list`, `insert`, `update`, `upsert` or `getOrInsert`, which interpolated the table name straight into SQL — `db.list("t1 WHERE 1=1 UNION SELECT id, secret FROM t1 --", {})` executed the injected clause and returned the other table's rows. Column names taken from `Object.keys(data)` and from `conflictColumns` were interpolated with no validation anywhere.

  Every method that interpolates an identifier now checks it, on all five adapters and on the transaction-scoped interfaces as well as the pool-backed one. Review of the same defect class found and closed four more sinks: `tableExists()` on DuckDB and JSON (worse than the rest, because those engines execute every statement in the string they are given, making it a DDL sink rather than a read oracle); `exportTable()` on DuckDB and JSON, where the name reached both a `COPY` statement and its destination path, so it could write a file outside the data directory _and_ run trailing statements; the PostgreSQL vector capability, whose `ensureColumn`/`ensureIndex`/`upsertVector`/`search` took table, column and index type unchecked; and the JSON adapter's schema-inference paths, where a file path and a filename-derived table name reached DDL at `getDatabase()` time.

  Identifiers are checked rather than quoted where they are interpolated bare: the accepted shape (`[a-zA-Z_][a-zA-Z0-9_]*`) contains no character that can terminate an identifier, and quoting a column name on PostgreSQL would make it case-sensitive and silently change which column an existing caller addresses.

  **Behaviour changes to be aware of.** A table name that is not a plain identifier — a qualified `schema.table`, a quoted name, or anything containing whitespace — is now rejected where some methods previously accepted it. The same applies to column names in `insert` and `update` on every adapter, and in `upsert` on PostgreSQL and both SQLite paths. DuckDB and JSON already quoted column names in `upsert`, so those keep accepting names that need quoting (`Full Name`, `user-id`) — they are escaped rather than rejected, which matters most for the JSON adapter, whose columns are the keys of whatever JSON it was pointed at. `buildWhere`'s operator-suffix escape hatch is unchanged and remains a documented developer-controlled trust boundary.

  - @happyvertical/utils@0.81.0

## 0.80.6

### Patch Changes

- 2e114bd: Fix nested `transaction()` silently opening an independent transaction on a second connection in the PostgreSQL adapter. `tx.transaction()` re-exposed the top-level `transaction`, so the nested callback ran on a freshly pooled connection under its own `BEGIN`: it could not see the enclosing transaction's uncommitted rows, and if the enclosing transaction held a lock the nested one needed, the two deadlocked in a way PostgreSQL cannot detect — the outer connection waits on a promise rather than a lock, so `deadlock_timeout` never fires and the process hangs. Re-entering now runs the callback under a `SAVEPOINT` on the same connection, releasing on success and rolling back to it on failure, so a failed nested scope leaves the enclosing transaction usable.
  - @happyvertical/utils@0.80.6

## 0.80.5

### Patch Changes

- 37d91cb: Fix nested `transaction()` silently destroying the enclosing transaction on the SQLite (both the libsql and native-capabilities paths), DuckDB and JSON adapters. Calling `tx.transaction()` re-exposed the top-level `transaction`, which issued a second `BEGIN` on the connection already in a transaction; that throws, and the nested call's own `ROLLBACK` then discarded the outer transaction's uncommitted work while later writes committed in autocommit. Both SQLite implementations now re-enter the current transaction under a `SAVEPOINT`. DuckDB and JSON have no savepoint support, so nesting throws the new `NestedTransactionError` without touching the connection, leaving the enclosing transaction intact. A failing `ROLLBACK` also no longer replaces the caller's original error.
  - @happyvertical/utils@0.80.5

## 0.80.4

### Patch Changes

- 218c316: Fix PostgreSQL connection lifecycle defects that could crash the process or deadlock the pool. The pool now registers an `error` handler, so an idle client whose backend goes away (restart, failover, proxy timeout) no longer raises an unhandled `error` event and terminates the process. Transactions release their pooled client on every teardown path, including a throwing `COMMIT` or `ROLLBACK`, which previously stranded a connection permanently and exhausted the pool. A failing rollback also no longer replaces the caller's original error; it is attached as `cause` instead.
  - @happyvertical/utils@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.80.3

## 0.80.2

### Patch Changes

- @happyvertical/utils@0.80.2

## 0.80.1

### Patch Changes

- @happyvertical/utils@0.80.1

## 0.80.0

### Patch Changes

- @happyvertical/utils@0.80.0

## 0.79.0

### Patch Changes

- @happyvertical/utils@0.79.0

## 0.78.3

### Patch Changes

- @happyvertical/utils@0.78.3

## 0.78.2

### Patch Changes

- @happyvertical/utils@0.78.2

## 0.78.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.78.1

## 0.78.0

### Patch Changes

- @happyvertical/utils@0.78.0

## 0.77.0

### Patch Changes

- @happyvertical/utils@0.77.0

## 0.76.2

### Patch Changes

- @happyvertical/utils@0.76.2

## 0.76.1

### Patch Changes

- @happyvertical/utils@0.76.1

## 0.76.0

### Patch Changes

- @happyvertical/utils@0.76.0

## 0.75.0

### Patch Changes

- @happyvertical/utils@0.75.0

## 0.74.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.11

## 0.74.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.10

## 0.74.9

### Patch Changes

- @happyvertical/utils@0.74.9

## 0.74.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.8

## 0.74.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.7

## 0.74.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.6

## 0.74.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.5

## 0.74.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.4

## 0.74.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.3

## 0.74.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.2

## 0.74.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.74.1

## 0.74.0

### Minor Changes

- a6730c1: Fix `upsert()` for nullable conflict columns by matching `NULL` values against existing `NULL` values, with a `nullsDistinct` opt-out for native database behavior.

### Patch Changes

- @happyvertical/utils@0.74.0

## 0.73.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.4

## 0.73.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.3

## 0.73.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.2

## 0.73.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.73.1

## 0.73.0

### Patch Changes

- @happyvertical/utils@0.73.0

## 0.72.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.72.3

## 0.72.2

### Patch Changes

- Restore legacy PostgreSQL raw query question-mark placeholder compatibility while preserving JSONB operator queries.

- Updated dependencies
  - @happyvertical/utils@0.72.2

## 0.72.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.72.1

## 0.72.0

### Patch Changes

- @happyvertical/utils@0.72.0

## 0.71.34

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.34

## 0.71.33

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.33

## 0.71.32

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.32

## 0.71.31

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.31

## 0.71.30

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.30

## 0.71.29

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.29

## 0.71.28

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.28

## 0.71.27

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.27

## 0.71.26

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.26

## 0.71.25

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.25

## 0.71.24

### Patch Changes

- @happyvertical/utils@0.71.24

## 0.71.23

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.23

## 0.71.22

### Patch Changes

- @happyvertical/utils@0.71.22

## 0.71.20

### Patch Changes

- @happyvertical/utils@0.71.20

## 0.71.19

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.19

## 0.71.18

### Patch Changes

- @happyvertical/utils@0.71.18

## 0.71.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.17

## 0.71.16

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.16

## 0.71.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.15

## 0.71.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.14

## 0.71.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.13

## 0.71.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.12

## 0.71.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.11

## 0.71.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.10

## 0.71.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.9

## 0.71.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.8

## 0.71.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.7

## 0.71.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.6

## 0.71.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.5

## 0.71.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.4

## 0.71.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.3

## 0.71.2

### Patch Changes

- Updated dependencies [8202b19]
  - @happyvertical/utils@0.71.2

## 0.71.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.1

## 0.71.0

### Minor Changes

- dac9026: Add `requiresSchemaCheck` flag to DatabaseInterface

  Adapters that auto-create tables at runtime (JSON, DuckDB) now set
  `requiresSchemaCheck: true`. Migration-managed adapters (Postgres, SQLite)
  leave it unset, allowing frameworks to skip redundant `tableExists()` calls
  during collection initialization.

  Add `createRepositoryFromTemplate()` to `GitHubRepository` for creating
  new repositories from a template via `POST /repos/{owner}/{repo}/generate`.

### Patch Changes

- @happyvertical/utils@0.71.0

## 0.70.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.7

## 0.70.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.6

## 0.70.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.5

## 0.70.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.4

## 0.70.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.3

## 0.70.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.2

## 0.70.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.1

## 0.70.0

### Minor Changes

- 919efea: Add `requiresSchemaCheck` flag to DatabaseInterface

  Adapters that auto-create tables at runtime (JSON, DuckDB) now set
  `requiresSchemaCheck: true`. Migration-managed adapters (Postgres, SQLite)
  leave it unset, allowing frameworks to skip redundant `tableExists()` calls
  during collection initialization.

### Patch Changes

- @happyvertical/utils@0.70.0

## 0.69.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.9

## 0.69.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.8

## 0.69.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.7

## 0.69.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.6

## 0.69.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.5

## 0.69.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.4

## 0.69.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.3

## 0.69.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.2

## 0.69.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.1

## 0.69.0

### Patch Changes

- @happyvertical/utils@0.69.0

## 0.68.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.13

## 0.68.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.12

## 0.68.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.11

## 0.68.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.10

## 0.68.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.9

## 0.68.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.8

## 0.68.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.7

## 0.68.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.6

## 0.68.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.5

## 0.68.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.4

## 0.68.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.3

## 0.68.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.2

## 0.68.1

### Patch Changes

- 34f0da0: perf(sql): batch index existence checks in PostgreSQL syncSchema

  Pre-scan all CREATE INDEX commands and check existence with a single
  `pg_indexes` query using `ANY($1::text[])` instead of one query per index.
  Reduces ~869 queries per syncSchema call to 1.

  - @happyvertical/utils@0.68.1

## 0.68.0

### Patch Changes

- @happyvertical/utils@0.68.0

## 0.67.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.9

## 0.67.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.8

## 0.67.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.7

## 0.67.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.6

## 0.67.5

### Patch Changes

- @happyvertical/utils@0.67.5

## 0.67.4

### Patch Changes

- db40a0a: Fix TypeScript errors from @types/node v25 stricter type checking

  - analytics/ga4.ts: Use non-null assertions for adminClient/dataClient after ensureClients()
  - utils/parse-args.ts: Cast options to Record<string, unknown> for number value post-processing
  - sql/postgres.ts: Add type annotation to reduce() for batch insert values

- Updated dependencies [db40a0a]
  - @happyvertical/utils@0.67.4

## 0.67.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.3

## 0.67.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.2

## 0.67.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.1

## 0.67.0

### Minor Changes

- 9fef9e5: Add Claude Code context installation CLI for each package

  Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

  - **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
  - **CLAUDE.md**: Full documentation for AI-assisted development
  - **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

  Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.

### Patch Changes

- Updated dependencies [9fef9e5]
  - @happyvertical/utils@0.67.0

## 0.66.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.11

## 0.66.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.10

## 0.66.9

### Patch Changes

- 8f80804: fix(sql): preserve database error details across all adapters

  Database errors include additional properties beyond just `message` that provide crucial debugging information:

  - PostgreSQL: code, detail, hint, severity
  - SQLite/LibSQL: code, errno
  - DuckDB: code, detail

  Previously, only the error message was captured, losing these details. Users were seeing errors like "upsert failed" without knowing why.

  This change:

  - Adds a shared `formatDbError()` helper function in `shared/utils.ts`
  - Updates all CRUD operations across all adapters (postgres, sqlite, duckdb, json) to use this helper
  - Exports `formatDbError` for consumers who need to format database errors
  - Ensures error messages now include all available error properties
  - @happyvertical/utils@0.66.9

## 0.66.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.8

## 0.66.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.7

## 0.66.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.4

## 0.66.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.3

## 0.66.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.2

## 0.66.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.1

## 0.66.0

### Patch Changes

- @happyvertical/utils@0.66.0

## 0.65.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.65.1

## 0.65.0

### Patch Changes

- @happyvertical/utils@0.65.0

## 0.64.0

### Patch Changes

- @happyvertical/utils@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [8c28ddc]
  - @happyvertical/utils@0.63.0

## 0.62.0

### Patch Changes

- @happyvertical/utils@0.62.0

## 0.61.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.4

## 0.61.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.3

## 0.61.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.2

## 0.61.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.1

## 0.61.0

### Patch Changes

- @happyvertical/utils@0.61.0

## 0.60.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.9

## 0.60.8

### Patch Changes

- 996fc5d: fix(sql): preserve numeric types in JSON adapter export

  The JSON adapter's `exportTableToJSON` function was casting ALL non-JSON columns to TEXT, which caused numeric fields like `latitude` and `longitude` to be exported as strings instead of numbers.

  Now only text-based columns are cast to TEXT (to prevent DuckDB's hugeint conversion for UUIDs), while numeric types (DOUBLE, REAL, FLOAT, INTEGER, BIGINT, etc.) and booleans are preserved as-is.

  Fixes #694

  - @happyvertical/utils@0.60.8

## 0.60.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.7

## 0.60.6

### Patch Changes

- 43c295e: fix(sql): preserve JSON object structure in JSON adapter export

  The JSON adapter was casting ALL columns to TEXT during export, which converted JSON objects like `_meta_data: {}` to strings `_meta_data: "{}"`. This caused validation failures with INVALID_META_DATA errors.

  Now JSON and STRUCT columns are preserved as objects during export, while other columns are still cast to TEXT to prevent hugeint conversion issues.

  - @happyvertical/utils@0.60.6

## 0.60.5

### Patch Changes

- cf21ed1: fix(sql): use globalThis for connection cache to fix cross-module lost updates

  The JSON adapter's `memoryConnectionCache` was a module-level Map, which caused the "lost update" bug to persist in monorepos where the same package is loaded from different paths (e.g., pnpm store vs workspace symlink). Each module instance had its own cache, so records written through one path were not visible to the other.

  This fix uses `globalThis` to store the connection cache, ensuring all module instances share the same cache regardless of how they're loaded.

  Fixes #678

  - @happyvertical/utils@0.60.5

## 0.60.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.4

## 0.60.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.3

## 0.60.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.2

## 0.60.1

### Patch Changes

- 01a2fde: fix(sql): prevent DuckDB :memory: databases from leaking to disk

  DuckDB interprets any string as a file path unless it's exactly ':memory:'.
  URLs like ':memory:12345' were creating files named ':memory:12345' in the
  working directory.

  This fix redirects :memory:\* patterns to temp files in os.tmpdir(), preventing
  file pollution in the current working directory while maintaining test isolation.

  Fixes #544

  - @happyvertical/utils@0.60.1

## 0.60.0

### Patch Changes

- @happyvertical/utils@0.60.0

## 0.59.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.6

## 0.59.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.5

## 0.59.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.4

## 0.59.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.3

## 0.59.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.2

## 0.59.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.1

## 0.59.0

### Patch Changes

- @happyvertical/utils@0.59.0

## 0.57.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.1

## 0.57.0

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.0

## 0.56.18

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.18

## 0.56.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.17

## 0.56.16

### Patch Changes

- 9ef2c67: docs: add note about table name quoting fix in JSON adapter (relates to #509)
  - @happyvertical/utils@0.56.16

## 0.56.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.15

## 0.56.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.14

## 0.56.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.13

## 0.56.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.12

## 0.56.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.11

## 0.56.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.10

## 0.56.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.9

## 0.56.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.8

## 0.56.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.7

## 0.56.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/utils@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/utils@0.56.4

## 0.56.3

### Patch Changes

- @happyvertical/utils@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/utils@0.56.2

## 0.56.1

### Patch Changes

- @happyvertical/utils@0.56.1

## 0.56.0

### Patch Changes

- c1b1111: Enable fixed versioning for all @happyvertical packages

  All packages in the SDK monorepo now share the same version number. This simplifies version management and makes it easier to understand which packages work together.

  **Changes:**

  - Updated `.changeset/config.json` to enable fixed versioning for all `@happyvertical/*` packages
  - All packages will now be bumped together to the same version
  - Future changesets will automatically synchronize versions across all packages

  **Migration:**

  - All packages will be synchronized to the same version on the next release
  - The root `package.json` version will be kept in sync with all packages

- Updated dependencies [c1b1111]
  - @happyvertical/utils@0.56.0

## 0.55.7

### Patch Changes

- 240a7ac: Fix column name quoting in DuckDB and JSON adapter UPSERT operations. All column names are now properly quoted in INSERT, ON CONFLICT, and UPDATE SET clauses to match DuckDB's schema generation requirements.

## 0.55.5

### Patch Changes

- dc9c86d: chore: update all dependencies to latest versions

  Updated all dependencies across the monorepo to their latest versions:

  - vite: 5.4.x/6.x/7.1.x → 7.2.2
  - vitest: 2.1.9/3.2.4 → 4.0.8
  - happy-dom: 18.0.1 → 20.0.10 (fixes CVE-2025-61927, CVE-2025-62410)
  - vite-plugin-dts: 3.9.x/4.3.x → 4.5.4
  - @biomejs/biome: 1.9.4/2.3.3 → 2.3.4
  - turbo: 2.3.3/2.5.x → 2.6.0
  - typescript: 5.7.x → 5.9.3
  - And 30+ other dependencies

  Also fixed test and typecheck failures in logger package:

  - Added `vi.clearAllMocks()` to clear mock spy history between tests
  - Added `skipLibCheck: true` to prevent checking problematic node_modules types

  Also skipped browser-based integration tests in spider package when running in CI:

  - CrawleeAdapter tests (Playwright browser automation)
  - TreeScraper tests (browser-based web scraping)
  - Tests pass locally but fail in CI environment

  Closes #387, #396, #397

- Updated dependencies [dc9c86d]
  - @happyvertical/utils@0.55.4

## 0.55.4

### Patch Changes

- 8d8301d: fix(sql): add type casting for arrays and objects in DuckDB/JSON adapters

  Fixes #378 - DuckDB type casting error for array and object fields in UPSERT statements

  DuckDB requires explicit type casting for arrays and plain objects in parameterized queries to prevent "Cannot create values of type ANY" errors. This change adds automatic casting to JSON for these types in both insert and upsert operations.

  **Changes:**

  - Arrays are now cast to JSON with `CAST($N AS JSON)` and serialized with `JSON.stringify()`
  - Plain objects (detected via `Object.getPrototypeOf()`) are cast to JSON and serialized
  - Class instances are not affected - they use direct parameter binding
  - Empty arrays and nested objects are fully supported
  - Changes applied to both DuckDB and JSON adapters

  **Breaking Changes:** None - this is a backward-compatible fix

  **Tests Added:**

  - INSERT operations with empty arrays, string arrays, number arrays, and nested objects
  - UPSERT operations for updating and creating records with arrays/objects
  - Batch insert operations with mixed array/object data
  - JSON file persistence verification
  - Mixed type handling (arrays with multiple types, nested structures)

  This fix enables SMRT framework and other applications to use arrays and objects with the JSON adapter without workaround field types.

## 0.55.3

### Patch Changes

- Updated dependencies [849eb94]
  - @happyvertical/utils@0.55.3

## 0.55.0

### Minor Changes

- 5ef824c: Auto-generated changeset from conventional commits:

  fix: simplify auto-changeset workflow - remove dependency installation
  fix: remove pnpm version from workflow to use packageManager field
  Merge pull request #346 from happyvertical/claude-auto-fix-fix/add-package-tagformat-18985806972
  Merge pull request #345 from happyvertical/claude-auto-fix-fix/add-package-tagformat-18985694712
  fix(deps): update pnpm-lock.yaml to remove semantic-release dependencies
  fix(deps): update pnpm-lock.yaml to remove semantic-release dependencies
  feat: add auto-changeset workflow for automatic version bumps
  fix: replace semantic-release with changesets for predictable versioning

### Patch Changes

- Updated dependencies [5ef824c]
  - @happyvertical/utils@0.55.0
