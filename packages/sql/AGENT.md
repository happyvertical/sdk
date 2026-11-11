# @happyvertical/sql

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Database interface and portable expressions for SQLite, PostgreSQL, and DuckDB

## Package Map
- Package: `@happyvertical/sql`
- Hierarchy path: `@happyvertical/sdk > packages > sql`
- Workspace position: `30 of 34` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/jobs`, `@happyvertical/secrets`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/sql build
pnpm --filter @happyvertical/sql test
pnpm --filter @happyvertical/sql typecheck
pnpm --filter @happyvertical/sql clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/sql build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/sql clean` followed by `pnpm --filter @happyvertical/sql build` and `pnpm --filter @happyvertical/sql test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Database interface and portable expressions for SQLite, PostgreSQL, and DuckDB
- Implements: none
- Requires: @happyvertical/utils, @duckdb/node-api, @electric-sql/pglite, @libsql/client, @russellthehippo/honker-node, @sqliteai/sqlite-vector, pg, sqlite-vss
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->


## Portable scalar expressions

Import `renderExpression` and `ExpressionError` from `@happyvertical/sql` or the
browser-safe `@happyvertical/sql/query`. Render with
`renderExpression(node, { dialect, mode: 'ddl' | 'query', resolveColumn })`;
the result contains `sql`, ordered `values`, `resultType`, and per-dialect
`immutable` flags. Query mode binds string/date values; DDL mode safely inlines
literals and requires immutability on every supported dialect. The aggregate
builder uses the same renderer while preserving its existing SQL policy.

Persist dates as `{ value: { kind: 'date' | 'datetime', iso } }`. Datetimes need
an explicit ISO UTC offset and are canonicalized to UTC before timezone-free
SQL casts. For generated temporal expressions, resolve columns to
`{ name, type: 'date' | 'datetime' }` only when their schema uses native DATE or
TIMESTAMP WITHOUT TIME ZONE with UTC wall-clock fields (ISO text on SQLite).
Unknown or timezone-aware temporal inputs, legacy JavaScript Date literals,
and session-dependent casts fail generated use with
`ExpressionError.code === 'NON_IMMUTABLE'`.

See [README: portable scalar expressions](README.md#portable-scalar-expressions-and-generated-columns)
for the new conditional, numeric, text and date node shapes, NULL behavior,
argument bounds, ASCII case-conversion contract and DuckDB index limitations.

## Column identifier quoting

CRUD helpers quote columns on every adapter. PostgreSQL/PGlite bare names keep
legacy folding (`camelCase` addresses `camelcase`); explicitly quoted names
such as `'"MixedCase"'` and `'"Full Name"'` preserve physical spelling. WHERE
and aggregate identifiers support qualified parts (`alias.order`), with dots
inside delimiters treated literally (`'"foo.bar"'`).

Public `buildWhere`, `buildAggregate` and `bucketExpr` preserve ordinary SQL
text by default, quoting keywords and explicit names. Pass
`{ quoteIdentifiers: true }` as the fourth argument for quote-all output;
adapter CRUD uses that policy automatically. `raw()` remains caller-authored
WHERE SQL. Standalone `renderExpression` retains exact physical-name semantics.

DuckDB/JSON `upsert` record/conflict keys retain their existing literal physical
name contract: spaces, dots, hyphens and quote characters are data, including
outer quote characters. Strict insert/update and WHERE keys use explicit SQL
delimiters for these names. See README and `TEST-DESIGN-identifiers.md` for the
compatibility exceptions, dialect matrix and complete identifier sink audit.
