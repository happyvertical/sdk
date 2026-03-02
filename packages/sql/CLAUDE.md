# @happyvertical/sql

Database interface. Factory: `getDatabase(options): Promise<DatabaseInterface>`.

## Adapters

sqlite (LibSQL), postgres (pg), duckdb, json (DuckDB-backed JSON files). All in `src/`.

## Key patterns

- Vector search: PostgreSQL via pgvector (`db.vector.*`), SQLite via sqlite-vss
- Schema sync: legacy regex-based `syncSchema()` and modern `DatabaseSchemaManager` with JSON manifest
- JSON adapter: `autoRegister: true` loads JSON files as DuckDB tables; `writeStrategy` controls sync

## Gotchas

- Parameter placeholders differ: SQLite `?`, PostgreSQL `$1, $2...` — template literal methods auto-convert but raw `query()` does not
- `:memory:` databases share via `globalThis.__haveSqlMemoryConnectionCache` — must use same `dbid` for parent/child sharing
- DuckDB ON CONFLICT needs inline constraints — `convertUniqueIndexesToInlineConstraints()` transforms DDL silently
