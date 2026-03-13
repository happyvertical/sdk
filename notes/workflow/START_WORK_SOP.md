# SOP: Starting Work on an Issue

**IMPORTANT**: This SOP should be followed automatically whenever beginning implementation work, whether explicitly asked or implied.

**Related Standards**:
- [Organization-Wide Testing Standard](../../TESTING_STANDARD.md) - Must be followed for all test writing
- [Definition of Ready](./DEFINITION_OF_READY.md) - Issue readiness criteria
- [Definition of Done](./DEFINITION_OF_DONE.md) - PR completion checklist

## When This SOP Triggers

This procedure triggers in these scenarios:
- User mentions implementing/working on an issue (e.g., "let's work on #270")
- User asks to start implementing a feature/fix
- Beginning any implementation work (even without explicit issue number)
- Returning to work after interruption

## Step 1: Verify Git State

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

## Step 2: Sync with Main Branch

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

## Step 3: Identify Issue(s) and Context

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

## Step 4: Create or Checkout Feature Branch

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

## Step 5: Update Project Board Status

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

## Step 6: Planning Phase (Interactive Mode Only)

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

## Step 7: Create Task List (If Applicable)

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

## Step 8: Begin Implementation

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
- Follow standard coding conventions from AGENT.md
- Follow testing standards from TESTING_STANDARD.md:
  - Use real resources (in-memory DBs, temp files) over mocks
  - Write tests that read like documentation
  - Ensure README examples have corresponding tests
  - Test behavior, not implementation

## Non-Interactive/CI Mode Behavior

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

## SOP Checklist

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

## Exception Handling

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

## Tips for Claude

- **Be proactive**: Don't wait for user to say "follow the SOP" - do it automatically
- **Be context-aware**: Detect if returning to existing work vs. starting fresh
- **Be communicative**: Inform user of each step ("Syncing with main...", "Creating feature branch...", etc.)
- **Be flexible**: If user shortcuts the process (e.g., already on correct branch), skip unnecessary steps
- **Use the wizard**: Never ask clarifying questions in plain text - always use AskUserQuestion
