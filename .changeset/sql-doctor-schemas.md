---
"@happyvertical/sql": minor
---

`runDoctor` accepts `schemas` (a schema or list of schemas) or `allSchemas` to check schemas other than `public`; each schema's checks resolve table names inside it. The default is unchanged.
