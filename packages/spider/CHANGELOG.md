# @happyvertical/spider

## 0.60.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.60.2
  - @happyvertical/cache@0.60.2
  - @happyvertical/files@0.60.2

## 0.60.1

### Patch Changes

- @happyvertical/cache@0.60.1
- @happyvertical/files@0.60.1
- @happyvertical/utils@0.60.1

## 0.60.0

### Patch Changes

- @happyvertical/cache@0.60.0
- @happyvertical/files@0.60.0
- @happyvertical/utils@0.60.0

## 0.59.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.6
  - @happyvertical/cache@0.59.6
  - @happyvertical/files@0.59.6

## 0.59.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.5
  - @happyvertical/cache@0.59.5
  - @happyvertical/files@0.59.5

## 0.59.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.4
  - @happyvertical/cache@0.59.4
  - @happyvertical/files@0.59.4

## 0.59.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.3
  - @happyvertical/cache@0.59.3
  - @happyvertical/files@0.59.3

## 0.59.2

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.2
  - @happyvertical/cache@0.59.2
  - @happyvertical/files@0.59.2

## 0.59.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.59.1
  - @happyvertical/cache@0.59.1
  - @happyvertical/files@0.59.1

## 0.59.0

### Patch Changes

- @happyvertical/cache@0.59.0
- @happyvertical/files@0.59.0
- @happyvertical/utils@0.59.0

## 0.57.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.1
  - @happyvertical/cache@0.57.1
  - @happyvertical/files@0.57.1

## 0.57.0

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.57.0
  - @happyvertical/cache@0.57.0
  - @happyvertical/files@0.57.0

## 0.56.18

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.18
  - @happyvertical/cache@0.56.18
  - @happyvertical/files@0.56.18

## 0.56.17

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.17
  - @happyvertical/cache@0.56.17
  - @happyvertical/files@0.56.17

## 0.56.16

### Patch Changes

- @happyvertical/cache@0.56.16
- @happyvertical/files@0.56.16
- @happyvertical/utils@0.56.16

## 0.56.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.15
  - @happyvertical/cache@0.56.15
  - @happyvertical/files@0.56.15

## 0.56.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.14
  - @happyvertical/cache@0.56.14
  - @happyvertical/files@0.56.14

## 0.56.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.13
  - @happyvertical/cache@0.56.13
  - @happyvertical/files@0.56.13

## 0.56.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.12
  - @happyvertical/cache@0.56.12
  - @happyvertical/files@0.56.12

## 0.56.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.11
  - @happyvertical/cache@0.56.11
  - @happyvertical/files@0.56.11

## 0.56.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.10
  - @happyvertical/cache@0.56.10
  - @happyvertical/files@0.56.10

## 0.56.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.9
  - @happyvertical/cache@0.56.9
  - @happyvertical/files@0.56.9

## 0.56.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.8
  - @happyvertical/cache@0.56.8
  - @happyvertical/files@0.56.8

## 0.56.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.7
  - @happyvertical/cache@0.56.7
  - @happyvertical/files@0.56.7

## 0.56.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.56.6
  - @happyvertical/cache@0.56.6
  - @happyvertical/files@0.56.6

## 0.56.5

### Patch Changes

- @happyvertical/cache@0.56.5
- @happyvertical/files@0.56.5
- @happyvertical/utils@0.56.5

## 0.56.4

### Patch Changes

- @happyvertical/cache@0.56.4
- @happyvertical/files@0.56.4
- @happyvertical/utils@0.56.4

## 0.56.3

### Patch Changes

- f249c40: Fix WordPress detection for URLs without trailing slashes (#454)

  WordPress Download Manager detection now works consistently regardless of trailing slashes. URLs like `/download/meeting` and `/download/meeting/` are now both properly detected as WordPress download pages.

  This fixes an issue where WordPress servers return different HTML content for URLs with and without trailing slashes, causing detection to fail for URLs without slashes.

  - @happyvertical/cache@0.56.3
  - @happyvertical/files@0.56.3
  - @happyvertical/utils@0.56.3

## 0.56.2

### Patch Changes

- @happyvertical/cache@0.56.2
- @happyvertical/files@0.56.2
- @happyvertical/utils@0.56.2

## 0.56.1

### Patch Changes

- 82351a1: Add regression tests for WordPress Download Manager detection in vitest

  Fixes #449 - Ensures WordPress PDF link detection works consistently in both standalone Node and vitest environments. The fix from #441 (commit 6d6a5d06) resolved this issue by adding defensive checks to prevent infinite loops when WordPress URLs return HTML.

  Changes:

  - Add comprehensive integration tests (`wordpress-detection.spec.ts`)
  - Test WordPress detection with multiple spider strategies (simple, dom)
  - Verify WordPress URLs are correctly extracted with `wpdmdl` parameter
  - Ensure infinite loop prevention works correctly
  - @happyvertical/cache@0.56.1
  - @happyvertical/files@0.56.1
  - @happyvertical/utils@0.56.1

## 0.56.0

### Patch Changes

- 978c7c7: Fix macOS keychain password prompts in AI and Spider packages

  Prevent macOS keychain password prompts during build and runtime:

  ## AI Package (@happyvertical/ai)

  1. Removing all CLI execution during detection (no more `claude --help` calls)
  2. Checking for ANTHROPIC_API_KEY environment variable and automatically falling back to Anthropic SDK

  **Authentication Priority:**

  1. ANTHROPIC_API_KEY environment variable (uses Anthropic SDK, no keychain prompts)
  2. Claude CLI with setup-token (for CI/CD, no keychain prompts)
  3. Claude CLI with keychain (local development, will fail gracefully if not authenticated)

  **Changes:**

  - Remove `claude --help` verification calls in `findCli()` method
  - Use `fs.access()` to check file existence instead of executing CLI
  - Add automatic fallback to AnthropicProvider when ANTHROPIC_API_KEY is set
  - Map claude-cli model names (sonnet, opus, haiku) to full Anthropic model IDs
  - Add comprehensive integration tests for fallback behavior
  - Update documentation to explain authentication options

  ## Spider Package (@happyvertical/spider)

  Add `--use-mock-keychain` argument to Playwright launch options in Crawlee adapter and tree scraper. This prevents Chromium from accessing the macOS system keychain.

  **Changes:**

  - Add `args: ['--use-mock-keychain']` to Playwright launchOptions in Crawlee adapter
  - Add `args: ['--use-mock-keychain']` to Playwright launchOptions in tree scraper
  - No behavioral changes - only prevents keychain access

  Both packages will now run without prompting for keychain access on macOS.

  Fixes #403

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
  - @happyvertical/cache@0.56.0
  - @happyvertical/files@0.56.0
  - @happyvertical/utils@0.56.0

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

- Updated dependencies [dc9c86d]
  - @happyvertical/cache@0.55.4
  - @happyvertical/files@0.55.4
  - @happyvertical/utils@0.55.4

## 0.55.3

### Patch Changes

- Updated dependencies [849eb94]
  - @happyvertical/utils@0.55.3
  - @happyvertical/cache@0.55.3
  - @happyvertical/files@0.55.3

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
  - @happyvertical/cache@0.55.0
  - @happyvertical/files@0.55.0
  - @happyvertical/utils@0.55.0
