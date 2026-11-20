---
'@happyvertical/sql': patch
---

PostgreSQL and PGlite transaction handles no longer expose `getTableSchema` by default, as in 0.115 (0.116 added it, which changed the order of smrt core's foreign-key preflight). Opt in per transaction with `transaction(cb, { introspection: true })` / `beginTransaction({ introspection: true })` via the new `IntrospectableTransactions` type.
