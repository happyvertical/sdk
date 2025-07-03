---
name: issues-icebox
description: Process all issues in "Icebox" status assigned to me
usage: /issues-icebox [notes]
---

# Icebox Lane Command

Processes all issues in the "Icebox" status that are assigned to the current user.

## Usage
```
/issues-icebox
/issues-icebox "review for relevance"
```

## Description
This command:
1. Finds all issues in "Icebox" status assigned to you
2. Runs `/issue` command on each one
3. Reviews continued relevance
4. Either promotes to Backlog, keeps in Icebox, or closes

## Behavior
- Checks if issue is still relevant to project goals
- Reviews for changed priorities
- Assesses if blockers have been resolved
- Updates or closes stale issues

## Notes Parameter
Optional notes guide how to process the issues:
- "promote ready" - Look for issues ready to move to backlog
- "close stale" - Close issues older than 6 months
- "update context" - Add fresh analysis to old issues

## Example
```
/issues-icebox "review Q1 priorities"
```