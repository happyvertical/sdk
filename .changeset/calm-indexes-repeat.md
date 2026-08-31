---
'@happyvertical/sql': patch
---

Recognize PostgreSQL `CREATE INDEX CONCURRENTLY` statements during schema synchronization so repeated syncs skip indexes that already exist.
