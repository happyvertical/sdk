---
name: issues-review
description: Process all issues in "Review & Testing" status assigned to me
usage: /issues-review [notes]
---

# Review & Testing Lane Command

Processes all issues in the "Review & Testing" status that are assigned to the current user.

## Usage
```
/issues-review
/issues-review "address feedback"
```

## Description
This command:
1. Finds all issues in "Review & Testing" status assigned to you
2. Runs `/issue` command on each one
3. Checks PR review status and CI results
4. Addresses feedback or moves to next stage
5. Updates to "Ready for Deployment" when approved

## Behavior
- Reviews PR status and feedback
- Implements requested changes
- Validates CI/CD pipeline status
- Ensures all review requirements met
- Moves to next stage when ready

## Notes Parameter
Optional notes guide how to process the issues:
- "address feedback" - Focus on implementing review comments
- "merge when ready" - Advance approved PRs
- "check CI status" - Review failing tests or builds
- "ping reviewers" - Follow up on pending reviews

## Example
```
/issues-review "implement review suggestions"
```