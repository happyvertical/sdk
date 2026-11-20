---
'@happyvertical/sql': patch
---

Restore 0.115 source and behaviour compatibility lost in 0.116.0/0.116.1. `TableColumnInfo.generated`/`.hidden` and `DoctorContext.schema` are optional again. `getTableSchema(table)` returns exactly what 0.115 did (no generated/hidden columns on SQLite, no `generated`/`hidden` keys, no extra catalog query); `getTableSchema(table, { includeGenerated, includeHidden })` opts in. `getTableSchema` and `tableExists` accept any legal table name (quoted, spaced, mixed case) on every adapter, including transaction handles.
