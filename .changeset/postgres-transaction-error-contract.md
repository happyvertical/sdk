---
'@happyvertical/sql': patch
---

Fix transaction-scoped PostgreSQL methods throwing raw `pg` errors instead of `DatabaseError`. The transaction interfaces were hand-maintained copies of the pool-backed methods that called the client bare, so `instanceof DatabaseError` answered differently depending on whether the call was inside a transaction — and the difference was invisible, because `pg` exports its own class also named `DatabaseError`, making `err.name`, `err.constructor.name` and any logged stack read the same either way. Error handling of the form `if (e instanceof DatabaseError) { ... } else throw e` silently took the wrong branch inside transactions, and the failures also lost the structured `sql`/`values`/`originalError` context exactly where diagnosis matters most. Both interfaces are now built from one client-bound factory, so there is a single implementation of each method and the error contract cannot drift again.
