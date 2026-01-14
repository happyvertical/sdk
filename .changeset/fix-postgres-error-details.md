---
"@happyvertical/sql": patch
---

fix(sql): preserve PostgreSQL error details in CRUD operations

PostgreSQL errors include additional properties (code, detail, hint, severity) that provide crucial debugging information. Previously, only the error message was captured, losing these details.

This change:
- Adds a `formatPgError()` helper function to consistently extract all PG error details
- Updates all CRUD operations (insert, update, upsert, delete, get, list, count) to use this helper
- Ensures error messages include code (e.g., 23505 for unique violation), detail, hint, and severity

