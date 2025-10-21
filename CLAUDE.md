# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

> **Important**: As of October 2024, the SMRT framework has been split into its own repository at [github.com/happyvertical/smrt](https://github.com/happyvertical/smrt). This SDK provides core foundation packages (ai, files, sql, utils, logger) and infrastructure packages that can be used with SMRT or independently.

## Monorepo Structure

The SDK is organized as a pnpm workspace with the following packages:

### Core Foundation Packages (`packages/`)
Core packages used by infrastructure and the SMRT framework:

- **utils**: Base utility functions
- **logger**: Logging infrastructure
- **files**: File system operations (local and remote)
- **sql**: Database operations (SQLite, Postgres, DuckDB)
- **ai**: Multi-provider AI client (OpenAI, Anthropic, Google, AWS)

### Infrastructure Packages (`packages/`)
Infrastructure packages for advanced functionality:

- **cache**: Caching utilities and abstractions
- **geo**: Geographic utilities and services
- **translator**: Translation services integration
- **ocr**: Optical Character Recognition with multiple providers
- **pdf**: PDF parsing and processing with OCR fallback
- **spider**: Web crawling and content extraction
- **documents**: Document processing and management

### Developer Tools (`packages/`)
Tools for SDK development and documentation:

- **sdk-mcp**: MCP server for routing queries to package experts (CLAUDE.md files)

## Development Patterns

### Dependency Management

- Package versioning is synchronized across the monorepo
- Internal SDK packages use `workspace:*` to reference other SDK packages
- External dependencies are kept to a minimum
- Node.js 24+ or Bun 1.0+ required for development and runtime

### Build Process

The build process follows a specific order to respect internal dependencies:

**Core Foundation Packages** (in `packages/`):
1. `@have/utils` (base utilities, no internal dependencies)
2. `@have/logger` (logging infrastructure, no internal dependencies)
3. `@have/files` (file system operations, no internal dependencies)
4. `@have/sql` (database operations, no internal dependencies)
5. `@have/ai` (AI client with multi-provider support, no internal dependencies)

**Infrastructure Packages** (in `packages/`):
1. `@have/cache` (caching utilities, no internal dependencies)
2. `@have/geo` (geographic utilities, no internal dependencies)
3. `@have/translator` (translation services, no internal dependencies)
4. `@have/ocr` (OCR providers, no internal dependencies)
5. `@have/pdf` (PDF processing, depends on ocr)
6. `@have/spider` (web crawling, no internal dependencies)
7. `@have/documents` (document processing, depends on pdf, spider, ocr)

### Build Artifacts and Git

**IMPORTANT**: Build artifacts (`dist/` directories) are NOT tracked in git.

**Why**:
- Prevents noisy diffs on every build
- Avoids merge conflicts on build artifacts
- Keeps git history clean and repository size small
- Follows industry-standard practice for TypeScript monorepos

**How it works**:
- `dist/` is in `.gitignore`
- Build artifacts are generated locally during development
- Published npm packages include `dist/` (via `files` field in package.json)
- CI/CD builds before publishing to npm

**For developers**:
- Run `npm run build` to generate dist/ locally
- dist/ directories are gitignored and will not be committed
- All packages have `files` field specifying what goes to npm

**For package publishing**:
- CI builds all packages before publishing
- Published packages include dist/, README.md, and LICENSE
- Users of published packages get the built artifacts

### Package Publishing

**Publishing Platform**: All SDK packages are published to **GitHub Packages** (not npm).

#### Automated Publishing Workflow

Publishing is fully automated using semantic-release:

1. **Trigger**: Merges to `main` branch automatically trigger the release workflow
2. **Version Detection**: semantic-release analyzes conventional commits to determine version bump
3. **Build**: All packages are built with `pnpm run build`
4. **Publish**: Packages are published to GitHub Packages registry
5. **Changelog**: CHANGELOG.md is automatically updated with release notes
6. **Git Tag**: A git tag is created for the new version

**GitHub Actions Workflow**: `.github/workflows/on-merge-main.yml`

```yaml
# Relevant configuration
- name: Setup Environment
  uses: ./.github/actions/setup-environment
  with:
    node-version: '24'
    registry-url: 'https://npm.pkg.github.com'  # GitHub Packages

- name: Release packages
  run: pnpm run release
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}  # GitHub Packages auth
```

#### Package Configuration

Each package's `package.json` includes:

```json
{
  "name": "@have/{package-name}",
  "version": "0.45.2",
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/happyvertical/sdk.git",
    "directory": "packages/{package-name}"
  }
}
```

#### Semantic Versioning

Version bumps follow conventional commits:

- `feat:` → Minor version bump (0.45.0 → 0.46.0)
- `fix:`, `perf:`, `docs:`, `build:` → Patch version bump (0.45.0 → 0.45.1)
- `refactor:` → Minor version bump
- `breaking:` in commit body → Minor version bump (until 1.0.0)
- `scope: no-release` → No version bump

**Configuration**: `.releaserc.json`

#### Installing Published Packages

Users need to configure npm for GitHub Packages:

**Create `.npmrc` in project root:**
```
@have:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

**Install packages:**
```bash
pnpm add @have/ai @have/sql @have/files
```

**GitHub Token Requirements**:
- Token needs `read:packages` scope
- Create at: GitHub Settings → Developer settings → Personal access tokens

#### Manual Publishing (Emergency Use Only)

If automated publishing fails, packages can be published manually:

```bash
# Build all packages
pnpm run build

# Dry-run to preview changes
pnpm run release:dry-run

# Publish (only if automated workflow failed)
pnpm run release
```

**Important**: Manual publishing should be rare. Fix the CI/CD workflow instead of routinely publishing manually.

#### Release Scripts

Available in root `package.json`:

- `pnpm run release` - Automated semantic-release
- `pnpm run release:dry-run` - Preview release without publishing
- `pnpm run release:packages` - Release individual packages
- `pnpm run release:preview` - Preview next version
- `pnpm run release:validate` - Validate release configuration

### TypeScript Project References

The SDK uses TypeScript project references for proper type resolution across packages. **This is critical for avoiding module resolution conflicts.**

#### Configuration Requirements

Each package must have:
1. `composite: true` in its tsconfig.json
2. `outDir`, `rootDir`, and `tsBuildInfoFile` properly configured
3. Entry in root tsconfig.json `references` array

**Example package tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",  // Two levels up (packages/cache -> root)
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Root tsconfig.json references (must be complete):**
```json
{
  "references": [
    // Core foundation packages
    { "path": "./packages/utils" },
    { "path": "./packages/logger" },
    { "path": "./packages/files" },
    { "path": "./packages/sql" },
    { "path": "./packages/ai" },

    // Infrastructure packages
    { "path": "./packages/cache" },
    { "path": "./packages/geo" },
    { "path": "./packages/translator" },
    { "path": "./packages/ocr" },
    { "path": "./packages/pdf" },
    { "path": "./packages/documents" },
    { "path": "./packages/spider" }
  ]
}
```

#### Verifying TypeScript Configuration

```bash
# Check that all packages have proper project references
npx tsc --build --dry

# Force rebuild all projects
npx tsc --build --force

# Use Vite for actual builds (not raw tsc)
npm run build
```

**Note**: All packages use Node.js-only builds for simplified deployment and better performance. The dual-target (browser/node) architecture has been removed in favor of focused Node.js development.

### Code Style and Conventions

- Code formatting is enforced by Biome
- Spaces (2) for indentation
- Single quotes for strings
- Line width of 80 characters
- ESM module format exclusively
- Each package has its own tsconfig that extends from the root
- Use camelCase for variables and functions, PascalCase for classes
- Use conventional commits
- Dont include claude branding in commit messages
- Use pnpm for package management and npm scripts for builds
- Ensure all scripts and tools are nix-friendly (use /usr/bin/env in shebangs)

### Testing

- Tests are written using Vitest
- Each package has its own test suite
- Run tests with `npm test` or `npm run test:watch`

### Common Development Commands

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Build all packages in correct order
npm run build

# Watch mode development
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Cross-Package Dependencies

### Core Foundation Package Dependencies

Core foundation packages have minimal dependencies:

- `utils`: No internal dependencies
- `logger`: No internal dependencies
- `files`: Depends on `utils`
- `sql`: No internal dependencies
- `ai`: No internal dependencies

### Infrastructure Package Dependencies

SDK infrastructure packages have these dependency relationships:

- `cache`: No internal dependencies
- `geo`: Depends on `utils`
- `translator`: No internal dependencies
- `ocr`: Depends on `utils`
- `spider`: No internal dependencies
- `pdf`: Depends on `ocr`, `utils`
- `documents`: Depends on `pdf`, `spider`, `ocr`, `utils`

When adding new features, maintain this dependency hierarchy to avoid circular dependencies.

### Adding New Packages

When adding a new package to the SDK:

1. **Create package directory** in `packages/` with proper structure
2. **Add CLAUDE.md** file documenting the package's purpose and APIs
3. **Update root tsconfig.json** to include the new package in `references` array
4. **Update build order** in this CLAUDE.md if the package has dependencies
5. **Update SDK MCP Server** (`packages/sdk-mcp/src/registry.ts`) to include the new package in keyword mapping and registry
6. **Run full build** to ensure TypeScript project references are correct

**Important**: The SDK MCP Server auto-discovers packages via `packages/*/CLAUDE.md` files, but you should update the keyword mapping in `registry.ts` to ensure proper query routing.

## Contribution Guidelines

1. Ensure code passes Biome linting (`npm run lint`)
2. Write tests for new functionality
3. Update package documentation when adding new features
4. Follow existing code patterns in each package
5. Run the full test suite before submitting changes

## Development Workflow

HAppy VErtical follows a standardized development workflow across all projects. The workflow documentation serves as the organization's source of truth:

- **[Definition of Ready](./docs/workflow/DEFINITION_OF_READY.md)**: Criteria that must be met before an issue can be started
- **[Definition of Done](./docs/workflow/DEFINITION_OF_DONE.md)**: Checklist for completing Pull Requests
- **[Kanban Process](./docs/workflow/KANBAN.md)**: Kanban CI/CD workflow with automation setup

All HAppy VErtical projects should reference and follow these workflow standards to ensure consistency across the organization.

### SOP: Starting Work on an Issue

**IMPORTANT**: This SOP should be followed automatically whenever beginning implementation work, whether explicitly asked or implied.

**Related Standards**:
- [Organization-Wide Testing Standard](../../TESTING_STANDARD.md) - Must be followed for all test writing
- [Definition of Ready](./docs/workflow/DEFINITION_OF_READY.md) - Issue readiness criteria
- [Definition of Done](./docs/workflow/DEFINITION_OF_DONE.md) - PR completion checklist

#### When This SOP Triggers

This procedure triggers in these scenarios:
- User mentions implementing/working on an issue (e.g., "let's work on #270")
- User asks to start implementing a feature/fix
- Beginning any implementation work (even without explicit issue number)
- Returning to work after interruption

#### Step 1: Verify Git State

Before any work begins, ensure a clean git state:

```bash
# Check current status
git status

# If there are uncommitted changes: STOP
# DO NOT PROCEED - inform user they must commit or stash changes first
```

**If uncommitted changes exist**:
- Stop the SOP immediately
- Inform the user: "You have uncommitted changes. Please commit or stash them before starting new work."
- Do not attempt to stash or commit automatically
- Wait for user to resolve

**If clean working tree**:
- Proceed to Step 2

#### Step 2: Sync with Main Branch

Ensure local main is up-to-date:

```bash
# If not on main, checkout main
git checkout main

# Pull latest changes
git pull origin main
```

**If already on a feature branch**:
- First verify working tree is clean (Step 1)
- Then checkout main and sync
- Claude will create/checkout the correct feature branch in Step 4

#### Step 3: Identify Issue(s) and Context

**Interactive Mode** (default):
- If no issue number mentioned, use wizard to ask which issue(s) to work on
- If user mentions issue(s), fetch issue details using `gh issue view #XXX`
- Read the issue description, labels, and comments for context

**Non-Interactive/CI Mode**:
- Issue number must be provided as input
- If missing, exit with error: "Issue number required for non-interactive mode"
- Fetch issue details using `gh issue view #XXX`

**Multiple Issues**:
- If working on multiple related issues, note all issue numbers
- Branch will be named: `{type}/issue-XXX-YYY-short-desc`
- PR will use: `Closes #XXX, Fixes #YYY` syntax

#### Step 4: Create or Checkout Feature Branch

**Branch Naming Convention**:
```
{type}/issue-{numbers}-{short-description}

Examples:
feat/issue-270-testing-standard
fix/issue-123-database-connection
docs/issue-45-api-guide
refactor/issue-89-cleanup-cache
test/issue-67-integration-tests
feat/issue-270-271-combined-work  # Multiple issues
```

**Determining Branch Type**:
- Read issue labels and title to infer type (feat/fix/docs/refactor/test)
- Default to `feat` if unclear

**Branch Creation**:
```bash
# Check if branch already exists remotely
git fetch origin

# If branch exists, check it out
git checkout {type}/issue-XXX-short-desc

# If branch does not exist, create it
git checkout -b {type}/issue-XXX-short-desc

# If branch exists remotely but not locally
git checkout -b {type}/issue-XXX-short-desc origin/{type}/issue-XXX-short-desc
```

**Context Awareness**:
- If branch already exists: Assume continuing previous work
- Check last commit message to understand current state
- Review existing changes since branching from main

#### Step 5: Update Project Board Status

Move the issue from "To Do" to "In Progress" on the project board:

```bash
# Get the issue number from branch name or context
ISSUE_NUMBER={issue-number}

# Update issue status to "In Progress" using gh CLI
gh project item-edit 7 --owner happyvertical \
  --field-name "Status" --text "In Progress" \
  --id $(gh api graphql -f query='
    query($org: String!, $repo: String!, $number: Int!) {
      repository(owner: $org, name: $repo) {
        issue(number: $number) {
          projectItems(first: 10) {
            nodes {
              id
            }
          }
        }
      }
    }' -f org=happyvertical -f repo=sdk -F number=$ISSUE_NUMBER --jq '.data.repository.issue.projectItems.nodes[0].id')
```

**Note**: Project number 7 is the "Development Workflow" project for happyvertical organization.

**Manual alternative**:
- If gh CLI commands fail, note in issue comment that work has started
- Update project board manually via GitHub web UI: https://github.com/orgs/happyvertical/projects/7
- Continue with SOP

**Verify update**:
- Confirm issue appears in "In Progress" column on project board
- If update fails: Note failure, continue with work (board can be updated manually later)

#### Step 6: Planning Phase (Interactive Mode Only)

**IMPORTANT**: Use the AskUserQuestion wizard for ALL clarifying questions.

**Standard Questions to Ask** (use wizard):
1. **Implementation Approach**
   - Technical approach (architecture, design patterns)
   - Library/tool choices
   - Integration points

2. **Scope Clarification**
   - What's in scope vs. out of scope
   - Priority of sub-tasks
   - Must-haves vs. nice-to-haves

3. **Custom Questions Based on Issue Type**:
   - **Features**: User experience, API design, backward compatibility
   - **Bugs**: Root cause, reproduction steps, regression test strategy (per TESTING_STANDARD.md)
   - **Refactoring**: Impact scope, breaking changes, migration path
   - **Docs**: Audience, format, examples needed
   - **Tests**: Follow organization-wide testing standard (see `../../TESTING_STANDARD.md`)

4. **Test Strategy** (Always Ask):
   - What test types are needed? (unit/integration/examples/optional)
   - Should tests use real resources or mocks? (default: real resources per TESTING_STANDARD.md)
   - Are README examples affected? (if yes, must add corresponding tests)
   - Is this fixing a bug? (if yes, write failing test first per BDD/TDD workflow)

**Wizard Question Format**:
```typescript
// Use AskUserQuestion with 1-4 questions
// Focus on decisions that can't be standardized
// Avoid asking questions with obvious answers from issue context
```

**Recording Planning Decisions**:
After wizard responses, post a comment to the issue:

```bash
gh issue comment {issue-number} --body "$(cat <<'EOF'
## Planning Notes

### Implementation Approach
[Summary of technical approach decided]

### Scope
- In scope: [list]
- Out of scope: [list]

### Key Decisions
1. [Decision 1 and rationale]
2. [Decision 2 and rationale]

### Test Strategy
Following [Organization-Wide Testing Standard](../../TESTING_STANDARD.md):

**Test Types**:
- [ ] Unit tests (`*.test.ts`) - [if needed, describe what]
- [ ] Integration tests (`*.spec.ts`) - [describe real resources to use]
- [ ] Example tests (`*.examples.test.ts`) - [if demonstrating common patterns]
- [ ] Optional tests (`*.optional.test.ts`) - [if using external APIs/expensive resources]

**Testing Approach**:
- Using real resources: [SQLite in-memory / temp directories / test server / Docker]
- Mocking only: [list exceptions with justification]
- README examples: [list examples that need corresponding tests]
- BDD/TDD: [if bug fix, describe failing test to write first]

**Test Verification**:
- [ ] Tests document behavior (not implementation)
- [ ] Tests read like executable examples
- [ ] README examples have corresponding tests
- [ ] Following package-specific guidelines (if applicable)

EOF
)"
```

#### Step 7: Create Task List (If Applicable)

For complex issues with multiple steps, use TodoWrite to create task list:

```typescript
// Use TodoWrite tool
// Break down work into specific, actionable items
// Use both content (imperative) and activeForm (present continuous)
```

**When to use TodoWrite**:
- Issue has 3+ distinct steps
- Multi-package changes required
- Complex workflow with dependencies

**When to skip TodoWrite**:
- Single straightforward change
- Trivial update
- Simple bug fix

#### Step 8: Begin Implementation

**Implementation Order** (following Testing Standard):

For **bug fixes**:
1. Write failing test that reproduces the issue (BDD/TDD approach)
2. Implement fix to make test pass
3. Verify test passes and provides regression protection

For **new features**:
1. Write tests from user stories (integration tests with real resources)
2. Implement feature to make tests pass
3. Add example tests for common usage patterns
4. Update README with examples (and corresponding tests)

For **all work**:
- Follow the plan established in Step 5
- Update TodoWrite task list as you progress
- Mark tasks as in_progress → completed as you work
- Follow standard coding conventions from CLAUDE.md
- Follow testing standards from TESTING_STANDARD.md:
  - Use real resources (in-memory DBs, temp files) over mocks
  - Write tests that read like documentation
  - Ensure README examples have corresponding tests
  - Test behavior, not implementation

#### Non-Interactive/CI Mode Behavior

When running in CI or non-interactive environment:

**Detection**:
```bash
# Check if running interactively
if [ -t 0 ]; then
  # Interactive mode
else
  # Non-interactive mode
fi
```

**Alternative Behaviors**:

1. **Post questions as comments**:
   - If clarification needed, post wizard questions as issue comment
   - Format as checklist for user to answer
   - Exit with status indicating user input needed

2. **Use sensible defaults**:
   - Infer type from labels (bug → fix, feature → feat)
   - Use issue title for branch description
   - Skip custom planning questions
   - Proceed with implementation using issue description as spec

3. **Fail with guidance**:
   - If critical clarifications needed, exit with error
   - Post comment explaining what information is needed
   - Exit code indicates manual intervention required

**Preference**: Use option 2 (sensible defaults) for simple issues, option 1 (post questions) for complex issues requiring decisions.

#### SOP Checklist

Use this checklist to verify SOP completion:

**Pre-Implementation**:
- [ ] Working tree is clean (no uncommitted changes)
- [ ] Main branch is synced with remote
- [ ] Issue(s) identified and context loaded
- [ ] Feature branch created/checked out with correct naming
- [ ] Project board updated (issue moved to "In Progress")
- [ ] Planning phase completed (interactive) or defaults used (CI)
- [ ] Planning notes posted to issue (if interactive)
- [ ] Task list created (if applicable)

**Testing Strategy Confirmed** (per TESTING_STANDARD.md):
- [ ] Test types identified (unit/integration/examples/optional)
- [ ] Real resources vs. mocks decided (default: real resources)
- [ ] README examples identified (if any need corresponding tests)
- [ ] BDD/TDD approach confirmed for bug fixes (write failing test first)
- [ ] Package-specific testing guidelines reviewed (if applicable)

**Ready to Implement**:
- [ ] Know which tests to write first (bugs: failing test; features: integration tests)
- [ ] Implementation order clear (test → implement → verify)
- [ ] All questions answered, ready to code

#### Exception Handling

**Merge Conflicts on Main Sync**:
- Stop SOP, inform user
- Ask user to resolve conflicts before continuing

**Branch Already Exists with Different Type**:
- Example: `fix/issue-270-X` exists but labels indicate `feat`
- Use existing branch (don't rename)
- Note the discrepancy for user

**Issue Not Found**:
- If `gh issue view` fails, stop SOP
- Inform user the issue doesn't exist or isn't accessible
- Ask user to verify issue number

**Multiple Remote Branches for Same Issue**:
- List branches and ask user which to use
- Use wizard to present options

#### Tips for Claude

- **Be proactive**: Don't wait for user to say "follow the SOP" - do it automatically
- **Be context-aware**: Detect if returning to existing work vs. starting fresh
- **Be communicative**: Inform user of each step ("Syncing with main...", "Creating feature branch...", etc.)
- **Be flexible**: If user shortcuts the process (e.g., already on correct branch), skip unnecessary steps
- **Use the wizard**: Never ask clarifying questions in plain text - always use AskUserQuestion

### SOP: Creating a Pull Request

**IMPORTANT**: This SOP should be followed automatically when work is complete, before pushing changes.

**Related Standards**:
- [Organization-Wide Testing Standard](../../TESTING_STANDARD.md) - Enforced by code reviewer
- [Definition of Done](./docs/workflow/DEFINITION_OF_DONE.md) - Verified before PR creation
- [Code Reviewer Agent](./.claude/agents/code-reviewer.md) - Automated review process

#### When This SOP Triggers

This procedure triggers when:
- User indicates work is complete ("ready", "done", "create PR", etc.)
- User says "push" or "ready for review"
- Work appears complete based on context

**DO NOT trigger** when:
- Work is still in progress
- Tests are failing
- User is experimenting or exploring

#### Step 1: Verify Work Completion

Before starting PR process, confirm:

```bash
# Check current branch
git branch --show-current

# Verify on feature branch (not main)
# If on main: Stop, inform user they need to be on a feature branch
```

**If not on feature branch**:
- Stop SOP immediately
- Inform user: "You're on main branch. Create a feature branch first."
- Reference "Start Work on Issue" SOP

**If on feature branch**:
- Proceed to Step 2

#### Step 2: Run Quality Checks

Run all quality checks in sequence:

```bash
# 1. Lint
npm run lint

# 2. Format
npm run format

# 3. Type check
npm run typecheck || npm run build

# 4. Tests
npm test
```

**Track results**:
- Note which checks passed/failed
- Capture error messages for failed checks

#### Step 3: Auto-Fix Issues (If Any)

**If lint or format failures**:

```bash
# Attempt auto-fix
npm run lint --fix
npm run format --fix

# Re-run checks
npm run lint
npm run format
```

**If auto-fix succeeds**:
- Continue to next check
- Note auto-fixes applied

**If auto-fix fails**:
- Stop SOP
- Show errors to user
- Message: "Please fix lint/format errors manually and try again"
- Exit

**If typecheck or tests fail**:
- Stop SOP immediately (cannot auto-fix)
- Show errors to user
- Message: "Fix TypeScript errors / failing tests before creating PR"
- Exit

**If all checks pass**:
- Proceed to Step 4

#### Step 4: Run Code Review Agent

Invoke the code-reviewer agent to verify quality standards BEFORE creating the final commit:

```bash
# Invoke code-reviewer agent (via Task tool or direct delegation)
# See .claude/agents/code-reviewer.md for details
```

**Code Reviewer Checks**:
1. Testing standards (TESTING_STANDARD.md)
2. Coding standards (CLAUDE.md)
3. Definition of Done (docs/workflow/DEFINITION_OF_DONE.md)
4. Gemini code review (non-trivial files only, via Gemini MCP)

**Review Process**:
```
Agent reviews code
  ↓
Issues found?
  ↓ YES
Auto-fixable?
  ↓ YES
Apply auto-fixes and commit them
  ↓
Re-run review (repeat until clean or no more auto-fixes)
  ↓
Blocking issues remain?
  ↓ YES
Stop: Report issues to user
  ↓ NO
Continue to Step 5
```

**If blocking issues found**:
- Stop SOP
- Show code review report to user
- Message: "Code review found {N} blocking issues. Please fix and try again."
- List each issue with file/line number
- Exit

**If non-blocking suggestions only**:
- Note suggestions for PR description
- Continue to Step 5

**If all checks pass**:
- Capture review summary for PR body
- All fixes have been committed
- Proceed to Step 5

#### Step 5: Squash Commits

Combine all commits on the feature branch (including any code review fixes) into a single commit:

```bash
# Get first commit on branch
FIRST_COMMIT=$(git merge-base main HEAD)

# Count commits to squash
COMMIT_COUNT=$(git rev-list --count ${FIRST_COMMIT}..HEAD)

# If more than 1 commit, squash
if [ $COMMIT_COUNT -gt 1 ]; then
  # Interactive rebase to squash
  git rebase -i ${FIRST_COMMIT}

  # OR use reset + commit approach:
  git reset --soft ${FIRST_COMMIT}
  git commit -m "$(generate_commit_message)"
fi
```

**Commit Message Format** (Conventional Commits):
```
{type}({scope}): {description}

{body}

Closes #{issue-number}
```

**Examples**:
```
feat(cache): add Redis provider support

- Implement RedisCache class with get/set/delete operations
- Add connection pooling and retry logic
- Add integration tests with real Redis (Docker)
- Add example tests for common patterns
- Update README with usage examples

Closes #123

fix(sql): handle null values in upsert operations

Fixes issue where null values were being converted to undefined,
causing database constraint violations.

- Add null value handling in upsert method
- Add regression test reproducing the issue
- Verified fix with SQLite and Postgres

Closes #45
```

**Generate commit message**:
- Use `{type}` from branch name (feat/fix/docs/refactor/test)
- Use `{scope}` from package name or area changed
- Use `{description}` from issue title or summary
- Include `{body}` with bullet list of changes
- Include `Closes #{issue-number}` from issue

#### Step 6: Create PR Body

Generate comprehensive PR description using this template:

```markdown
## Summary

{Summary of what was implemented, referencing planning notes from issue}

## Changes

{Bullet list of key changes:}
- {Feature/fix/refactor implemented}
- {Files modified or added}
- {Integration points}

## Testing

Following [Organization-Wide Testing Standard](../../TESTING_STANDARD.md):

**Test Types Added**:
- [x] Unit tests (`*.test.ts`) - {describe what}
- [x] Integration tests (`*.spec.ts`) - {describe what}
- [x] Example tests (`*.examples.test.ts`) - {if applicable}
- [ ] Optional tests (`*.optional.test.ts`) - {if applicable}

**Testing Approach**:
- Used real resources: {SQLite in-memory / temp directories / test server / etc.}
- Mocked only: {list exceptions with justification, or "None"}
- README examples: {list examples with corresponding tests, or "No examples affected"}
- BDD/TDD: {if bug fix, note regression test added}

**Test Results**:
```
✅ All tests pass (X passing)
✅ New tests: Y added
✅ Coverage: Z% of changed code
```

## Code Review

{Include code reviewer agent summary}

**Standards Verified**:
- ✅ Testing standards (TESTING_STANDARD.md)
- ✅ Coding standards (CLAUDE.md)
- ✅ Definition of Done

**Auto-Fixes Applied**:
{List any auto-fixes, or "None"}

**Gemini Review**:
- Files reviewed: {count}
- Issues found: {count or "None"}
{If issues: list with severity}

**Non-Blocking Suggestions**:
{List suggestions from review, or "None"}

## Checklist

- [x] Tests pass
- [x] Code linted
- [x] Code formatted
- [x] TypeScript compiles
- [x] Documentation updated (if applicable)
- [x] Conventional commit message
- [x] Issue reference included

Closes #{issue-number}
```

**Variables to fill**:
- `{Summary}`: From issue planning notes or commit body
- `{Changes}`: Extract from git diff and commit message
- `{Test Types}`: Check which test files were added
- `{Testing Approach}`: Analyze test files for resource usage
- `{Code Review}`: Use code reviewer agent output
- `{issue-number}`: From branch name or commits

#### Step 7: Push and Create PR

Push the branch and create the pull request:

```bash
# Push branch to remote
git push origin $(git branch --show-current)

# Create PR with gh CLI
gh pr create \
  --title "$(git log -1 --pretty=%s)" \
  --body "$(cat <<'EOF'
{PR body from Step 6}
EOF
)"
```

**PR Title**: Use the commit subject line (first line of squashed commit)

**PR Labels** (auto-apply based on type):
- `feat/*` → label: `enhancement`
- `fix/*` → label: `bug`
- `docs/*` → label: `documentation`
- `refactor/*` → label: `refactoring`
- `test/*` → label: `testing`

**Additional labels** (if applicable):
- `breaking-change` (if breaking changes noted)
- `needs-review` (always)

#### Step 8: Update Project Board Status

Move the issue from "In Progress" to "Review & Testing" on the project board:

```bash
# Get the issue number from branch name or commits
ISSUE_NUMBER=$(git log -1 --pretty=%B | grep -oP '(?<=#)\d+')

# Update issue status to "Review & Testing" using gh CLI
gh project item-edit 7 --owner happyvertical \
  --field-name "Status" --text "Review & Testing" \
  --id $(gh api graphql -f query='
    query($org: String!, $repo: String!, $number: Int!) {
      repository(owner: $org, name: $repo) {
        issue(number: $number) {
          projectItems(first: 10) {
            nodes {
              id
            }
          }
        }
      }
    }' -f org=happyvertical -f repo=sdk -F number=$ISSUE_NUMBER --jq '.data.repository.issue.projectItems.nodes[0].id')
```

**Note**: Project number 7 is the "Development Workflow" project for happyvertical organization.

**Manual alternative**:
- If gh CLI commands fail, note in PR description that review is requested
- Update project board manually via GitHub web UI: https://github.com/orgs/happyvertical/projects/7
- Continue with SOP

**Verify update**:
- Confirm issue appears in "Review & Testing" column on project board
- If update fails: Note failure, continue (board can be updated manually later)

#### Step 9: Return to Main Branch

After PR created, return to main branch:

```bash
# Checkout main
git checkout main

# Pull latest (in case main was updated)
git pull origin main

# Inform user
echo "✅ PR created: {PR URL}"
echo "✅ Returned to main branch"
echo "You can continue with other work or wait for review feedback"
```

**Leave feature branch**:
- Feature branch remains on remote for review
- User can return to it if review feedback requires changes
- Branch will be deleted automatically after PR merge (GitHub setting)

#### SOP Checklist

Use this checklist to verify PR SOP completion:

**Pre-PR Checks**:
- [ ] On feature branch (not main)
- [ ] All commits made
- [ ] Work complete and ready for review

**Quality Checks**:
- [ ] Lint passed (or auto-fixed)
- [ ] Format passed (or auto-fixed)
- [ ] TypeScript compiles
- [ ] All tests pass

**Code Review** (before squashing):
- [ ] Testing standards verified
- [ ] Coding standards verified
- [ ] Definition of Done checked
- [ ] Gemini review completed (non-trivial files)
- [ ] No blocking issues remain
- [ ] Auto-fixes applied and committed (if any)

**Final Commit** (after code review):
- [ ] All commits squashed to single commit
- [ ] Conventional commit message format
- [ ] Issue reference in commit message

**PR Creation**:
- [ ] Branch pushed to remote
- [ ] PR created with comprehensive body
- [ ] PR title from commit subject
- [ ] Labels applied
- [ ] Issue will be closed on merge
- [ ] Project board updated (issue moved to "Review & Testing")

**Cleanup**:
- [ ] Returned to main branch
- [ ] User informed of PR URL
- [ ] Ready for next task

#### Exception Handling

**Not on Feature Branch**:
- Stop immediately
- Message: "You're on {branch}. Please create a feature branch first."
- Reference "Start Work on Issue" SOP

**Quality Checks Fail (Non-Auto-Fixable)**:
- Stop immediately
- Show errors clearly
- Message: "Fix {lint/typecheck/tests} errors and try again"
- Do not create PR

**Code Review Finds Blocking Issues**:
- Stop immediately
- Show code review report
- List each blocking issue with file:line
- Message: "Fix {N} blocking issues and run review again"
- Provide option to re-run just code review (skip quality checks if already passed)

**Git Push Fails**:
- Common reason: Remote branch has been updated
- Message: "Remote branch updated. Pull changes first:"
- Suggest: `git pull origin {branch} --rebase`
- Do not create PR until push succeeds

**PR Creation Fails**:
- Check if PR already exists for this branch
- If exists: Message: "PR already exists: {URL}. Update it with `git push --force-with-lease`"
- If gh CLI error: Show error, suggest manual PR creation via GitHub web UI

**Gemini MCP Not Available**:
- Warning (not blocking)
- Skip Gemini review, continue with other checks
- Note in PR body: "⚠️ Gemini review skipped (MCP server unavailable)"
- Recommend manual review

#### Post-PR Workflow

After PR created, typical workflows:

**Scenario 1: Review Feedback Received**
```bash
# Return to feature branch
git checkout {feature-branch}

# Make requested changes
# ... edit files ...

# Run quality checks again
npm run lint && npm run format && npm test

# Commit changes
git add .
git commit -m "fix: address review feedback"

# Run code review again
# {invoke code-reviewer agent}

# Push to update PR
git push origin {feature-branch}

# Return to main
git checkout main
```

**Scenario 2: Start New Issue While Waiting**
```bash
# Already on main from PR SOP
# Start new issue (triggers "Start Work on Issue" SOP)

# User says: "Let's work on #456"
# {SOP creates new feature branch, begins work}
```

**Scenario 3: PR Approved and Merged**
```bash
# GitHub merges PR (squash merge)
# GitHub deletes remote branch (if configured)

# Update local main
git checkout main
git pull origin main

# Delete local feature branch
git branch -d {feature-branch}

# Continue with other work
```

#### Tips for Claude

- **Trigger proactively**: When user indicates work complete, start SOP automatically
- **Be thorough**: Don't skip quality checks or code review
- **Auto-fix aggressively**: Fix lint/format issues without asking
- **Stop on errors**: Don't create PR if quality checks fail
- **Clear feedback**: Show exactly what needs fixing if issues found
- **Comprehensive PR body**: Include all context for reviewers
- **Clean up**: Always return to main after PR created

### Git Branching Strategy

**IMPORTANT**: Never push directly to `main`. Always use feature branches and pull requests.

**Branch Naming Convention**:
```
feat/issue-XXX-short-description      # New features
fix/issue-XXX-short-description       # Bug fixes
docs/issue-XXX-short-description      # Documentation updates
refactor/issue-XXX-short-description  # Code refactoring
test/issue-XXX-short-description      # Test additions/updates
```

**Workflow**:
```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feat/issue-210-smrt-advisor-mcp

# 2. Make changes and commit
git add .
git commit -m "feat(smrt): implement advisor MCP server"

# 3. Push feature branch
git push origin feat/issue-210-smrt-advisor-mcp

# 4. Create Pull Request via GitHub CLI or web interface
gh pr create --title "feat(smrt): implement advisor MCP server" --body "Closes #210"

# 5. After PR approval and merge, delete feature branch
git checkout main
git pull origin main
git branch -d feat/issue-210-smrt-advisor-mcp
```

### GitHub Issue Management

When creating Pull Requests, use closing keywords in the PR description or commit messages to automatically close related issues when the PR is merged:

- `closes #123` - Closes issue #123 when PR is merged
- `fixes #123` - Closes issue #123 when PR is merged
- `resolves #123` - Closes issue #123 when PR is merged

Example PR description:
```
## Summary
Implement user authentication system

## Changes
- Add login/logout functionality
- Implement JWT token management
- Add user session handling

Closes #45
Fixes #67
```

This ensures issues are automatically moved through the workflow and closed when work is complete.

### AI-Powered Issue Triage

New issues are automatically triaged using GitHub Models API to streamline the initial review process.

**Automated Triage Process**:
1. **Workflow Trigger**: When an issue is opened or reopened
2. **AI Analysis**: GitHub Models (GPT-4o-mini) analyzes the issue content
3. **Auto-Labeling**: Type labels applied automatically (type:bug, type:feature, etc.)
4. **Duplicate Detection**: Searches for similar existing issues
5. **Triage Comment**: Posts AI analysis with reasoning
6. **Urgent Routing**: Critical bugs/security issues move to "To Do" status automatically

**Triage Comment Format**:
```markdown
## 🤖 AI Triage

**Type**: `bug|feature|enhancement|tech-debt|epic|documentation|question`
**Priority**: `critical|high|medium|low`
**Urgency**: `urgent|normal`

**Affected Packages**: List of @have/ packages identified

**Analysis**: Brief explanation of the triage decision

### ⚠️ Potential Duplicates (if found)
- #123: Similar issue title
```

**Overriding AI Decisions**:
- Labels can be manually adjusted after triage
- Project status can be changed if AI routing is incorrect
- The triage comment serves as a starting point, not a final decision

**Workflow Files**:
- `.github/workflows/on-issue-opened.yml` - Workflow definition
- `.github/scripts/triage-issue.js` - Triage logic

**See Also**: [Kanban Workflow](./notes/workflow/KANBAN.md) for complete issue lifecycle

## Tooling Configuration

- **TypeScript**: Configured for ES2022 with strict type checking
- **Biome**: Used for linting and formatting
- **Bun**: Package management with workspace support
- **Vitest**: Testing framework
- **Changesets**: Used for versioning and publishing packages
- **TypeDoc**: Used for generating API documentation

## Documentation

The SDK includes automatic API documentation generation using TypeDoc. The documentation is stored in the `docs/manual` directory and can be viewed by opening `docs/manual/index.html` in a browser.

Documentation is generated as part of the build process, but can also be generated separately:

```bash
npm run docs
```

The build pipeline integrates documentation generation after all packages are built and before repomix is run:

```bash
npm run build  # Includes documentation generation
```

This repository is designed to support building AI agents with minimal overhead and maximum flexibility.

## Communication Guidelines

### Using the Wizard for Questions

**ALWAYS use the AskUserQuestion wizard when asking clarifying questions.** Never ask questions in plain text.

The wizard provides:
- Structured, easy-to-answer questions
- Multiple choice options with clear descriptions
- Multi-select support for non-exclusive choices
- Better user experience than reading paragraphs of questions

**Examples of when to use the wizard**:
- Clarifying requirements during planning
- Asking about implementation approach
- Getting architectural decisions
- Confirming scope or priorities
- Resolving ambiguities in issues

**How to use the wizard**:
```typescript
// Use AskUserQuestion tool with 1-4 questions
// Each question has a header (max 12 chars), question text, and 2-4 options
// Each option has a label and description
```

**Exception**: Do not use the wizard for simple yes/no confirmations or when context makes the answer obvious.

## Agent Orchestration Guidelines

When working with multiple agents in the HAVE SDK, follow these orchestration patterns:

### Delegation Patterns

**Sequential Pattern** - Use when tasks have clear dependencies:
1. First agent completes foundation work
2. Next agent builds on previous output
3. Final agent refines or validates results

Example: `agent-reviewer` → `agent-trainer` (review first, then train based on findings)

**Parallel Pattern** - Use when tasks can be done independently:
1. Delegate multiple non-dependent tasks simultaneously
2. Coordinate results at completion

Example: Multiple domain agents analyzing different packages concurrently

**Hierarchical Pattern** - Use when tasks have sub-components:
1. Break down into major components
2. Delegate sub-components to specialized agents
3. Integrate results at each level

### Specialized Agents

The SDK includes specialized agents for specific workflows:

#### Code Reviewer Agent

**Purpose**: Automated code review before PR creation

**Location**: `.claude/agents/code-reviewer.md`

**Responsibilities**:
- Verify testing standards (TESTING_STANDARD.md)
- Verify coding standards (CLAUDE.md)
- Check Definition of Done
- Coordinate Gemini code review (via MCP)
- Auto-fix issues when possible

**When to Use**:
- Automatically invoked by "Create PR" SOP
- Before pushing changes to remote
- Can be invoked manually for pre-PR review

**Example**:
```typescript
// Invoked automatically by PR SOP
// User says: "ready to create PR"
// Claude runs code-reviewer agent before pushing
```

See [Code Reviewer Agent](./.claude/agents/code-reviewer.md) for complete documentation.

### Best Practices for Multi-Agent Coordination

- **Single Responsibility**: Each agent should focus on one domain
- **Clear Handoffs**: Pass relevant context between agent delegations
- **Avoid Redundancy**: Don't have multiple agents doing the same work
- **Validate Integration**: Ensure combined outputs meet requirements
- **Use TodoWrite**: Track complex multi-step workflows
- **Proactive Use**: Use specialized agents (like code-reviewer) automatically when appropriate

### Agent Performance Tracking

All agents sign their commits using `type(agent-name):` format, enabling:
- Performance analysis via `git log --grep="(agent-name):"`
- Error pattern detection through fix-to-feat ratios
- Continuous improvement based on actual performance

### When to Delegate

Delegate to specialized agents when:
- The task matches an agent's specific expertise
- Multiple domains need coordination
- Systematic review or updates are needed
- Complex workflows require specialized knowledge

Direct implementation is preferred when:
- The task is straightforward and within general capabilities
- No specialized domain knowledge is required
- The overhead of delegation exceeds the benefit

## MCP Server Management

### Installation Guidelines

When adding MCP servers to the project:
- **Use the mcp-server-manager agent** - Always delegate MCP server setup to this specialized agent
- **Prefer bridge scripts** - Create nix-friendly bridge scripts in `scripts/mcp-servers/`
- **Use pnpm** - All package management should use pnpm, not npm or yarn
- **Nix compatibility** - Ensure all scripts use `/usr/bin/env` in shebangs
- **Local installation** - Install servers locally within the project when possible
- **Avoid global dependencies** - Keep dependencies project-scoped for reproducibility

### Bridge Script Pattern

MCP servers should be wrapped in bridge scripts that:
1. Handle connection setup and health monitoring
2. Use localhost-only binding for security
3. Implement proper error handling and cleanup
4. Are nix-friendly with proper shebangs
5. Use pnpm for any package operations

Example structure:
```bash
#!/usr/bin/env bash
# Bridge script for MCP server
# Uses pnpm for package management
# Implements health checks and error handling
``` 