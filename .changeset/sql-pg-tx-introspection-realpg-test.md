---
'@happyvertical/sql': patch
---

Add a real-PostgreSQL regression test that `pg` transaction handles omit `getTableSchema` unless opted in with `{ introspection: true }`.
