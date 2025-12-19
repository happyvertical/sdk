---
"@happyvertical/sql": patch
---

fix(sql): preserve JSON object structure in JSON adapter export

The JSON adapter was casting ALL columns to TEXT during export, which converted JSON objects like `_meta_data: {}` to strings `_meta_data: "{}"`. This caused validation failures with INVALID_META_DATA errors.

Now JSON and STRUCT columns are preserved as objects during export, while other columns are still cast to TEXT to prevent hugeint conversion issues.
