# Identifier quoting: design and audit (#1513)

Risk: high — identifiers cross the SQL trust boundary on every CRUD hot path;
PostgreSQL's established unquoted case folding must survive quoting.

All production TypeScript files under `src/` were fully read before editing,
including all six adapter implementations (`sqlite`, `sqlite-native`, `postgres`,
`pglite`, `duckdb`, `json`), `secure-sqlite-client`, every shared helper,
`aggregate`, `aggregate-expression`, `schema-manager`, `doctor`, both entries,
Postgres CLI, backup modules and context CLI. Package README, AGENT, metadata,
package manifest, root AGENTS and project policy were read as well.

## Behavior-to-test matrix

All cases use the caller's database handle; transaction cases use only the
provided transaction handle. Actor is a normal library caller, with hostile
identifier input where noted. No auth/tenancy policy changes (N/A). External
errors retain existing adapter handling; no retry policy change (N/A).

| Invariant | Trigger / positive case | Negative case | Dialects/context | Test level / command |
| --- | --- | --- | --- | --- |
| CRUD quotes every column | Keyword columns in single/batch insert, conflict target, SET, get/list/count/delete/getOrInsert | Malformed/empty/NUL/non-string identifiers rejected | SQLite, native SQLite, PGlite, DuckDB, JSON; PostgreSQL opt-in | New `identifier-quoting.spec.ts`, package Vitest |
| WHERE preserves syntax/bindings | Every suffix, NULL, IN arrays, compound groups, qualified fields, raw expressions | Empty IN; unmarked expression/injection rejected | Every adapter above | Same shared integration spec |
| PostgreSQL legacy folding | Unquoted camelCase DDL and bare camelCase helper inputs address lowercase physical columns | Explicit quoted mixed case never folds | PGlite and optional real PostgreSQL | Same spec |
| Exact physical names | Explicit delimited CRUD/WHERE keys; permissive existing Duck/JSON upserts | Unclosed quotes/trailing SQL rejected | Every dialect; JSON reload/writeback | Same spec |
| Aggregate identifiers | Select, function argument, aliases, group, having, order, bucket, join/expression columns | Unsafe identifiers/directions rejected | Every dialect | Same spec + builder unit cases |
| Transactions retain affinity | Keyword mutations visible inside tx and absent after rollback | Callback failure rolls back | Every adapter | Same spec |
| Public SQL compatibility | Default ordinary identifiers retain exact SQL; keyword/delimited inputs quote; opt-in quotes all | Raw SQL remains authored SQL | All builder dialects | New unit cases + untouched legacy specs |
| DDL identifiers | ALTER column/index/FK; manifest structured names | Invalid identifier rejects | Known dialect ALTER; unknown-dialect manifest compatibility | New integration cases |
| JSON physical keys survive | Catalog/export/load keys with spaces, hyphens, quotes, digit prefix and literal dots | No key renaming or dropped values on reload | JSON immediate/manual persistence | New integration case |

Run focused tests from package root using `pnpm exec vitest --config
../../vitest.package.config.ts run src/identifier-quoting.spec.ts`.
Real PostgreSQL is opt-in with `SDK_TEST_POSTGRES_QUOTING_URL` pointing at an
already running disposable database, or the existing `TEST_DB_ADAPTER=postgres`
gate and configured `HAVE_SQL_URL`; it is not silently counted as executed.
Coordinator owns full SQL before/after, root gates and independent review.

## Compatibility decisions

Adapters always quote CRUD/WHERE column identifiers. Bare PostgreSQL components
fold to lowercase; explicit SQL-delimited components preserve exact spelling.
Record keys are single column identifiers, never qualified paths. DuckDB/JSON's
existing permissive upsert keys are literal physical names (including `foo.bar`).
WHERE/aggregate paths split dots outside delimiters; `"foo.bar"` is one column.

Public `buildWhere`, `buildAggregate` and `bucketExpr` retain byte-for-byte SQL
for ordinary identifiers by default, while quoting keywords and explicit names.
Pass `{ quoteIdentifiers: true }` as the fourth argument for quote-all output.
There is no adapter aggregate/orderBy/record-exists method; aggregate ORDER BY
is exercised by executing the public builder. `tableExists` covers existence.
This public-default exception is deliberate to keep existing exact-SQL tests
and callers compatible. Standalone `renderExpression` keeps its existing exact
physical-name contract.

The schema manager has no reliable dialect tag. Its default preserves bare
ordinary identifiers, quoting keywords and explicit names without changing case.
Known-dialect ALTER builders quote all columns and retain PostgreSQL folding.

## Identifier-to-SQL audit

| File / sink | Disposition |
| --- | --- |
| sqlite.ts: single/batch insert, standard upsert columns/conflict/excluded/SET, NULL-aware update predicate/insert, update SET | Shared SQLite quoting |
| sqlite-native.ts: same CRUD builders, numbered bind translation | Shared SQLite quoting; translation skips identifier/literal/comment text (including physical `cell$1`) |
| shared/postgres-dialect.ts: insert, upsert/native+NULL fallback, update SET | Owning PostgreSQL quoting helper, legacy folding |
| duckdb.ts / json.ts: insert/update, regular upsert/conflict/SET, NULL-aware upsert | Shared DuckDB quoting; upsert physical keys stay literal |
| shared/utils.ts: every WHERE field, contains, NULL, IN, Date, comparisons, compounds | Shared dialect renderer; explicit adapter quote-all policy |
| aggregate.ts: from, joins/aliases, select columns/aliases, group, having, order, bucket | Shared renderer; public compatibility policy or opt-in quote-all |
| aggregate-expression.ts: structured col nodes | Aggregate context renderer; standalone exact physical identifier quoting |
| shared/alter-utils.ts: ADD column, REFERENCES table/column, CREATE INDEX names/table/columns | Known-dialect shared quoting; syntax/type/check/default/index WHERE are trusted SQL contracts |
| schema-manager.ts: DROP/CREATE table, columns/FK/index/trigger names | Shared default compatibility renderer; column type/default/check, FK actions, trigger when/event/condition/body and index WHERE remain trusted SQL syntax |
| JSON loader/catalog/STI/export: table/column projections, casts, aliases, INSERT columns | Shared literal DuckDB quoting; catalog names are escaped too |
| shared/duckdb-schema-utils.ts: inline UNIQUE columns | Escaped literal names parsed from trusted DDL; original index/DDL expressions remain caller SQL |
| sqlite-native.ts: vector DDL/PRAGMA identifiers | Validated shared literal SQLite quoting; vector functions use bound names |
| shared/postgres-dialect.ts: vector DDL/index/update/search identifiers | Existing exact physical-name semantics retained via shared literal quoting; generated index names validated; raw vector WHERE is explicitly caller SQL |
| doctor.ts: unique/relationship columns/tables | Existing exact physical-name contract through shared quoting |
| Adapter table names in CRUD/metadata probes/export | Legacy CRUD table positions remain bare after strict table-name validation (table keyword support is not this column fix); JSON CRUD and known-dialect ALTER quote tables. Metadata catalog predicates bind names or escape restricted literals; Duck/JSON tableExists probes retain validated bare targets |
| Metadata tableExists/getTableSchema | Names bound as catalog values, not column identifiers; PRAGMA target names quoted |
| Schema DDL sync/provided schema/index/trigger scripts | Caller-authored SQL, not identifier input; preserved unchanged except existing dialect transformations |
| Raw query/tagged templates/client seam | SQL text is caller-authored; interpolation values bound; no identifier reinterpretation |
| Generated savepoints and fixed catalog/system names | Adapter-owned fixed/generated syntax, not caller identifiers |
| Connection/resource/cache/lock/redaction/types/query delegation/index/backup/CLI modules | No additional identifier-to-SQL sinks; Postgres CLI passes argument arrays, not SQL |

SDK consumer audit: `packages/jobs/src/adapters/{postgres,sqlite}.ts` and
`packages/secrets/src/adapters/database.ts` call CRUD with ordinary snake_case
keys. `packages/secrets/src/adapters/custody-database.ts` uses static raw SQL and
bound ledger values. Other source SQL references are type-only/docs. No external
consumer calls to `buildWhere`, `buildAggregate` or `validateColumnName` found.
No consumer edits required. Search artifacts are `/tmp/sdk-1513-*-audit.log`.

## Validation evidence

Coordinator baseline: untouched `7ac47212`, 1159 passing + 47 externally pending
cases (1206 total), 44 passed files + one skipped, 64.47s Vitest.
Worker focused command output and final outcomes are recorded under
`/tmp/sdk-1513-*`; final validation is appended after execution.

Worker evidence (before coordinator integration):
- Baseline regression: isolated original `7ac47212` production source with the
  new shared keyword CRUD test fails on SQLite, native SQLite, PGlite, DuckDB
  and JSON at insert; `/tmp/sdk-1513-base-regression.log`. The new spec copy
  excludes only its new-helper unit section so it can import the old exports.
- New suite: 54 pass / 11 explicitly skipped real-PostgreSQL cases (65 total),
  `/tmp/sdk-1513-new-tests-final.log`. The in-process PGlite folding test executes.
- Focused 12-file legacy/new run: 472 pass / 15 pending (487 total),
  `/tmp/sdk-1513-focused-final.log`; 11 pending are the new real-PG gate and
  four are unchanged pre-existing external cases.
- SQL package typecheck and build pass; `/tmp/sdk-1513-typecheck-final.log` and
  `/tmp/sdk-1513-build-final.log`. Existing build dynamic-import warnings remain.
- Final focused formatting/lint and exact HEAD verification are coordinator
  evidence; no old test file was edited.

Keyword provenance: static union of the official SQLite 147-keyword list at
https://www.sqlite.org/lang_keywords.html, reserved `pg_get_keywords()` entries
queried from pinned PGlite 0.5.8, and reserved `duckdb_keywords()` entries queried
from pinned DuckDB 1.4.3. Raw query output is `/tmp/sdk-1513-keywords.log`.
The helpers remain browser-safe and make no metadata queries at runtime.

Latest focused additions: `/tmp/sdk-1513-native-final.log` has 64 passing cases
plus 11 opt-in PostgreSQL skips, covering the shared suite and untouched native
capability suite. `/tmp/sdk-1513-final-narrow.log` has 79 pass / 11 opt-in PG
skips across new integration, error wrapping and both browser import gates.
Focused Biome reports no errors; four warnings already exist in untouched
lines (catalog snake_case type fields and two unused variables).

## Exact fully read production-file inventory

- `src/aggregate-expression.ts`
- `src/aggregate.ts`
- `src/backup/index.ts`
- `src/backup/manifest.ts`
- `src/cli/claude-context.ts`
- `src/doctor.ts`
- `src/duckdb.ts`
- `src/index.ts`
- `src/json.ts`
- `src/pglite.ts`
- `src/postgres-cli.ts`
- `src/postgres.ts`
- `src/query.ts`
- `src/schema-manager.ts`
- `src/secure-sqlite-client.ts`
- `src/shared/alter-utils.ts`
- `src/shared/connection-cache.ts`
- `src/shared/duckdb-resources.ts`
- `src/shared/duckdb-schema-utils.ts`
- `src/shared/duckdb-statement-queue.ts`
- `src/shared/postgres-dialect.ts`
- `src/shared/redact-database-url.ts`
- `src/shared/sqlite-connection-cache.ts`
- `src/shared/transaction-lock.ts`
- `src/shared/types.ts`
- `src/shared/utils.ts`
- `src/sqlite-native.ts`
- `src/sqlite.ts`

## Final lexer and binding evidence

The existing PostgreSQL question-mark scanner was factored into
`shared/utils.ts:rewriteSqlParameters`, reused by PostgreSQL numbered-bind
inspection/question-mark rewriting and native SQLite numbered-bind rewriting.
The existing browser import graph remains unchanged. PostgreSQL bracket array
subscripts remain executable; SQLite brackets/backticks are identifiers.
PostgreSQL nested comments and dollar quotes are preserved; SQLite block
comments end at the first close. Existing PG JSON `?|`/`?&` choices are retained.
Remote SQLite's existing token scanner and secure SQLite's named-slot allocator
already preserve quoted identifier text; DuckDB/JSON bind through the engine.

`/tmp/sdk-1513-lexer-final.log`: six files, 117 pass / 12 explicit real-PG
pending (129 cases); includes six new lexer cases and the final shared suite
(59 pass / 12 PG pending). Physical `cell$1` and `cell?`, doubled delimiters,
raw literal/comment parameter-looking text and real parameters are covered.
`TEST_DB_ADAPTER=postgres` or `SDK_TEST_POSTGRES_QUOTING_URL` enables the 12
real-PostgreSQL cases; package `test:postgres` includes the new shared suite.
Expected full-suite delta from the coordinator baseline: 65 new passing cases
and 12 new external skips, for 1224 pass / 59 pending (1283 total), assuming no
other changes. Older focused totals above record earlier checkpoints.

Final shared-only confirmation: `/tmp/sdk-1513-shared-final.log`, 65 pass / 12
explicit real-PG pending (77 cases), 1.59s. Latest package typecheck/build pass
and focused Biome has no errors, with only the four pre-existing warnings.
