---
"@happyvertical/sql": patch
---

Load each adapter's driver only when that adapter is created. Importing the package root no longer loads `pg`, and opening a local SQLite database uses `@libsql/client/sqlite3`, which skips the hrana, `ws` and `node-fetch` clients that only remote LibSQL URLs need. `clearPostgresConnectionCache()` keeps its signature and loads the PostgreSQL adapter on first call.
