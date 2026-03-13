"@happyvertical/sql": patch
---

Normalize named in-memory database URLs so values like `:memory:session-id`
reuse in-memory SQLite state instead of being treated like filesystem paths.
The JSON adapter now also avoids creating `:memory:*` directories on disk unless
an explicit `dataDir` is provided.
