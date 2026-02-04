---
'@happyvertical/sql': patch
---

perf(sql): batch index existence checks in PostgreSQL syncSchema

Pre-scan all CREATE INDEX commands and check existence with a single
`pg_indexes` query using `ANY($1::text[])` instead of one query per index.
Reduces ~869 queries per syncSchema call to 1.
