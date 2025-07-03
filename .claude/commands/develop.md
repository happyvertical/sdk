---
name: develop
description: Process all issues in "Developing" status assigned to me
usage: /develop [notes]
---

# Develop Lane Command

Processes all issues in the "Developing" status that are assigned to the current user.

## Usage
```
/develop
/develop "create PRs when ready"
```

## Description
This command:
1. Finds all issues in "Developing" status assigned to you
2. Runs `/issue` command on each one
3. Checks implementation progress
4. Creates PRs when work is complete
5. Moves to "Quality Assurance" when PR is opened

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
/develop "finalize and create PRs"
```