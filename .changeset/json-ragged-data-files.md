---
'@happyvertical/sql': patch
---

Fix the JSON adapter failing to load any data file whose records have different key sets — that is, any file with an optional field. The loader derived its whole column list from the first record alone, so a later record missing that key bound `undefined`, DuckDB rejected the multi-row INSERT with "Cannot create values of type ANY", and every row was lost. `loadJSONData` swallowed the failure as a dismissive `console.warn`, so the caller was left with a table that existed but held zero rows and no meaningful error. In the mirror case — a later record carrying a field the first record lacked — the insert succeeded with the correct row count while that column was silently dropped.

Columns are now unioned across all records, a record omitting a key binds `NULL`, and a field with no matching column (including a case-variant of one already claimed) is reported and skipped instead of costing the whole load. Non-object array elements are skipped rather than emitting phantom all-`NULL` rows. When a file that did parse still cannot be loaded, the adapter now logs the failure loudly (`console.error`, stating the table is left empty) rather than hiding it — while still loading every other table in the same data directory or `syncSchema()` call. An unreadable or malformed file remains tolerated with a warning.
