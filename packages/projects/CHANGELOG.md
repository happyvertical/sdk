# @happyvertical/projects

## 0.59.5

### Patch Changes

- @happyvertical/graphql@0.59.5
- @happyvertical/repos@0.59.5

## 0.59.4

### Patch Changes

- @happyvertical/graphql@0.59.4
- @happyvertical/repos@0.59.4

## 0.59.3

### Patch Changes

- @happyvertical/graphql@0.59.3
- @happyvertical/repos@0.59.3

## 0.59.2

### Patch Changes

- @happyvertical/graphql@0.59.2
- @happyvertical/repos@0.59.2

## 0.59.1

### Patch Changes

- @happyvertical/graphql@0.59.1
- @happyvertical/repos@0.59.1

## 0.59.0

### Patch Changes

- Updated dependencies [c49482d]
  - @happyvertical/graphql@0.59.0
  - @happyvertical/repos@0.59.0

## 0.57.1

### Patch Changes

- @happyvertical/repos@0.57.1

## 0.57.0

### Patch Changes

- @happyvertical/repos@0.57.0

## 0.56.18

### Patch Changes

- @happyvertical/repos@0.56.18

## 0.56.17

### Patch Changes

- @happyvertical/repos@0.56.17

## 0.56.16

### Patch Changes

- @happyvertical/repos@0.56.16

## 0.56.15

### Patch Changes

- @happyvertical/repos@0.56.15

## 0.56.14

### Patch Changes

- @happyvertical/repos@0.56.14

## 0.56.13

### Patch Changes

- @happyvertical/repos@0.56.13

## 0.56.12

### Patch Changes

- @happyvertical/repos@0.56.12

## 0.56.11

### Patch Changes

- @happyvertical/repos@0.56.11

## 0.56.10

### Patch Changes

- @happyvertical/repos@0.56.10

## 0.56.9

### Patch Changes

- @happyvertical/repos@0.56.9

## 0.56.8

### Patch Changes

- @happyvertical/repos@0.56.8

## 0.56.7

### Patch Changes

- @happyvertical/repos@0.56.7

## 0.56.6

### Patch Changes

- @happyvertical/repos@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/repos@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/repos@0.56.4

## 0.56.3

### Patch Changes

- @happyvertical/repos@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/repos@0.56.2

## 0.56.1

### Patch Changes

- @happyvertical/repos@0.56.1

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
  - @happyvertical/repos@0.56.0

## 0.1.3

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
  - @happyvertical/repos@0.1.3
