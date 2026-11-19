---
"@happyvertical/sql": minor
---

`getTableSchema` now reports `generated` and `hidden` for every column and includes generated columns on SQLite (via `table_xinfo`), PostgreSQL, PGlite and DuckDB. It is also available on transaction handles on PostgreSQL, PGlite, SQLite and DuckDB, and `tableExists` / `getTableSchema` accept a `schema.table` name on PostgreSQL and PGlite. Existing column fields are unchanged.
