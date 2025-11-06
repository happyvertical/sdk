---
"@happyvertical/sql": patch
---

fix(sql): add type casting for arrays and objects in DuckDB/JSON adapters

Fixes #378 - DuckDB type casting error for array and object fields in UPSERT statements

DuckDB requires explicit type casting for arrays and plain objects in parameterized queries to prevent "Cannot create values of type ANY" errors. This change adds automatic casting to JSON for these types in both insert and upsert operations.

**Changes:**
- Arrays are now cast to JSON with `CAST($N AS JSON)` and serialized with `JSON.stringify()`
- Plain objects (detected via `Object.getPrototypeOf()`) are cast to JSON and serialized
- Class instances are not affected - they use direct parameter binding
- Empty arrays and nested objects are fully supported
- Changes applied to both DuckDB and JSON adapters

**Breaking Changes:** None - this is a backward-compatible fix

**Tests Added:**
- INSERT operations with empty arrays, string arrays, number arrays, and nested objects
- UPSERT operations for updating and creating records with arrays/objects
- Batch insert operations with mixed array/object data
- JSON file persistence verification
- Mixed type handling (arrays with multiple types, nested structures)

This fix enables SMRT framework and other applications to use arrays and objects with the JSON adapter without workaround field types.
