# @happyvertical/sdk-mcp

## 0.55.4

### Patch Changes

- ea37688: fix(sdk-mcp): correct package names in vite external config

  Changed @have/_ to @happyvertical/_ in rollup external configuration to match actual package imports. This fixes build failures where vite could not resolve openai import from ai package dist folder.

## 0.55.3

### Patch Changes

- Updated dependencies [849eb94]
  - @happyvertical/utils@0.55.3
  - @happyvertical/ai@0.55.3
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
  - @happyvertical/ai@0.55.0
  - @happyvertical/files@0.55.0
  - @happyvertical/utils@0.55.0
