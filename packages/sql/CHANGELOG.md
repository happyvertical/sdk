# @happyvertical/sql

## 0.55.4

### Patch Changes

- 8d8301d: fix(sql): add type casting for arrays and objects in DuckDB/JSON adapters

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

## 0.55.3

### Patch Changes

- Updated dependencies [849eb94]
  - @happyvertical/utils@0.55.3

## 0.55.0

### Minor Changes

- 5ef824c: Auto-generated changeset from conventional commits:

  fix: simplify auto-changeset workflow - remove dependency installation
  fix: remove pnpm version from workflow to use packageManager field
  Merge pull request #346 from happyvertical/claude-auto-fix-fix/add-package-tagformat-18985806972
  Merge pull request #345 from happyvertical/claude-auto-fix-fix/add-package-tagformat-18985694712
  fix(deps): update pnpm-lock.yaml to remove semantic-release dependencies
  fix(deps): update pnpm-lock.yaml to remove semantic-release dependencies
  feat: add auto-changeset workflow for automatic version bumps
  fix: replace semantic-release with changesets for predictable versioning

### Patch Changes

- Updated dependencies [5ef824c]
  - @happyvertical/utils@0.55.0
