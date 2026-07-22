---
'@happyvertical/sql': patch
---

Restore CI coverage for the PostgreSQL pgvector adapter and fix three vector specs that bound the table name as a parameter.

`postgres-vector.spec.ts` early-returns every test when the `vector` extension is unavailable, so it reported green without asserting anything. The service-container Postgres job ran `postgres:18-alpine` (no pgvector), so the adapter had no real CI coverage; it now runs a digest-pinned `pgvector/pgvector:pg17` image so the suite executes.

With the suite running, three `upsertVector` verification queries failed: they built `SELECT ... FROM "${testTable}"` through the `single` tagged template, which parameterizes the table name (`FROM "$1"`) so Postgres rejects it. They now build the SQL as a plain string via `db.query(...)`, matching the passing queries in the same file.
