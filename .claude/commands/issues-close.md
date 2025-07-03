---
name: issues-close
description: Process all issues in "Deployed" status assigned to me
usage: /issues-close [notes]
---

# Deployed/Close Lane Command

Processes all issues in the "Deployed" status that are assigned to the current user.

## Usage
```
/issues-close
/issues-close "monitor for issues"
```

## Description
This command:
1. Finds all issues in "Deployed" status assigned to you
2. Runs `/issue` command on each one
3. Monitors for production issues
4. Creates follow-up issues if needed
5. Closes stable, completed issues

## Behavior
- Monitors deployed changes for issues
- Validates production stability
- Creates follow-up bug reports if needed
- Closes completed issues
- Updates documentation if needed

## Notes Parameter
Optional notes guide how to process the issues:
- "monitor for issues" - Watch for production problems
- "close stable" - Close issues that are working well
- "create follow-ups" - Generate additional issues from learnings
- "update docs" - Ensure documentation reflects changes

## Example
```
/issues-close "verify production stability"
```