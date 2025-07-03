---
name: issue
description: Smart issue management - analyze and advance issues through workflow, or create new issues
usage: /issue <issue_number> OR /issue "<description>"
---

# Issue Workflow Command

Analyzes the current state of a GitHub issue and automatically advances it to the next appropriate workflow stage, or creates a new issue from a description.

## Usage
```
/issue <issue_number>
/issue "<description>"
```

### Create New Issue
When passed a string description instead of a number:
- Analyze the description to understand the request
- Generate appropriate title, body, and labels
- Create the issue using `gh issue create`
- Add to project board with "Todo" status
- Return the new issue number and URL

### Manage Existing Issue
When passed an issue number:

## Behavior by Current Status

**TODO (including new, backlog, ready items):**
- Search for duplicates using title keywords
- Assess clarity and completeness of the issue
- Check Definition of Ready per docs/workflow/DEFINITION_OF_READY.md
- For new/unclear issues: assess validity, request info, or mark ready for development
- For ready issues: perform comprehensive DoR validation:
  1. **User Story Validation**: Check if follows "As a... I want... so that..." format (for features)
  2. **Acceptance Criteria**: Verify specific, testable conditions exist
  3. **Implementation Gameplan**: Ensure technical approach is documented
  4. **Estimation**: Check for size estimate (S/M/L or story points)
  5. **No Blockers**: Verify dependencies are resolved
  6. **Test Scenarios**: Ensure test considerations are outlined
- If Definition of Ready is NOT met: 
  - Add detailed comment explaining specific missing criteria
  - Generate suggestions for missing elements
  - Keep issue in current status
- If Definition of Ready IS met:
  - **Validate Git State**: Check working directory is clean with `git status`
  - **Create feature branch**: Use format `issue-{number}-{short-description}` (max 50 chars)
    - Sanitize description: remove special chars, convert spaces to hyphens
    - Example: `issue-23-claude-commands-validation`
  - **Check branch existence**: Verify branch doesn't already exist with `git branch --list`
  - **Validate status transition**: Ensure move to "In Progress" is valid per workflow
  - Automatically assign to self
  - Update project status to "In Progress"
  - Begin full implementation following the agreed gameplan

**IN PROGRESS:**
- Check for review comments or feedback
- If re-running, implement requested changes
- **Conflict Detection**: Check for other PRs addressing the same issue
- If ready, create PR but keep status as "In Progress" during review
- Continue iterating based on feedback until PR is merged
- **Rollback Instructions**: If implementation fails:
  - Save current work: `git stash`
  - Return to master: `git checkout master`
  - Delete branch if needed: `git branch -D issue-{number}-*`
  - Update issue status back to "To Do" with explanation

**DONE:**
- Check for production issues or follow-up work needed
- Create follow-up issues if bugs are found
- Archive or close if completely stable

## Re-run Behavior
When run again on the same issue, checks for new comments/feedback and acts accordingly:
- Implements requested changes
- Addresses review feedback
- Updates based on new information
- **Status Validation**: Verify current status before attempting any transitions
- **Error Recovery**: If previous run failed, provide clear recovery options

## Validation Safeguards

### Git State Validation
- Always check `git status` before branch operations
- Ensure no uncommitted changes exist
- Verify on correct base branch (master/main)

### Branch Naming Convention
- Format: `issue-{number}-{short-description}`
- Max length: 50 characters
- Sanitize special characters
- Check existence before creation

### Definition of Ready Checklist
Before moving to "In Progress", validate all 7 criteria:
1. ✓ User Story / Problem Statement
2. ✓ Acceptance Criteria
3. ✓ Implementation Gameplan
4. ✓ Design Assets (if applicable)
5. ✓ Estimation
6. ✓ No Blockers
7. ✓ Testing Considerations

### Status Transition Rules
- Only move from "To Do" → "In Progress" if DoR met
- Validate transitions follow workflow rules
- Prevent duplicate status changes
- Log all status changes with reasons

## Examples

### Managing existing issue
```
/issue 1
```
This will analyze issue #1, determine its current project Status (Todo/In Progress/Done), and take the appropriate action to advance it through the simplified workflow.

### Creating new issue
```
/issue "Add dark mode toggle to user settings"
```
This will create a new issue with an appropriate title and body, apply initial labels, and return the issue number.

```
/issue "The login form doesn't work on mobile Safari - users can't submit credentials"
```
This will create a bug report with relevant details and appropriate bug labels.