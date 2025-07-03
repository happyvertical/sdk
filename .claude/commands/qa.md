---
name: qa
description: Process all issues in "Quality Assurance" status assigned to me
usage: /qa [notes]
---

# Quality Assurance Lane Command

Processes all issues in the "Quality Assurance" status that are assigned to the current user.

## Usage
```
/qa
/qa "address feedback"
```

## Description
This command:
1. Finds all issues in "Quality Assurance" status assigned to you
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
/qa "implement review suggestions"
```