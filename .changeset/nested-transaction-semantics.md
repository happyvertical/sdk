---
'@happyvertical/sql': patch
---

Fix nested `transaction()` silently destroying the enclosing transaction on the SQLite (both the libsql and native-capabilities paths), DuckDB and JSON adapters. Calling `tx.transaction()` re-exposed the top-level `transaction`, which issued a second `BEGIN` on the connection already in a transaction; that throws, and the nested call's own `ROLLBACK` then discarded the outer transaction's uncommitted work while later writes committed in autocommit. Both SQLite implementations now re-enter the current transaction under a `SAVEPOINT`. DuckDB and JSON have no savepoint support, so nesting throws the new `NestedTransactionError` without touching the connection, leaving the enclosing transaction intact. A failing `ROLLBACK` also no longer replaces the caller's original error.
