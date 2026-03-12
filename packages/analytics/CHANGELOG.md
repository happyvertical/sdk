# @happyvertical/analytics

## 0.71.15

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.15

## 0.71.14

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.14

## 0.71.13

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.13

## 0.71.12

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.12

## 0.71.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.11

## 0.71.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.10

## 0.71.9

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.9

## 0.71.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.8

## 0.71.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.7

## 0.71.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.6

## 0.71.5

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.5

## 0.71.4

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.4

## 0.71.3

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.3

## 0.71.2

### Patch Changes

- Updated dependencies [8202b19]
  - @happyvertical/utils@0.71.2

## 0.71.1

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.71.1

## 0.71.0

### Patch Changes

- @happyvertical/utils@0.71.0

## 0.70.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.7

## 0.70.6

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.70.6

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

### Minor Changes

- 1f7c934: feat(analytics): add unified analytics package with GA4 and Plausible providers

  Adds @happyvertical/analytics package providing a common interface to analytics services:

  - GA4 Provider: Admin API, Data API, Measurement Protocol
  - Plausible Provider: Sites API, Stats API v2, Events API
  - Property management, reporting, event tracking, snippet generation

  Also updates SDK MCP registry with analytics keywords.

### Patch Changes

- @happyvertical/utils@0.66.0
