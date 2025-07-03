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
- For ready issues: check acceptance criteria, estimates, gameplan, no blockers
- If Definition of Ready is NOT met: add comment explaining what's needed
- If Definition of Ready IS met:
  - Create feature branch from main (`feature/<issue-description>`)
  - Automatically assign to self
  - Update project status to "In Progress"
  - Begin full implementation following the agreed gameplan

**IN PROGRESS:**
- Check for review comments or feedback
- If re-running, implement requested changes
- If ready, create PR but keep status as "In Progress" during review
- Continue iterating based on feedback until PR is merged

**DONE:**
- Check for production issues or follow-up work needed
- Create follow-up issues if bugs are found
- Archive or close if completely stable

## Re-run Behavior
When run again on the same issue, checks for new comments/feedback and acts accordingly:
- Implements requested changes
- Addresses review feedback
- Updates based on new information

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