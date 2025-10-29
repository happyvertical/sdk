# SOP: Creating a Pull Request

**IMPORTANT**: This SOP should be followed automatically when work is complete, before pushing changes.

**Related Standards**:
- [Organization-Wide Testing Standard](../../TESTING_STANDARD.md) - Enforced by code reviewer
- [Definition of Done](./DEFINITION_OF_DONE.md) - Verified before PR creation
- [Code Reviewer Agent](../../.claude/agents/code-reviewer.md) - Automated review process

## When This SOP Triggers

**TRIGGER AUTOMATICALLY**: This SOP should run **automatically** without waiting for explicit user request when:
- All implementation work is complete
- All commits are made
- Tests are passing
- Work appears ready for review based on context

**Also trigger** when user explicitly indicates:
- "ready", "done", "create PR", "push", "ready for review"

**DO NOT trigger** when:
- Work is still in progress
- Tests are failing
- User is experimenting or exploring
- User says to wait or not ready yet

## Step 1: Verify Work Completion

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

## Step 2: Run Quality Checks

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

## Step 3: Auto-Fix Issues (If Any)

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

## Step 4: Run Code Review Agent

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

## Step 5: Squash Commits

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

## Step 6: Create PR Body

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

## Step 7: Push and Create PR

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

## Step 8: Update Project Board Status

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

## Step 9: Return to Main Branch

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

## SOP Checklist

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

## Exception Handling

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

## Post-PR Workflow

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

## Tips for Claude

- **Trigger proactively**: When user indicates work complete, start SOP automatically
- **Be thorough**: Don't skip quality checks or code review
- **Auto-fix aggressively**: Fix lint/format issues without asking
- **Stop on errors**: Don't create PR if quality checks fail
- **Clear feedback**: Show exactly what needs fixing if issues found
- **Comprehensive PR body**: Include all context for reviewers
- **Clean up**: Always return to main after PR created
