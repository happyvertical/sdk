---
"@happyvertical/sql": patch
---

Fix column name quoting in DuckDB and JSON adapter UPSERT operations. All column names are now properly quoted in INSERT, ON CONFLICT, and UPDATE SET clauses to match DuckDB's schema generation requirements.
