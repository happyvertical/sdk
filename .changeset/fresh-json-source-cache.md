---
'@happyvertical/sql': patch
---

Reload cached JSON adapters when external JSON or schema files change, while
coalescing concurrent refreshes, failing closed before stale adapter exports,
and closing the stale DuckDB adapter once.
