---
"@happyvertical/sql": patch
---

fix(sql): preserve numeric types in JSON adapter export

The JSON adapter's `exportTableToJSON` function was casting ALL non-JSON columns to TEXT, which caused numeric fields like `latitude` and `longitude` to be exported as strings instead of numbers.

Now only text-based columns are cast to TEXT (to prevent DuckDB's hugeint conversion for UUIDs), while numeric types (DOUBLE, REAL, FLOAT, INTEGER, BIGINT, etc.) and booleans are preserved as-is.

Fixes #694
