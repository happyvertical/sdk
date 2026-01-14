---
"@happyvertical/sql": patch
---

fix(sql): preserve database error details across all adapters

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
