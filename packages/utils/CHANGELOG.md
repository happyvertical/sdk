# @happyvertical/utils

## 0.74.0

## 0.73.4

### Patch Changes

- ### Bug Fixes

  - extract animated webp frames individually (video)

## 0.73.3

### Patch Changes

- ### Features

  - add Garrula publishing primitives (social)

  ### Bug Fixes

  - address copilot review feedback (social)
  - address publishing review feedback (social)
  - tighten publishing adapter edges (social)

## 0.73.2

### Patch Changes

- ### Features

  - add standardized historical providers (weather)

  ### Bug Fixes

  - address copilot review feedback
  - address remaining review threads (weather)
  - address historical provider review (weather)
  - parse timezone-aware open-meteo history (weather)
  - keep local writes under configured base path (files)

## 0.73.1

### Patch Changes

- ### Features

  - add extensible media bundle inspection (video)

  ### Bug Fixes

  - address media bundle review feedback (video)

## 0.73.0

## 0.72.3

### Patch Changes

- ### Bug Fixes

  - address copilot review feedback (sql)
  - address raw query review fixes (sql)

## 0.72.2

## 0.72.1

### Patch Changes

- ### Bug Fixes

  - handle array params in raw queries (sql)
  - preserve postgres raw query operators (sql)

## 0.72.0

## 0.71.34

### Patch Changes

- ### Features

  - add Matomo provider with admin (sites, users, access, tokens) (analytics)
  - add AnalyticsAdminInterface for tenant provisioning (analytics)

  ### Bug Fixes

  - address Copilot review feedback on Matomo provider (analytics)
  - drop misleading setDoNotTrack mapping for Matomo anonymizeIp (analytics)

## 0.71.33

### Patch Changes

- ### Features

  - add gateway admin provisioning (ai)

  ### Bug Fixes

  - resolve gateway admin precedence and harden URL/header handling (ai)

## 0.71.32

### Patch Changes

- ### Bug Fixes

  - use smrt package manager metadata (ci)

## 0.71.31

### Patch Changes

- ### Features

  - sync smrt after sdk releases (ci)

## 0.71.30

### Patch Changes

- ### Bug Fixes

  - validate workspace version consistency (ci)

## 0.71.29

### Patch Changes

- ### Bug Fixes

  - add renovate integration branch (ci)

## 0.71.28

### Patch Changes

- ### Bug Fixes

  - remove release sync PR fallback (ci)

## 0.71.27

### Patch Changes

- ### Bug Fixes

  - skip release commit retriggers (ci)

## 0.71.26

### Patch Changes

- ### Bug Fixes

  - avoid label-only PR reruns (ci)
  - simplify primary workflows (ci)

  ### Dependencies

  - update @openpgp/web-stream-tools to ^0.3.1 (#1002)

## 0.71.25

### Patch Changes

- ### Dependencies

  - update bullmq to v5.76.0 (#999)

## 0.71.24

## 0.71.23

### Patch Changes

- ### Bug Fixes

  - publish merged sync versions (release)

## 0.71.22

## 0.71.20

## 0.71.19

### Patch Changes

- ### Bug Fixes

  - publish context bins and validate artifacts (ci)

## 0.71.18

## 0.71.17

### Patch Changes

- ### Features

  - migrate agent context to AGENT.md (#902) (config)
  - add onUsage callback and usageTags for usage tracking (#898) (ai)

  ### Bug Fixes

  - harden squash-merge release detection (#905) (ci)
  - repair GA4 property discovery (analytics)
  - bound GA4 hydration requests (analytics)
  - unblock documentation builds (#899)

## 0.71.16

### Patch Changes

- ### Features

  - bootstrap .agents configuration for core packages (#878) (config)

## 0.71.15

### Patch Changes

- ### Dependencies

  - update @happyvertical/ocr to ^0.60.24 (#895)

## 0.71.14

### Patch Changes

- ### Dependencies

  - update @happyvertical/pdf to ^0.62.13 (#894)

## 0.71.13

### Patch Changes

- ### Dependencies

  - update @happyvertical/ocr to ^0.60.23 (#893)

## 0.71.12

### Patch Changes

- ### Dependencies

  - update pg to ^8.20.0 (#892)

## 0.71.11

### Patch Changes

- ### Dependencies

  - update openai to v6.27.0 (#891)

## 0.71.10

### Patch Changes

- ### Dependencies

  - update @biomejs/biome to v2.4.6 (#890)

## 0.71.9

### Patch Changes

- ### Dependencies

  - update @google/genai to v1.44.0 (#887)

## 0.71.8

### Patch Changes

- ### Dependencies

  - update turbo to v2.8.14 (#885)

## 0.71.7

### Patch Changes

- ### Dependencies

  - update @happyvertical/ocr to ^0.60.21 (#884)

## 0.71.6

### Patch Changes

- ### Dependencies

  - update @changesets/cli to v2.30.0 (#886)

## 0.71.5

### Patch Changes

- ### Dependencies

  - update actions/upload-artifact action to v7 (#881)

## 0.71.4

### Patch Changes

- ### Dependencies

  - update @happyvertical/pdf to ^0.62.11 (#880)

## 0.71.3

### Patch Changes

- ### Dependencies

  - update @biomejs/biome to v2.4.5 (#879)

## 0.71.2

### Patch Changes

- 8202b19: Add CLAUDE.md agentic instructions and fix stale scope references in package documentation

## 0.71.1

### Patch Changes

- ### Dependencies

  - update actions/download-artifact action to v8 (#842)

## 0.71.0

## 0.70.7

### Patch Changes

- ### Dependencies

  - update PostgreSQL (#841)

## 0.70.6

### Patch Changes

- ### Dependencies

  - update openai to v6.25.0 (#840)

## 0.70.5

### Patch Changes

- ### Dependencies

  - update turbo to v2.8.12 (#839)

## 0.70.4

### Patch Changes

- ### Dependencies

  - update @google/genai to v1.43.0 (#835)

## 0.70.3

### Patch Changes

- ### Dependencies

  - update @biomejs/biome to v2.4.4 (#834)

## 0.70.2

### Patch Changes

- ### Dependencies

  - update TypeDoc (#833)

## 0.70.1

### Patch Changes

- ### Dependencies

  - Lock file maintenance (#822)

## 0.70.0

## 0.69.9

### Patch Changes

- ### Features

  - Kanidm API token auth + credential reset intents (#831) (directory)

## 0.69.8

### Patch Changes

- ### Dependencies

  - update all dependencies (#829)

## 0.69.7

### Patch Changes

- ### Features

  - lazy schemas — adapters resolve only when needed (#828) (sql)

## 0.69.6

### Patch Changes

- ### Dependencies

  - update @anthropic-ai/sdk to v0.78.0 (#826)

## 0.69.5

### Patch Changes

- ### Dependencies

  - update PostgreSQL (#825)

## 0.69.4

### Patch Changes

- ### Dependencies

  - update @happyvertical/pdf to ^0.62.6 (#823)

## 0.69.3

### Patch Changes

- ### Dependencies

  - update @happyvertical/spider to ^0.60.9 (#824)

## 0.69.2

### Patch Changes

- ### Features

  - add Sentry/GlitchTip signal adapter (#821) (logger)

## 0.69.1

### Patch Changes

- ### Features

  - add pgvector support to PostgreSQL adapter (#820) (sql)

## 0.69.0

## 0.68.13

### Patch Changes

- ### Features

  - add unified multi-channel messaging package (#816) (messages)

## 0.68.12

### Patch Changes

- ### Bug Fixes

  - add GitHub Packages auth and remove invalid input from Claude workflow (#815) (ci)

## 0.68.11

### Patch Changes

- ### Bug Fixes

  - use correct allowedTools format for Claude Code action (#814) (ci)

## 0.68.10

### Patch Changes

- ### Bug Fixes

  - filter all bot senders from Claude Code workflow (#813) (ci)

## 0.68.9

### Patch Changes

- ### Bug Fixes

  - add missing packages:read permission and fix script injection in label handler (#812) (ci)

## 0.68.8

### Patch Changes

- ### Bug Fixes

  - resolve pnpm/action-setup version conflict with packageManager (#811) (ci)

## 0.68.7

### Patch Changes

- ### Dependencies

  - bump external package catalog versions (#810)

## 0.68.6

### Patch Changes

- ### Bug Fixes

  - handle multi-line commit bodies in auto-changeset (#809) (ci)

## 0.68.5

### Patch Changes

- ### Bug Fixes

  - make buildWhere TIMESTAMP CAST adapter-aware (#806) (sql)

## 0.68.4

### Patch Changes

- ### Bug Fixes

  - remove explicit pnpm version from claude.yml (#805) (ci)

## 0.68.3

### Patch Changes

- ### Bug Fixes

  - add connection caching to PostgreSQL adapter (#803) (sql)

## 0.68.2

### Patch Changes

- ### Features

  - add convertWebpToMp4 to VideoProcessor (#802) (video)

## 0.68.1

## 0.68.0

## 0.67.9

### Patch Changes

- ### Features

  - add basic auth support to client (#796) (comfyui)

## 0.67.8

### Patch Changes

- ### Bug Fixes

  - execute CREATE INDEX statements in PostgreSQL syncSchema (#794) (sql)

## 0.67.7

### Patch Changes

- ### Bug Fixes

  - handle quoted identifiers in PostgreSQL syncSchema (#792) (sql)

## 0.67.6

### Patch Changes

- ### Features

  - add TTS support and new packages for video production (#787)

## 0.67.5

## 0.67.4

### Patch Changes

- db40a0a: Fix TypeScript errors from @types/node v25 stricter type checking

  - analytics/ga4.ts: Use non-null assertions for adminClient/dataClient after ensureClients()
  - utils/parse-args.ts: Cast options to Record<string, unknown> for number value post-processing
  - sql/postgres.ts: Add type annotation to reduce() for batch insert values

## 0.67.3

### Patch Changes

- ### Features

  - add @happyvertical/json package with Rust SIMD acceleration (#773) (json)

## 0.67.2

### Patch Changes

- ### Bug Fixes

  - add constructors to image adapters to accept options (#772)

## 0.67.1

### Patch Changes

- ### Bug Fixes

  - prevent bot comments from triggering Claude workflow (#769)

## 0.67.0

### Minor Changes

- 9fef9e5: Add Claude Code context installation CLI for each package

  Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

  - **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
  - **CLAUDE.md**: Full documentation for AI-assisted development
  - **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

  Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.

## 0.66.11

### Patch Changes

- ### Bug Fixes

  - pin @types/node to 24.10.9 for Node 24 LTS compatibility (#760)

## 0.66.10

### Patch Changes

- ### Bug Fixes

  - convert ? placeholders to $1 style for postgres (#725) (sql)

## 0.66.9

## 0.66.8

### Patch Changes

- ### Features

  - add @happyvertical/secrets package for envelope encryption (#753) (deps)

## 0.66.7

### Patch Changes

- ### Features

  - add @happyvertical/jobs package for background job processing (#748) (smrt)

## 0.66.6

### Patch Changes

- ### Features

  - add browser-safe entry point (#743) (utils)

## 0.66.5

### Patch Changes

- ### Features

  - add browser-safe entry point (#742) (utils)

## 0.66.4

### Patch Changes

- ### Bug Fixes

  - capture pg error details (code, detail, hint, severity) (sql)

## 0.66.3

### Patch Changes

- ### Bug Fixes

  - include original error in postgres table creation error message (sql)

## 0.66.2

### Patch Changes

- ### Features

  - add issue checkup workflow (#734) (ci)

## 0.66.1

### Patch Changes

- ### Features

  - integrate Claude Code Action via org workflows (#733)

## 0.66.0

## 0.65.1

### Patch Changes

- ### Features

  - add Google and GitHub OAuth providers (#717) (auth)

## 0.65.0

## 0.64.0

## 0.63.0

### Minor Changes

- 8c28ddc: Add `number` type support to CLI `OptionConfig`.

  Previously `OptionConfig.type` only supported `'string' | 'boolean'`. Now it supports `'number'` as well:

  ```typescript
  const command = {
    name: "search",
    options: {
      limit: { type: "number", description: "Max results", default: 50 },
      threshold: { type: "number", description: "Match threshold", short: "t" },
    },
  };

  // Handler receives actual numbers, not strings
  const result = parseCliArgs(
    ["search", "--limit=100", "-t", "0.75"],
    [command]
  );
  console.log(result.options.limit); // 100 (number)
  console.log(result.options.threshold); // 0.75 (number)
  ```

  Features:

  - Automatic conversion from string to number after parsing
  - Supports integers, decimals, negative numbers, and scientific notation
  - Validates that values are valid numbers (throws error for invalid values like `--limit=abc`)
  - Empty string values are treated as invalid (throws error for `--limit=`)
  - Default values work correctly with number types

## 0.62.0

## 0.61.4

### Patch Changes

- ### Bug Fixes

  - use flex instead of inline-flex for Satori compatibility (images)

## 0.61.3

### Patch Changes

- ### Bug Fixes

  - use WOFF format for Google Fonts (Satori compatibility) (images)

## 0.61.2

### Patch Changes

- ### Features

  - add @happyvertical/images package for image processing (#703) (images)

## 0.61.1

### Patch Changes

- ### Features

  - add image description, embedding, and generation methods (#702) (ai)

## 0.61.0

## 0.60.9

### Patch Changes

- ### Bug Fixes

  - cast Date parameters to TIMESTAMP for DuckDB (#698) (sql)

## 0.60.8

## 0.60.7

### Patch Changes

- ### Bug Fixes

  - handle JSON objects/arrays in insertRecordsWithCast (sql)

## 0.60.6

## 0.60.5

## 0.60.4

### Patch Changes

- ### Bug Fixes

  - make changeset publish idempotent for existing tags (#673) (ci)

## 0.60.3

### Patch Changes

- ### Bug Fixes

  - add NODE_AUTH_TOKEN to setup-environment action (ci)

## 0.60.2

### Patch Changes

- ### Bug Fixes

  - remove undeclared GH_TOKEN from on-merge-main workflow (ci)

## 0.60.1

## 0.60.0

## 0.59.6

### Patch Changes

- ### Bug Fixes

  - resolve workflow failures and warnings (ci)

## 0.59.5

### Patch Changes

- ### Bug Fixes

  - enable cross-table queries in JSON adapter with eager loading (#540) (sql)

## 0.59.4

### Patch Changes

- ### Features

  - add dependency graph generation with SKILL_TREE.md (#538)

## 0.59.3

### Patch Changes

- ### Features

  - add 2D array support for OR/AND compound filters (#537) (sql)

## 0.59.2

### Patch Changes

- ### Features

  - add message() method and GitHub template fetching (#534) (ai,repos)

## 0.59.1

### Patch Changes

- ### Features

  - add message() method to AIInterface for simpler single-turn interactions (#532) (ai)

## 0.59.0

## 0.57.1

### Patch Changes

- ### Features

  - add S3 cache provider for CI persistence (#526) (cache,spider)

## 0.57.0

### Minor Changes

- ### Breaking Changes

  - remove automatic schema inference from JSON files (#523) (sql)

  ### Bug Fixes

  - remove automatic schema inference from JSON files (#523) (sql)

## 0.56.18

### Patch Changes

- ### Bug Fixes

  - use schema.fields for STI column validation in JSON adapter (#520) (sql)

## 0.56.17

### Patch Changes

- ### Bug Fixes

  - use schema.columns for STI field validation in JSON adapter (#517) (sql)

## 0.56.16

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
