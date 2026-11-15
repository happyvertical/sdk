---
"@happyvertical/sql": minor
---

Add `db.engine` (`'node-sqlite' | 'libsql' | 'postgres' | 'pglite' | 'duckdb' | 'json'`) and `db.reopenOptions()` so a caller can tell which engine backs a connection and open a second connection on the same engine from another thread. The options are plain, cloneable data (a Windows `windowsCustody` verifier is left out and must be supplied by the worker; per-connection PRAGMAs such as `busy_timeout` are not carried over). Add `ReopenNotSupportedError` for databases that cannot be reopened, and a one-time `HV_SQL_SQLITE_ENGINE_MIX` process warning when one thread opens a SQLite file through both `node:sqlite` and `@libsql/client`, which do not share file locks. Default engine selection is unchanged.
