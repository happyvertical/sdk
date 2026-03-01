# @happyvertical/sql

## 0.70.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.5

## 0.70.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.4

## 0.70.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.3

## 0.70.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.2

## 0.70.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.1

## 0.70.0

### Minor Changes

- 919efea: Add `requiresSchemaCheck` flag to DatabaseInterface

  Adapters that auto-create tables at runtime (JSON, DuckDB) now set
  `requiresSchemaCheck: true`. Migration-managed adapters (Postgres, SQLite)
  leave it unset, allowing frameworks to skip redundant `tableExists()` calls
  during collection initialization.

### Patch Changes

- @happyvertical/utils@0.70.0

## 0.69.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.9

## 0.69.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.8

## 0.69.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.7

## 0.69.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.6

## 0.69.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.5

## 0.69.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.4

## 0.69.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.3

## 0.69.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.2

## 0.69.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.69.1

## 0.69.0

### Patch Changes

- @happyvertical/utils@0.69.0

## 0.68.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.13

## 0.68.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.12

## 0.68.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.11

## 0.68.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.10

## 0.68.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.9

## 0.68.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.8

## 0.68.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.7

## 0.68.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.6

## 0.68.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.5

## 0.68.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.4

## 0.68.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.3

## 0.68.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.68.2

## 0.68.1

### Patch Changes

- 34f0da0: perf(sql): batch index existence checks in PostgreSQL syncSchema

  Pre-scan all CREATE INDEX commands and check existence with a single
  `pg_indexes` query using `ANY($1::text[])` instead of one query per index.
  Reduces ~869 queries per syncSchema call to 1.

  - @happyvertical/utils@0.68.1

## 0.68.0

### Patch Changes

- @happyvertical/utils@0.68.0

## 0.67.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.9

## 0.67.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.8

## 0.67.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.7

## 0.67.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.6

## 0.67.5

### Patch Changes

- @happyvertical/utils@0.67.5

## 0.67.4

### Patch Changes

- db40a0a: Fix TypeScript errors from @types/node v25 stricter type checking

  - analytics/ga4.ts: Use non-null assertions for adminClient/dataClient after ensureClients()
  - utils/parse-args.ts: Cast options to Record<string, unknown> for number value post-processing
  - sql/postgres.ts: Add type annotation to reduce() for batch insert values

- Updated dependencies [db40a0a]
  - @happyvertical/utils@0.67.4

## 0.67.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.3

## 0.67.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.2

## 0.67.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.67.1

## 0.67.0

### Minor Changes

- 9fef9e5: Add Claude Code context installation CLI for each package

  Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

  - **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
  - **CLAUDE.md**: Full documentation for AI-assisted development
  - **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

  Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.

### Patch Changes

- Updated dependencies [9fef9e5]
  - @happyvertical/utils@0.67.0

## 0.66.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.11

## 0.66.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.10

## 0.66.9

### Patch Changes

- 8f80804: fix(sql): preserve database error details across all adapters

  Database errors include additional properties beyond just `message` that provide crucial debugging information:

  - PostgreSQL: code, detail, hint, severity
  - SQLite/LibSQL: code, errno
  - DuckDB: code, detail

  Previously, only the error message was captured, losing these details. Users were seeing errors like "upsert failed" without knowing why.

  This change:

  - Adds a shared `formatDbError()` helper function in `shared/utils.ts`
  - Updates all CRUD operations across all adapters (postgres, sqlite, duckdb, json) to use this helper
  - Exports `formatDbError` for consumers who need to format database errors
  - Ensures error messages now include all available error properties
  - @happyvertical/utils@0.66.9

## 0.66.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.8

## 0.66.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.7

## 0.66.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.4

## 0.66.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.3

## 0.66.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.2

## 0.66.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.1

## 0.66.0

### Patch Changes

- @happyvertical/utils@0.66.0

## 0.65.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.65.1

## 0.65.0

### Patch Changes

- @happyvertical/utils@0.65.0

## 0.64.0

### Patch Changes

- @happyvertical/utils@0.64.0

## 0.63.0

### Patch Changes

- Updated dependencies [8c28ddc]
  - @happyvertical/utils@0.63.0

## 0.62.0

### Patch Changes

- @happyvertical/utils@0.62.0

## 0.61.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.4

## 0.61.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.3

## 0.61.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.2

## 0.61.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.61.1

## 0.61.0

### Patch Changes

- @happyvertical/utils@0.61.0

## 0.60.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.9

## 0.60.8

### Patch Changes

- 996fc5d: fix(sql): preserve numeric types in JSON adapter export

  The JSON adapter's `exportTableToJSON` function was casting ALL non-JSON columns to TEXT, which caused numeric fields like `latitude` and `longitude` to be exported as strings instead of numbers.

  Now only text-based columns are cast to TEXT (to prevent DuckDB's hugeint conversion for UUIDs), while numeric types (DOUBLE, REAL, FLOAT, INTEGER, BIGINT, etc.) and booleans are preserved as-is.

  Fixes #694

  - @happyvertical/utils@0.60.8

## 0.60.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.7

## 0.60.6

### Patch Changes

- 43c295e: fix(sql): preserve JSON object structure in JSON adapter export

  The JSON adapter was casting ALL columns to TEXT during export, which converted JSON objects like `_meta_data: {}` to strings `_meta_data: "{}"`. This caused validation failures with INVALID_META_DATA errors.

  Now JSON and STRUCT columns are preserved as objects during export, while other columns are still cast to TEXT to prevent hugeint conversion issues.

  - @happyvertical/utils@0.60.6

## 0.60.5

### Patch Changes

- cf21ed1: fix(sql): use globalThis for connection cache to fix cross-module lost updates

  The JSON adapter's `memoryConnectionCache` was a module-level Map, which caused the "lost update" bug to persist in monorepos where the same package is loaded from different paths (e.g., pnpm store vs workspace symlink). Each module instance had its own cache, so records written through one path were not visible to the other.

  This fix uses `globalThis` to store the connection cache, ensuring all module instances share the same cache regardless of how they're loaded.

  Fixes #678

  - @happyvertical/utils@0.60.5

## 0.60.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.4

## 0.60.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.3

## 0.60.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.2

## 0.60.1

### Patch Changes

- 01a2fde: fix(sql): prevent DuckDB :memory: databases from leaking to disk

  DuckDB interprets any string as a file path unless it's exactly ':memory:'.
  URLs like ':memory:12345' were creating files named ':memory:12345' in the
  working directory.

  This fix redirects :memory:\* patterns to temp files in os.tmpdir(), preventing
  file pollution in the current working directory while maintaining test isolation.

  Fixes #544

  - @happyvertical/utils@0.60.1

## 0.60.0

### Patch Changes

- @happyvertical/utils@0.60.0

## 0.59.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.6

## 0.59.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.5

## 0.59.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.4

## 0.59.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.3

## 0.59.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.2

## 0.59.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.1

## 0.59.0

### Patch Changes

- @happyvertical/utils@0.59.0

## 0.57.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.1

## 0.57.0

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.0

## 0.56.18

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.18

## 0.56.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.17

## 0.56.16

### Patch Changes

- 9ef2c67: docs: add note about table name quoting fix in JSON adapter (relates to #509)
  - @happyvertical/utils@0.56.16

## 0.56.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.15

## 0.56.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.14

## 0.56.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.13

## 0.56.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.12

## 0.56.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.11

## 0.56.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.10

## 0.56.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.9

## 0.56.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.8

## 0.56.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.7

## 0.56.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/utils@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/utils@0.56.4

## 0.56.3

### Patch Changes

- @happyvertical/utils@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/utils@0.56.2

## 0.56.1

### Patch Changes

- @happyvertical/utils@0.56.1

## 0.56.0

### Patch Changes

- c1b1111: Enable fixed versioning for all @happyvertical packages

  All packages in the SDK monorepo now share the same version number. This simplifies version management and makes it easier to understand which packages work together.

  **Changes:**

  - Updated `.changeset/config.json` to enable fixed versioning for all `@happyvertical/*` packages
  - All packages will now be bumped together to the same version
  - Future changesets will automatically synchronize versions across all packages

  **Migration:**

  - All packages will be synchronized to the same version on the next release
  - The root `package.json` version will be kept in sync with all packages

- Updated dependencies [c1b1111]
  - @happyvertical/utils@0.56.0

## 0.55.7

### Patch Changes

- 240a7ac: Fix column name quoting in DuckDB and JSON adapter UPSERT operations. All column names are now properly quoted in INSERT, ON CONFLICT, and UPDATE SET clauses to match DuckDB's schema generation requirements.

## 0.55.5

### Patch Changes

- dc9c86d: chore: update all dependencies to latest versions

  Updated all dependencies across the monorepo to their latest versions:

  - vite: 5.4.x/6.x/7.1.x → 7.2.2
  - vitest: 2.1.9/3.2.4 → 4.0.8
  - happy-dom: 18.0.1 → 20.0.10 (fixes CVE-2025-61927, CVE-2025-62410)
  - vite-plugin-dts: 3.9.x/4.3.x → 4.5.4
  - @biomejs/biome: 1.9.4/2.3.3 → 2.3.4
  - turbo: 2.3.3/2.5.x → 2.6.0
  - typescript: 5.7.x → 5.9.3
  - And 30+ other dependencies

  Also fixed test and typecheck failures in logger package:

  - Added `vi.clearAllMocks()` to clear mock spy history between tests
  - Added `skipLibCheck: true` to prevent checking problematic node_modules types

  Also skipped browser-based integration tests in spider package when running in CI:

  - CrawleeAdapter tests (Playwright browser automation)
  - TreeScraper tests (browser-based web scraping)
  - Tests pass locally but fail in CI environment

  Closes #387, #396, #397

- Updated dependencies [dc9c86d]
  - @happyvertical/utils@0.55.4

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
