---
name: backlog
description: Process all issues in "Backlog" status assigned to me
usage: /backlog [notes]
---

# Backlog Lane Command

Processes all issues in the "Backlog" status that are assigned to the current user.

## Usage
```
/backlog
/backlog "all in the same pr"
```

## Description
This command:
1. Finds all issues in "Backlog" status assigned to you
2. Runs `/issue` command on each one
3. Applies Definition of Ready validation
4. Moves ready issues to "To Do" status
5. Adds missing DoR elements for incomplete issues

## Behavior
- Reviews and completes Definition of Ready criteria
- Adds acceptance criteria if missing
- Creates implementation gameplans
- Provides estimates
- Groups related issues for efficient processing

## Notes Parameter
Optional notes guide how to process the issues:
- "all in the same pr" - Plan to implement multiple issues together
- "quick DoR" - Add minimal viable DoR elements
- "detailed planning" - Create comprehensive implementation plans
- "prioritize by effort" - Process smallest issues first

## Example
```
/backlog "group by component"
```