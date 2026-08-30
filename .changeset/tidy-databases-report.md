---
'@happyvertical/sql': patch
'@happyvertical/utils': patch
---

Expose sanitized database driver diagnostics through `DatabaseError` messages,
native causes, and JSON serialization while redacting SQL statements, bound
values, and credential-shaped details.
