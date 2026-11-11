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
| Legacy index terms | Expression strings (`lower(email)`) and ordered terms (`created_at DESC`) remain exact caller SQL; simple qualified/quoted names quote | Fallback applies only to previously raw index.columns sinks, never CRUD/WHERE | SQLite/PGlite/DuckDB ALTER + schema manager | New compatibility spec and isolated base/reviewed/fixed probes |
| Numeric aggregate names stay names | Quote-all SELECT aliases, FROM/JOIN numeric table names and selected-alias ORDER use name rendering | Numeric operand/ordinal and explicit numeric-column semantics remain separate | SQLite/PGlite/DuckDB | Archived eac/7b/fixed probe + new integration case per engine |
| Legacy aggregate numeric terms | Previously accepted `.5`, `1.`, decimal/exponent/hex literals and ordinal group/order terms retain meaning | Numeric fallback bounded to old character grammar; expressions remain structured or raw where documented | SQLite/PGlite/DuckDB | New compatibility spec and base/reviewed probes |
| Composite FK column strings | Commas outside quotes delimit plain identifier components; quoted commas stay literal | Expressions rejected; no raw FK fallback | Manifest SQLite/PGlite/DuckDB | New compatibility runtime tests |
| Legacy aggregate ORDER BY | First identifier plus direction retained; later tokens ignored (`total DESC NULLS LAST` -> `total DESC`) | Quoted/spaced identifiers still parse and quote | SQLite/PGlite/DuckDB runtime + exact builder output | Same compatibility spec |
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


## Accepted review corrections: SQLite missing columns and PostgreSQL dollar tags

The original base `7ac47212` rejects missing-column WHERE predicates. A temporary
base/head probe showed the first implementation still rejects them on libsql,
but secure-file `node:sqlite` accepts double-quoted unknown names as strings:
`missing != 'x'` and `missing IS NOT NULL` selected and deleted both protected
rows; `missing IS NULL` silently returned no rows. SQLite identifier emission
now uses backticks (embedded backticks doubled), including public builders and
native literal identifier positions. PostgreSQL/DuckDB retain double quotes.
Explicit input syntax remains double-quoted; authored raw SQL DQS stays intact.

`sqlite-identifier-fail-closed.spec.ts` covers libsql, native and secure-file
paths in process. Missing-column get/list/count/update/delete fail for inequality,
IS NULL and IS NOT NULL without changing either protected row. Transaction tests
verify preceding writes roll back after such a failure. Physical closing bracket
and embedded backtick names round trip through CRUD, public quote-all WHERE and
aggregate builders. A secure-file raw SQL test proves DQS remains unchanged.

A second base/head probe revealed that compact `$tag$hello$tag$` before a single
`$1::text[]` parameter caused the first implementation to flatten its array:
base returned `['a','b']`, head raised PostgreSQL 08P01 (two binds for one slot).
The shared scanner now excludes `$` from tag contents, matching PostgreSQL's
tag grammar. New shared lexer and PGlite integration cases pin compact tags,
array binding, dollar/question text inside tagged bodies and comments.

Probe evidence outside the repository:
`/tmp/sdk-1513-dqs-probe-results.log`,
`/tmp/sdk-1513-dollar-array-probe-results.log`.


## Accepted compatibility recall: index SQL terms and aggregate ORDER BY

Before this recall's source changes, the required compatibility policy is:
`index.columns` in shared ALTER generation and schema-manager index creation
keeps its existing caller-authored SQL term contract. Plain identifiers (including
qualified and explicitly quoted components) receive identifier quoting; expression
or ordered terms pass through byte-for-byte. This fallback belongs only to those
two formerly raw sinks and does not weaken strict CRUD or WHERE inputs.

Aggregate ORDER BY retains its former first-column/second-direction contract:
trailing tokens such as `NULLS LAST` are ignored. Parsing must additionally retain
the new explicit quoted/spaced identifier support. The recall adds base/reviewed/
fixed probes, expression/ordered/keyword indexes through both reachable builders,
and exact SQL/runtime tests. A complete original-to-reviewed string-through audit
is recorded with the final evidence below.

The sweep also reproduced numeric aggregate terms (`.5`, `1.`) and composite
manifest FK column strings (`a, b`) that ran on the original source but were
rejected after quoting. Numeric handling remains limited to SQL numeric tokens
accepted by the original `[a-zA-Z0-9_.]+` grammar, never general expressions.
Composite FK strings are parsed as comma-separated identifiers outside quotes,
then each name is rendered through the existing compatibility policy.

Baseline distinction: direct shared index SQL generation and schema manager
accepted expression/ordered terms; adapter `alterTable.addIndex` additionally
validated every term as a plain name and rejected those same inputs on both
base and reviewed revisions. The user explicitly requires every adapter path
now, so this recall also removes that index-only pre-validation. Table and index
name validation and all strict CRUD/WHERE validation remain in force. JSON has
no `alterTable` method; its schema manager uses the same term renderer.

The numeric WHERE probe also confirmed original constant predicates (`1`, `.5`,
`1.`, `1e3`) returned both rows on all three engines, while reviewed adapter
quote-all either quoted them as missing columns or rejected them. The same
bounded original numeric-token exception applies in WHERE, never a general
SQL-expression fallback. Explicit `"1"` continues to address a physical column.
Numeric lexemes stay within the old alphanumeric/underscore/dot character set;
signs, operators, whitespace, quotes and SQL comments cannot enter this channel.


### Complete original-to-reviewed string-through sweep

| Original string sink | Original contract / evidence | Recall disposition |
| --- | --- | --- |
| Shared CREATE INDEX `columns` | Raw `join(', ')`; expression/ordered terms run on all three engines (`base-reviewed-v4.jsonl`) | Restored exact term input; bounded plain identifier classifier quotes names |
| Manifest CREATE INDEX `columns` | Same raw term contract; same three-engine evidence | Same renderer; index WHERE remains unchanged authored SQL |
| Adapter `alterTable.addIndex` | Existing plain-name validation rejects expressions on both original/reviewed | User-required extension removes only index-term pre-validation on SQLite/native, PostgreSQL/PGlite, DuckDB; JSON has no such method |
| Aggregate ORDER list | First whitespace token + second direction; remaining tokens ignored | Restored legacy outcome; double-quoted components now also permit spaces; new integration tests cover strings and arrays |
| Aggregate SELECT list / aliases / function arguments | Old alphanumeric/underscore/dot validator, structured expression nodes; no generic raw SELECT list | Ordinary SQL/runtime identical in three-engine probes; numeric `.5`/`1.` restored, exact quoted names remain additive; function-name validation unchanged |
| Aggregate GROUP list / ordinals / bucket / expression columns | Same bounded old validator; group/order ordinals were SQL tokens | Numeric literal/ordinal rendering restored including structured expression `.5`; ordinary group lists runtime/SQL identical; bucket uses same renderer |
| Aggregate FROM / JOIN table/alias / ON | Table/columns old validator; join aliases restricted; ON is a structured node, not free SQL | Ordinary qualified self-join SQL and rows identical all three engines; same alias/scope validation preserved |
| WHERE fields and HAVING fallback | Old bounded character grammar plus explicit `raw()` keys | Numeric constants newly rejected/quoted by adapter paths are restored via numeric-token-only exception; raw expressions/binds remain unchanged; general unmarked expressions still reject |
| Manifest FK local/reference column strings | Raw strings permit composite `a, b`; all three engines accepted matching row under actual inline parent UNIQUE | Restored bounded comma-separated identifier lists; preserve spacing and commas inside quoted names; reject expressions |
| ADD COLUMN REFERENCES / column properties | Reference name string; type/check/default/actions authored syntax | Reference column lists use bounded list renderer; type/check/default/actions unchanged. A composite reference for one local column is engine-invalid both revisions |
| CRUD data/conflict/SET column lists | Plain column validation on SQLite/native/PostgreSQL; plain insert/update on Duck/JSON; Duck/JSON upsert already quoted literal physical keys | Ordinary conflict-upsert rows identical all three engines; accepted quoting/folding policy preserves physical names; no expression fallback. Existing new suite pins permissive Duck/JSON literal keys and null-conflict paths |
| DuckDB inline UNIQUE conversion | Parser extracts physical column names and already double-quotes each | Original/fixed transformed DDL byte-identical for ordinary/spaced columns (`helper-parity.jsonl`); doubled embedded quotes repair previously broken names; raw index script parsing unchanged |
| PostgreSQL vector DDL/index/update/search | Existing validated exact physical names; search WHERE explicitly authored SQL | Four operations' SQL/binds byte-identical on original/fixed capture, including mixedCase names and raw WHERE with params (`helper-parity.jsonl`); no numeric/expression fallback |
| Native SQLite vector identifiers | Validated literal physical names, existing raw WHERE channel | Shared backtick quoting from earlier accepted DQS correction; physical spelling unchanged. Existing native capability suite runs; authored raw WHERE/parameters unchanged |
| Doctor unique / relationship names | Already literal physical identifier quoting | SQL byte-identical for literal dotted, spaced and embedded-quote names (`helper-parity.jsonl`); no expression interpretation |
| Schema table/column/index/trigger names | Single name positions; schema manager ordinary output remains bare | Ordinary case/spelling retained, explicit/keyword names quote; trusted schema type/default/check, trigger body/condition and FK actions unchanged. This is not a raw-expression list contract |
| JSON catalog/load/STI/export physical columns | Physical catalog/record keys (some paths already quoted, other bare positions could fail on unusual names) | Literal physical name escaping; persistence/reload tests pin dots, spaces, hyphens, digit prefixes, embedded/outer quotes without renaming |
| Adapter syncSchema / DDL scripts / raw queries and template SQL | Caller-authored SQL; existing dialect/schema transformations | No identifier reinterpretation; raw SQL DQS and bindings retained by earlier regression tests |
| Placeholder scanner and generated/system syntax | Named/numbered binds, fixed/generated names | Earlier accepted compact dollar-tag/array fix and SQLite DQS regression tests retained; no scanner change in this recall |

Numeric compatibility is limited to original-character-set numeric tokens:
integer/decimal forms (including leading/trailing dots), unsigned exponents,
hex/binary/octal notation and numeric separators where the engine accepts them.
No sign, SQL operator, whitespace, comment or quote can enter that channel.
Engine-invalid original inputs are not expanded: for example DuckDB `0x10`,
PostgreSQL non-integer constants directly in GROUP BY, and malformed `a..b`
still fail. No blanket raw fallback was introduced outside the two index sinks.

Evidence directory `/tmp/sdk-1513-compatibility` contains immutable base/reviewed
source diff, exact base/reviewed runtime probes (`base-reviewed-v4.jsonl`),
fixed runtime probes (`fixed-v4.jsonl`) and byte-equality vector/doctor/UNIQUE
captures (`helper-parity.jsonl`). The reviewed source is archived from exact
`eac71705` so later working-source probes cannot relabel it accidentally.


Before the final recall source update, a further exact-base/archive-reviewed
probe confirmed SQLite manifest backtick, bracket and single-quoted column names
containing commas created a real composite FK and matching row on base, while
reviewed rejected each name. Restore those identifier delimiter styles only in
DDL/schema name contexts, decoding doubled delimiters then using the existing
identifier renderer. FK comma splitting recognizes these delimiters too. Strict
CRUD/WHERE inputs do not gain alternate quote styles or a raw expression path.


Final delimiter evidence: `schema-quotes-base-reviewed.jsonl` and
`schema-quotes-fixed.jsonl` show original/fixed physical rows equal for SQLite
backtick, bracket and single-quoted names containing commas; reviewed rejects.
The new 24-case compatibility spec also exercises doubled backticks/apostrophes,
FK enforcement and malformed delimiters without a schema raw-expression fallback.
DDL helpers and schema-manager name positions share bounded normalization; no
strict CRUD/WHERE quote-style expansion occurs.

Evidence correction: v1–v3 probe logs remain historical and are superseded for
shared index helper conclusions because their reviewed helper import incorrectly
pointed to the live worktree. Authoritative `base-reviewed-v4.jsonl` routes both
API and helper to exact archived `eac71705`; `source-integrity.log` asserts byte
identity to git for original/reviewed entries, schema manager and shared helper.
`probe-summary.md` interprets nonempty manifest errors as rejection even when the
outer probe completed. Original and reviewed adapter index pre-validation reject
expression terms; shared helper and manifest base-pass/reviewed-reject is now
pinned correctly. Fixed results are in `fixed-v4.jsonl`.


Recall final narrow gates: 24 new compatibility cases pass without skips;
14-file focused run passes 478 cases with 16 expected pending (494 total).
Package typecheck/build, focused ten-file Biome and agent sync/check pass.
Biome reports only the pre-existing unused `columns` variable in schema-manager;
build retains its two existing dynamic import warnings. Exact commands and
outcomes: `/tmp/sdk-1513-compatibility/commands.log`. Coordinator owns full filtered
SQL/root validation and targeted review recall after the correction commit.


## Same-commit round-5 correction: numeric operands versus names

Before source mutation, exact archived `eac71705` and `7b18413f` probes showed
quote-all `as: '1'`, numeric FROM `123` and JOIN `124` work as quoted names in eac
but became raw numeric tokens and SQL syntax errors in 7b on all three engines.
Restrict numeric passthrough to expression/ordinal positions. SELECT aliases,
FROM/JOIN table/alias names and ORDER items matching selected aliases use the
ordinary identifier renderer; numeric expressions, unaliased ORDER/GROUP ordinals,
WHERE constants and explicitly quoted numeric physical columns retain their
contracts. No new raw fallback is added. Evidence is separate from immutable v4:
`/tmp/sdk-1513-compatibility-round6/eac-7b-archived.jsonl`.


Round-5 correction outcome: a separate name renderer keeps all 12 fixed probe
SQL strings byte-identical to archived eac and their rows equal. The added three
engine cases also distinguish ORDER BY a selected numeric alias from an ordinal,
pin both bare `1` and explicitly quoted `"1"` aliases, numeric FROM/JOIN tables,
and explicit numeric physical columns. Numeric operands and WHERE restoration
remain covered by the same suite. Compatibility spec now has 27 passing cases;
four-file focused run has 149 pass / 12 opt-in PG pending (161 total). Package
build/typecheck, two-file Biome and agent checks pass. Exact commands and archive
integrity/parity assertions: `/tmp/sdk-1513-compatibility-round6/commands.log` and
`source-integrity-and-parity.log`. Prior v4 and round-5 artifacts are immutable.
