---
name: todo
description: Process all issues in "To Do" status assigned to me
usage: /todo [notes]
---

# To Do Lane Command

Processes all issues in the "To Do" status that are assigned to the current user.

## Usage
```
/todo
/todo "start highest priority"
```

## Description
This command:
1. Finds all issues in "To Do" status assigned to you
2. Runs `/issue` command on each one
3. Validates Definition of Ready compliance
4. Creates feature branches and starts implementation
5. Moves issues to "Developing" status

## Behavior
- Final DoR validation before development
- Creates appropriately named feature branches
- Validates git state before branch creation
- Begins implementation following gameplan
- Updates status to "Developing"

## Notes Parameter
Optional notes guide how to process the issues:
- "start highest priority" - Begin with most important issue
- "smallest first" - Start with quickest wins
- "related issues together" - Group similar work
- "single branch" - Implement multiple issues in one branch

## Example
```
/todo "start bug fixes first"
```