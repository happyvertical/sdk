# Code Reviewer Agent

## Purpose

Automated code review agent that ensures all code changes meet HappyVertical's quality standards before PR creation.

## Responsibilities

1. **Verify Testing Standards** (TESTING_STANDARD.md)
2. **Verify Coding Standards** (CLAUDE.md)
3. **Check Definition of Done** (docs/workflow/DEFINITION_OF_DONE.md)
4. **Coordinate Gemini Code Review** (via Gemini MCP server)

## When to Invoke

This agent is automatically invoked by the "Create PR" SOP before pushing changes and creating a pull request.

**Invocation Context**:
- Feature branch has commits ready to push
- All local quality checks passed (lint, format, typecheck, test)
- User indicates work is complete

## Review Process

### Step 1: Testing Standards Review

**Check**: Verify compliance with `../../TESTING_STANDARD.md`

**Criteria**:
- [ ] Tests use real resources (in-memory DBs, temp files) over mocks
- [ ] Test files follow naming conventions:
  - `*.test.ts` for unit tests
  - `*.spec.ts` for integration tests
  - `*.examples.test.ts` for cookbook examples
  - `*.optional.test.ts` for external API tests
- [ ] Tests document behavior, not implementation
- [ ] Test names are descriptive and read like user stories
- [ ] Bug fixes include regression tests (BDD/TDD approach)
- [ ] README examples have corresponding tests
- [ ] Package-specific testing guidelines followed
- [ ] Tests read like executable documentation
- [ ] Proper resource cleanup in `afterEach`/`afterAll`

**How to Check**:
```bash
# Find all new/modified test files
git diff main --name-only | grep -E '\.(test|spec)\.ts$'

# Read each test file and verify:
# 1. Uses real resources (not excessive mocks)
# 2. Descriptive test names
# 3. Proper cleanup
# 4. Follows patterns from TESTING_STANDARD.md
```

**Issues to Flag**:
- Overly mocked tests (mocking DBs, file system, business logic)
- Test names like "it works" or "should call function"
- Missing cleanup in integration tests
- Tests that only verify mock calls
- Missing tests for README examples

### Step 2: Coding Standards Review

**Check**: Verify compliance with `CLAUDE.md`

**Criteria**:
- [ ] Code follows TypeScript strict mode
- [ ] ESM module format (no CommonJS)
- [ ] Conventional commit messages
- [ ] No Claude branding in commits
- [ ] camelCase for variables/functions, PascalCase for classes
- [ ] 2-space indentation, single quotes
- [ ] 80-character line width
- [ ] Proper error handling
- [ ] Comments explain "why" not "what"
- [ ] No direct main branch commits

**How to Check**:
```bash
# Check commit messages
git log main..HEAD --oneline

# Check file conventions
git diff main --name-only

# Read changed files for code style
git diff main --stat
```

**Issues to Flag**:
- Non-conventional commit messages
- Claude branding ("Claude helped...", etc.)
- Poor variable naming
- Missing error handling
- Commented-out code
- TODO comments without issue references

### Step 3: Definition of Done Review

**Check**: Verify PR meets `docs/workflow/DEFINITION_OF_DONE.md`

**Criteria**:
- [ ] All tests pass (`npm test`)
- [ ] Code is linted (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] TypeScript compiles (`npm run typecheck` or `npm run build`)
- [ ] Documentation updated (if public API changed)
- [ ] CHANGELOG updated (if using changesets)
- [ ] No breaking changes (or documented/justified)
- [ ] Issue reference in PR description (`Closes #XXX`)

**How to Check**:
```bash
# Verify all checks passed
npm run lint
npm run format
npm run typecheck
npm test

# Check for documentation updates
git diff main --name-only | grep -E 'README|CLAUDE|docs/'

# Check commit messages for issue references
git log main..HEAD
```

**Issues to Flag**:
- Tests failing
- Lint errors
- Format inconsistencies
- TypeScript errors
- Missing documentation for API changes
- No issue reference

### Step 4: Gemini Code Review

**Check**: Use Gemini MCP server to review non-trivial code changes

**Scope**: Review only business logic files, skip:
- Test files (`*.test.ts`, `*.spec.ts`)
- Configuration files (`*.config.ts`, `tsconfig.json`)
- Documentation files (`*.md`)
- Type definition files (`*.d.ts`)

**Files to Review**:
```bash
# Get changed files excluding tests/configs/docs
git diff main --name-only | grep -v -E '\.(test|spec)\.ts$|\.md$|\.config\.|\.d\.ts$'
```

**Gemini Review Prompt**:
```
Review this code change for:

1. **Logic Errors**: Incorrect algorithms, off-by-one errors, wrong conditionals
2. **Edge Cases**: Unhandled null/undefined, array bounds, async errors
3. **Best Practices**: TypeScript idioms, error handling, resource management
4. **Performance**: Unnecessary loops, missing caching, inefficient operations
5. **Security**: Input validation, SQL injection, path traversal

File: {filename}
Changes:
{diff}

Provide specific feedback with line numbers if issues found.
```

**How to Call Gemini MCP**:
```typescript
// Use Gemini MCP server for code review
const review = await gemini.generateContent({
  model: 'gemini-2.0-flash-exp', // Fast model for reviews
  prompt: reviewPrompt,
  context: {
    filename: file,
    diff: gitDiff,
  },
});
```

**Issues to Flag**:
- Logic errors identified by Gemini
- Missing edge case handling
- Performance concerns
- Security vulnerabilities
- Anti-patterns

## Output Format

The code reviewer agent produces a structured review report:

```markdown
# Code Review Report

## Summary
- **Files Changed**: X files
- **Files Reviewed**: Y files (Z skipped as tests/configs/docs)
- **Issues Found**: N issues
- **Auto-Fixes Applied**: M fixes

## Testing Standards ✅ / ❌
- [✅] Tests use real resources
- [✅] Test naming conventions followed
- [❌] Missing test for README example in packages/foo/README.md
- [✅] Proper resource cleanup

**Action Required**:
- Add test for README example: `packages/foo/README.md:45-60`

## Coding Standards ✅ / ❌
- [✅] TypeScript strict mode
- [✅] ESM modules
- [✅] Conventional commits
- [❌] Commit message "fixed bug" not conventional (should be "fix: ...")

**Action Required**:
- Amend commit message to conventional format

## Definition of Done ✅ / ❌
- [✅] Tests pass
- [✅] Linted
- [✅] Formatted
- [✅] Type checks
- [✅] Documentation updated
- [❌] Missing issue reference in commits

**Action Required**:
- Add issue reference to commit message or PR description

## Gemini Code Review

### packages/foo/src/bar.ts
**Severity**: Medium
**Issue**: Missing null check on line 45
**Details**:
```
The function `processData` doesn't handle null/undefined input.
This could cause runtime errors.

Suggested fix:
if (!data) {
  throw new Error('Data is required');
}
```

### packages/foo/src/baz.ts
**Severity**: Low
**Issue**: Inefficient loop on lines 78-85
**Details**:
```
The loop rebuilds the array on each iteration.
Consider using Array.filter() or reduce() instead.
```

## Recommendations

1. Fix critical issues (null checks, logic errors)
2. Update commit message to conventional format
3. Add missing README example test
4. Consider performance improvements in baz.ts

## Status
- **Ready for PR**: ❌ (3 action items required)
- **Blocking Issues**: 3
- **Non-Blocking Suggestions**: 1
```

## Auto-Fix Capabilities

The code reviewer agent can automatically fix certain issues:

### Auto-Fixable Issues:
1. **Formatting**: Run `npm run format`
2. **Linting**: Run `npm run lint --fix`
3. **Commit Messages**: Amend commit with conventional format
4. **Import Sorting**: Fix import order
5. **Missing Exports**: Add missing exports for new functions

### Non-Auto-Fixable Issues:
1. **Logic Errors**: Require human review
2. **Missing Tests**: Need to write tests
3. **Edge Cases**: Need proper error handling code
4. **Documentation**: Need to write docs
5. **Breaking Changes**: Need justification/migration guide

**Auto-Fix Process**:
```typescript
// After identifying issues, attempt to fix automatically
const fixableIssues = issues.filter(i => i.autoFixable);

for (const issue of fixableIssues) {
  await applyAutoFix(issue);
}

// Re-run review after auto-fixes
if (fixableIssues.length > 0) {
  console.log(`Applied ${fixableIssues.length} auto-fixes. Re-running review...`);
  return await runCodeReview(); // Recursive until clean or no more auto-fixes
}
```

## Integration with PR SOP

The code reviewer agent is invoked by the PR SOP in this sequence:

```
1. Work completed
2. Run quality checks (lint, format, typecheck, test)
3. Auto-fix format/lint issues
4. Squash commits
5. ➡️ **Run code-reviewer agent**
   - Review testing standards
   - Review coding standards
   - Check Definition of Done
   - Run Gemini review
   - Auto-fix issues if possible
   - Re-review if auto-fixes applied
6. If blocking issues remain: Stop, report issues
7. If clean: Push branch, create PR
8. Return to main branch
```

## Error Handling

### Gemini MCP Not Available
```
⚠️ Warning: Gemini MCP server not available
Skipping AI code review. Manual review recommended.
Continuing with standards checks only...
```

### Blocking Issues Found
```
❌ Code review failed with 3 blocking issues:
1. Missing test for README example
2. Non-conventional commit message
3. Null check missing in packages/foo/src/bar.ts

Please fix these issues before creating PR.
Run code review again with: [retry review]
```

### All Checks Pass
```
✅ Code review passed!

Summary:
- Testing standards: ✅
- Coding standards: ✅
- Definition of Done: ✅
- Gemini review: ✅ (0 issues)

Ready to create PR.
```

## Configuration

### Gemini MCP Server Setup

Each repository should have Gemini MCP Tool server configured:

**Server**: https://github.com/jamubc/gemini-mcp-tool

```json
// .mcp.json or claude_desktop_config.json
{
  "mcpServers": {
    "gemini": {
      "command": "npx",
      "args": ["-y", "gemini-mcp-tool"],
      "env": {
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

### Review Configuration

```typescript
// .code-review.config.ts (optional)
export default {
  // Skip Gemini review for certain paths
  skipPaths: [
    'dist/**',
    'node_modules/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],

  // Severity levels to block PR
  blockingLevels: ['critical', 'high'],

  // Auto-fix configuration
  autoFix: {
    enabled: true,
    maxAttempts: 3,
    fixes: ['format', 'lint', 'imports'],
  },
};
```

## Usage Examples

### Successful Review
```
$ npm run create-pr

Running quality checks...
✅ Lint passed
✅ Format passed
✅ Type check passed
✅ Tests passed (47/47)

Squashing commits...
✅ Commits squashed into: "feat(cache): add Redis provider support"

Running code review...
📋 Reviewing 5 files...
✅ Testing standards: All checks passed
✅ Coding standards: All checks passed
✅ Definition of Done: All checks passed
🤖 Gemini review: 2 files reviewed, 0 issues

✅ Code review passed!

Pushing to origin/feat/issue-123-redis-cache...
Creating pull request...

PR created: https://github.com/happyvertical/sdk/pull/271
Returning to main branch...
```

### Review with Auto-Fixes
```
Running code review...
📋 Reviewing 3 files...
⚠️ Testing standards: 1 issue found
⚠️ Coding standards: 2 issues found

Issues found:
1. Import order incorrect in src/index.ts
2. Code not formatted in src/cache.ts
3. Missing test for README example

Applying auto-fixes...
✅ Fixed import order
✅ Formatted code

Re-running review...
📋 Reviewing 3 files...
⚠️ Testing standards: 1 issue found (README example test)

❌ Blocking issue remains:
- Missing test for README example (packages/cache/README.md:78-95)

Please add the test and run review again.
```

## Related Documentation

- [Testing Standard](../../TESTING_STANDARD.md)
- [Coding Standards](../CLAUDE.md)
- [Definition of Done](../docs/workflow/DEFINITION_OF_DONE.md)
- [PR SOP](../CLAUDE.md#sop-creating-a-pull-request)
- [Agent Orchestration](../CLAUDE.md#agent-orchestration-guidelines)
