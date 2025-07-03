---
name: deploy
description: Process all issues in "Deploying" status assigned to me
usage: /deploy [notes]
---

# Deploying Lane Command

Processes all issues in the "Deploying" status that are assigned to the current user.

## Usage
```
/deploy
/deploy "merge and deploy"
```

## Description
This command:
1. Finds all issues in "Deploying" status assigned to you
2. Runs `/issue` command on each one
3. Validates deployment readiness
4. Merges approved PRs
5. Moves to "Done" status after successful deployment

## Behavior
- Final validation before merge
- Merges approved PRs
- Monitors deployment process
- Updates status to "Deployed"
- Handles any deployment issues

## Notes Parameter
Optional notes guide how to process the issues:
- "merge and deploy" - Execute the deployment process
- "validate deployment" - Check deployment success
- "rollback if needed" - Monitor for issues requiring rollback
- "batch deploy" - Deploy multiple changes together

## Example
```
/deploy "deploy to production"
```