# @happyvertical/jobs

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
  - @happyvertical/sql@0.67.0
  - @happyvertical/utils@0.67.0

## 0.66.11

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.11
  - @happyvertical/sql@0.66.11

## 0.66.10

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.10
  - @happyvertical/sql@0.66.10

## 0.66.9

### Patch Changes

- Updated dependencies [8f80804]
  - @happyvertical/sql@0.66.9
  - @happyvertical/utils@0.66.9

## 0.66.8

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.8
  - @happyvertical/sql@0.66.8

## 0.66.7

### Patch Changes

- Updated dependencies
  - @happyvertical/utils@0.66.7
  - @happyvertical/sql@0.66.7
