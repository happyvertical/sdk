# @happyvertical/utils

## 0.56.15

### Patch Changes

- ### Bug Fixes

  - quote table names consistently in JSON adapter operations (#510) (sql)

## 0.56.14

### Patch Changes

- ### Bug Fixes

  - validate changeset:auto during PR check instead of just checking commits (#505) (ci)

## 0.56.13

### Patch Changes

- ### Bug Fixes

  - implement Gemini audit recommendations for workflows (#503) (ci)

## 0.56.12

### Patch Changes

- ### Bug Fixes

  - declare required secrets in workflow_call for publish.yml (ci)

## 0.56.11

### Patch Changes

- ### Features

  - add workflow validation to PR checks (#499) (ci)

## 0.56.10

### Patch Changes

- ### Bug Fixes

  - use GH_TOKEN organization secret for cascade job (#500) (ci)

## 0.56.9

### Patch Changes

- ### Bug Fixes

  - use GitHub App token for cross-repo dispatch (#498) (ci)

## 0.56.8

### Patch Changes

- ### Bug Fixes

  - resolve YAML syntax error in release workflow (#497) (ci)

## 0.56.7

### Patch Changes

- ### Bug Fixes

  - resolve YAML syntax error in release workflow (#496) (ci)

## 0.56.6

### Patch Changes

- ### Bug Fixes

  - use real package name instead of glob in auto-changesets (#492) (ci)

## 0.56.5

## 0.56.4

## 0.56.3

## 0.56.2

## 0.56.1

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

## 0.55.4

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

## 0.55.3

### Patch Changes

- 849eb94: Add test export to trigger version bump and dependency cascade workflow

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
