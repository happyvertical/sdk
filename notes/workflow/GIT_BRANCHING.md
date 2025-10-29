# Git Branching Strategy

**IMPORTANT**: Never push directly to `main`. Always use feature branches and pull requests.

## Branch Naming Convention

```
feat/issue-XXX-short-description      # New features
fix/issue-XXX-short-description       # Bug fixes
docs/issue-XXX-short-description      # Documentation updates
refactor/issue-XXX-short-description  # Code refactoring
test/issue-XXX-short-description      # Test additions/updates
```

## Workflow

```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feat/issue-210-smrt-advisor-mcp

# 2. Make changes and commit
git add .
git commit -m "feat(smrt): implement advisor MCP server"

# 3. Push feature branch
git push origin feat/issue-210-smrt-advisor-mcp

# 4. Create Pull Request via GitHub CLI or web interface
gh pr create --title "feat(smrt): implement advisor MCP server" --body "Closes #210"

# 5. After PR approval and merge, delete feature branch
git checkout main
git pull origin main
git branch -d feat/issue-210-smrt-advisor-mcp
```

## GitHub Issue Management

When creating Pull Requests, use closing keywords in the PR description or commit messages to automatically close related issues when the PR is merged:

- `closes #123` - Closes issue #123 when PR is merged
- `fixes #123` - Closes issue #123 when PR is merged
- `resolves #123` - Closes issue #123 when PR is merged

### Example PR Description

```markdown
## Summary
Implement user authentication system

## Changes
- Add login/logout functionality
- Implement JWT token management
- Add user session handling

Closes #45
Fixes #67
```

This ensures issues are automatically moved through the workflow and closed when work is complete.
