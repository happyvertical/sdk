---
"@happyvertical/sql": patch
---

fix(sql): prevent DuckDB :memory: databases from leaking to disk

DuckDB interprets any string as a file path unless it's exactly ':memory:'.
URLs like ':memory:12345' were creating files named ':memory:12345' in the
working directory.

This fix redirects :memory:* patterns to temp files in os.tmpdir(), preventing
file pollution in the current working directory while maintaining test isolation.

Fixes #544
