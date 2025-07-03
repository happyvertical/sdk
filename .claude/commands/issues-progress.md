---
name: issues-progress
description: Process all issues in "In Progress" status assigned to me
usage: /issues-progress [notes]
---

# In Progress Lane Command

Processes all issues in the "In Progress" status that are assigned to the current user.

## Usage
```
/issues-progress
/issues-progress "create PRs when ready"
```

## Description
This command:
1. Finds all issues in "In Progress" status assigned to you
2. Runs `/issue` command on each one
3. Checks implementation progress
4. Creates PRs when work is complete
5. Moves to "Review & Testing" when PR is opened

## Behavior
- Reviews current implementation status
- Checks for completion of acceptance criteria
- Creates PRs with proper linking
- Handles any implementation feedback
- Updates status appropriately

## Notes Parameter
Optional notes guide how to process the issues:
- "create PRs when ready" - Open PRs for completed work
- "review feedback" - Focus on addressing review comments
- "continue implementation" - Push forward with active development
- "check blockers" - Review for any impediments

## Example
```
/issues-progress "finalize and create PRs"
```