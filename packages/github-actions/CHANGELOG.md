# @happyvertical/github-actions

## 0.55.3

### Patch Changes

- fdeab5a: Complete dependency cascade system with auto-merge and devDependencies fix

  - Fixed cascade handler to prevent .npmrc with auth token from being committed
  - Added auto-merge for changesets version PRs when CI passes
  - Fixed cascade handler to install devDependencies after pnpm update
  - Fixed cascade dispatch to include published packages information
  - Fixed cascade handler grep failure when no package.json changes occur

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
