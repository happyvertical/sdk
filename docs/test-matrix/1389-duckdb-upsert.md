# DuckDB referenced conflict-key upsert (#1389)

Patch repair; the public `upsert()` signature and result shape are unchanged.
DuckDB must preserve conflict-key identity on a conflict update so an existing
foreign-key reference does not turn an otherwise unchanged primary key into a
rejected key mutation.

| Behavior | Trigger and positive case | Negative case | Actor/context and executor | Runtime/external edge | Test level and command |
| --- | --- | --- | --- | --- | --- |
| Referenced parent upsert updates non-key data | Parent with a child is upserted by `id`; non-key fields change and the child remains valid | Base adapter assigns `id` in the update arm and DuckDB rejects the referenced key mutation | Public DuckDB database and transaction handle; one in-memory engine | DuckDB foreign-key enforcement and `ON CONFLICT` semantics | Adapter regression; `pnpm --filter @happyvertical/sql test:duckdb` |
| Key-only and nullable conflict upserts preserve identity | Key-only primary-key conflict completes without assignment; nullable conflict behavior still updates its non-conflict data | Missing conflict columns still reject; `nullsDistinct` retains native distinct-null inserts | Public DuckDB database; transaction boundary is exercised by the referenced-parent regression | DuckDB nullable unique constraints; no external provider | Adapter regression; same command |
| Referential integrity remains enforced | Existing parent/child relationship remains valid after upsert | Orphan child insert fails | Public DuckDB database | DuckDB foreign-key enforcement | Adapter regression; same command |

Base regression: the parent/child case fails on `origin/main` with DuckDB's
referenced-key constraint error and passes on the repaired head. Full command
output is retained under `/private/tmp/smrt-track-b-evidence/sdk1389-*`.
