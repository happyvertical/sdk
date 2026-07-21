---
'@happyvertical/sql': patch
---

Fix `tx.tableExists()` and `tx.syncSchema()` running outside the transaction on the PostgreSQL adapter. Both were carried over from the enclosing scope into the transaction-scoped interfaces, and both close over the *pool* rather than the transaction's client, so they executed on a different connection. `tx.tableExists()` could not see a table created earlier in the same transaction, and — the damaging one — `tx.syncSchema()` committed its DDL immediately, so "run my migration inside a transaction so it rolls back cleanly on failure" left a partially-applied migration applied. The behaviour also differed silently by adapter: on the single-connection adapters the same calls do run inside the transaction, so code developed against SQLite changed behaviour when deployed on PostgreSQL. Both are now built per client alongside every other transaction-scoped method.
