---
'@happyvertical/sql': patch
---

Fix PostgreSQL connection lifecycle defects that could crash the process or deadlock the pool. The pool now registers an `error` handler, so an idle client whose backend goes away (restart, failover, proxy timeout) no longer raises an unhandled `error` event and terminates the process. Transactions release their pooled client on every teardown path, including a throwing `COMMIT` or `ROLLBACK`, which previously stranded a connection permanently and exhausted the pool. A failing rollback also no longer replaces the caller's original error; it is attached as `cause` instead.
