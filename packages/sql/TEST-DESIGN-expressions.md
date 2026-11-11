# SQL expressions #1511 test design

Standard risk: additive closed expression API; legacy aggregate SQL and tests remain unchanged.
Actor: SDK caller rendering persisted JSON expressions. Executor: one isolated in-process SQLite, PGlite or DuckDB connection per dialect; no external services or transactions required for pure SELECTs. DDL tests create and populate disposable tables on that same executor.

| Behavior/invariant | Reachable trigger and positive case | Negative/failure case | Runtime/dialect | Contract edge | Test level / command |
| --- | --- | --- | --- | --- | --- |
| Every new conditional, numeric, text and date node | renderExpression query and DDL, same inputs and expected results | NULL, division/mod zero, false/NULL conditions, negative and half rounding, calendar boundaries | SQLite, PGlite, DuckDB on Node | JSON round trip, native SQL semantics | integration: `pnpm --filter @happyvertical/sql test src/expression.spec.ts` |
| Generated safety | actual generated columns and expression indexes for every immutable new node | unknown temporal column type / legacy Date rejected with coded error; DuckDB generated-column indexes unsupported | all three | database immutability rules; DuckDB limitation explicitly asserted | same integration command |
| Safe SQL | quoted hostile identifiers, bound query strings, escaped DDL strings | malformed ISO/calendar dates, operators, arity, nonfinite literals, bounds | all three / pure renderer | untrusted JSON | same command |
| Bounded rendering | nested scalar min/max and argument expansion | depth/node/output limits reject before exponential allocation | pure renderer | hostile recursive data | same command |
| Compatibility | existing aggregate nodes use same renderer with original context policy | existing tests unchanged | all three | exact existing SQL/value ordering | `pnpm --filter @happyvertical/sql test src/aggregate.spec.ts src/aggregate-expression.spec.ts` |
| Browser exports and public types | root/query export parity, browser bundle | Node-only import leakage | browser build / Node typecheck | public module graph | package build/typecheck and browser query tests |

## Evidence (2026-11-11, Node 24.22.1 / pnpm 11.25.0)

- Focused expression, unchanged aggregate and browser export suites: 315 passed / 4 files, 3.87s (`/tmp/sdk-1511-focused.log`). Every expression example executes query and DDL-literal SELECTs on all three engines; non-NULL examples additionally create and populate actual generated columns and SQLite/PostgreSQL expression indexes. Hostile identifiers also execute in generated table DDL.
- Added regressions cover PostgreSQL non-UTC TimeZone / non-ISO DateStyle and standard_conforming_strings=off, nested year(addDays), typed-date secondsBetween, large finite floor/ceil, and bounded cyclic type analysis / SQL guard expansion.
- DuckDB generated-column index rejection is asserted for every generated example. No tests are skipped. ASCII case conversion is deliberately portable; Unicode case mapping is not claimed. Substring accepts positive starts and nonnegative lengths; dynamic invalid integers yield NULL.
- SQLite libsql registers floor/ceil/power extensions without the deterministic flag (direct DDL probe, `/tmp/sdk-1511-probe.log`); production lowering uses core arithmetic and constant powers instead. PostgreSQL generated constant REPLACE chains fail collation folding even with explicit C collation (direct PGlite probe, `/tmp/sdk-1511-probe-pg.log`); ASCII TRANSLATE supplies the identical immutable mapping there.
- Package typecheck, build, focused Biome and agent:check pass. Agent sync changes were inspected: SQL description metadata and its generated AGENT/manifest entries only. Existing test files, lockfile, dependency versions and aggregate builder file remain unchanged.
- Foreman owns integrated SQL-suite/root-gate validation and the single review cycle; no external PostgreSQL services or containers were used here.
