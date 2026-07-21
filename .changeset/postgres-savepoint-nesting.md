---
'@happyvertical/sql': patch
---

Fix nested `transaction()` silently opening an independent transaction on a second connection in the PostgreSQL adapter. `tx.transaction()` re-exposed the top-level `transaction`, so the nested callback ran on a freshly pooled connection under its own `BEGIN`: it could not see the enclosing transaction's uncommitted rows, and if the enclosing transaction held a lock the nested one needed, the two deadlocked in a way PostgreSQL cannot detect — the outer connection waits on a promise rather than a lock, so `deadlock_timeout` never fires and the process hangs. Re-entering now runs the callback under a `SAVEPOINT` on the same connection, releasing on success and rolling back to it on failure, so a failed nested scope leaves the enclosing transaction usable.
