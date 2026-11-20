---
'@happyvertical/sql': patch
---

Render untyped NULL and bound-parameter operands of `secondsBetween` (PostgreSQL, DuckDB) and `add`/`sub`/`mul` (PostgreSQL) with an explicit cast so they return NULL instead of failing with an ambiguous-operator error.
