# PR Workflow Command

This command follows the established workflow for managing pull requests according to the project's Kanban workflow.

## Usage
```
/pr <pr_number>
```

## Description
Manages a pull request through the workflow stages, updating the GitHub Project Status field as appropriate.

## Instructions for Claude

When this command is used with a PR number:

1. **Get PR Information**
   - Use `gh pr view <pr_number>` to get the current PR status, labels, and details
   - Check if the PR is draft, ready for review, or merged
   - **Conflict Detection**: Check for other open PRs on the same issue
   - **Validate PR State**: Ensure PR is in valid state for workflow progression

2. **Follow Workflow Progression**
   Based on current PR state, update the GitHub Project Status field:
   
   - **Draft PR**: Ensure related issue has "In Progress" status
   - **Ready for Review**: Keep issue "In Progress" during review process
   - **Approved PR with passing CI**: Issue can remain "In Progress" until merge
   - **Merged PR**: Update related issue(s) to "Done" status

3. **Update Project Board**
   - Update the Status field for associated issue(s) in the GitHub Project
   - Link PR to related issues if not already linked
   - Use GitHub's built-in automation where possible

4. **Review & Testing Management**
   - If PR needs review and no reviewers assigned, suggest adding reviewers
   - **CI Status Validation**: Check all CI/CD checks before status changes
   - **Review Status Validation**: Verify approval state before progression
   - Verify all conversations are resolved if approved
   - Ensure both review approval AND CI passing before allowing merge
   - **Error Handling**: Provide clear guidance when CI fails or reviews are pending

5. **Provide Status Summary**
   Give a concise summary of:
   - Current PR status and workflow stage
   - Any Status field updates made
   - Next steps or blockers
   - Related issues and their status

## Workflow Stage Mapping

| PR State | Project Status | Next Action |
|----------|----------------|-------------|
| Draft | In Progress | Complete development |
| Ready for Review | In Progress | Await review + CI |
| Approved + CI Passing | In Progress | Merge PR |
| Merged | Done | Verify deployment and close issues |

## Validation Safeguards

### PR State Validation
- Verify PR exists and is accessible
- Check PR is not closed or abandoned
- Validate PR author and permissions

### Conflict Detection
- Check for multiple PRs addressing same issue
- Warn about potential merge conflicts
- Validate base branch is up to date

### Status Transition Rules
- Only update to "Done" after successful merge
- Validate CI status before progression
- Ensure review requirements are met
- Prevent invalid status transitions

### Error Recovery
- If CI fails: provide logs and common fixes
- If review blocked: list pending reviewers
- If conflicts exist: guide through resolution
- Always provide rollback instructions

## Example Usage

```
/pr 123
```

This will:
1. Check PR #123 status with validation
2. Detect conflicts and CI status
3. Update GitHub Project Status field safely
4. Report current status, blockers, and next steps
5. Provide error recovery guidance if needed