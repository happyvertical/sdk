---
name: issues-new
description: Process all issues in "New Issues" status assigned to me
usage: /issues-new [notes]
---

# New Issues Lane Command

Processes all issues in the "New Issues" status that are assigned to the current user.

## Usage
```
/issues-new
/issues-new "triage and prioritize"
```

## Description
This command:
1. Finds all issues in "New Issues" status assigned to you
2. Runs `/issue` command on each one
3. Performs initial triage and assessment
4. Moves valid issues to appropriate next status (Backlog/Icebox)
5. Closes or requests clarification for invalid issues

## Behavior
- Reviews issue clarity and completeness
- Checks for duplicates
- Assesses project relevance
- Determines initial priority
- Moves to Backlog (default) or Icebox (low priority)

## Notes Parameter
Optional notes guide how to process the issues:
- "quick triage" - Fast assessment, default to backlog
- "deep review" - Thorough analysis with detailed comments
- "close stale" - Be aggressive about closing unclear issues

## Example
```
/issues-new "prioritize security issues"
```