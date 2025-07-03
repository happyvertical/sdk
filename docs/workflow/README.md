# HAppy VErtical Workflow Standards

This directory contains the organization-wide workflow standards for all HAppy VErtical projects. These documents serve as the single source of truth for development processes across the organization.

## Documents

- **[Definition of Ready](./DEFINITION_OF_READY.md)** - Criteria that must be met before work can begin on an issue
- **[Definition of Done](./DEFINITION_OF_DONE.md)** - Checklist for Pull Request completion
- **[Kanban Process](./KANBAN.md)** - Kanban CI/CD workflow with lanes and automation

## How to Reference in Other Repositories

### Option 1: Direct Links (Recommended)
Reference these documents directly from other repositories using GitHub URLs:

```markdown
# In your project's README or CONTRIBUTING.md

## Development Process

We follow the HAppy VErtical organization workflow standards:

- [Definition of Ready](https://github.com/happyvertical/sdk/blob/main/docs/workflow/DEFINITION_OF_READY.md)
- [Definition of Done](https://github.com/happyvertical/sdk/blob/main/docs/workflow/DEFINITION_OF_DONE.md)  
- [Kanban Process](https://github.com/happyvertical/sdk/blob/main/docs/workflow/KANBAN.md)
```

### Option 2: Git Submodule
Add this workflow directory as a submodule:

```bash
git submodule add https://github.com/happyvertical/sdk.git workflow-standards
git submodule init
git submodule update --remote --merge
```

Then reference the files locally:
```markdown
See [workflow-standards/docs/workflow/](./workflow-standards/docs/workflow/) for our development process.
```

### Option 3: Automated Sync
Use GitHub Actions to sync these files to your repository:

```yaml
name: Sync Workflow Standards
on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Sync workflow docs
        run: |
          mkdir -p .github/workflow-standards
          curl -L https://raw.githubusercontent.com/happyvertical/sdk/main/docs/workflow/DEFINITION_OF_READY.md -o .github/workflow-standards/DEFINITION_OF_READY.md
          curl -L https://raw.githubusercontent.com/happyvertical/sdk/main/docs/workflow/DEFINITION_OF_DONE.md -o .github/workflow-standards/DEFINITION_OF_DONE.md
          curl -L https://raw.githubusercontent.com/happyvertical/sdk/main/docs/workflow/KANBAN.md -o .github/workflow-standards/KANBAN.md
      - uses: peter-evans/create-pull-request@v5
        with:
          title: Update workflow standards
          body: Automated sync of workflow documentation from happyvertical/sdk
```

## Project Setup

To implement these workflows in your project:

### Quick Setup Commands

Run these GitHub CLI commands to set up your project with required labels and project board:

```bash
# Create type labels for issue categorization
gh label create "type:bug" --color "D73A4A" --description "Something isn't working"
gh label create "type:feature" --color "0075CA" --description "New feature or request"
gh label create "type:enhancement" --color "A2EEEF" --description "Improvement to existing functionality"
gh label create "type:tech-debt" --color "FBCA04" --description "Technical debt or refactoring"
gh label create "type:epic" --color "8B5CF6" --description "Large feature that spans multiple issues"

# Create a new project board with GitHub's standard Status field
gh project create --owner "@me" --title "Development Workflow"
```

### Project Board Setup

After creating the project, configure it to use GitHub's built-in Status field:

1. **Configure the project board**:
   - Visit your project in GitHub's web interface
   - Switch to "Board" view
   - The Status field will have default options: Todo, In Progress, Done

2. **Enable built-in automation**:
   - Go to project Settings > Workflows
   - Enable "Auto-add to project" to automatically add new issues with "Todo" status
   - Enable "Auto-archive" to move completed items to archive

3. **Set up status automation** (optional):
   - Configure workflows to automatically update status when PRs are opened/merged
   - Use GitHub's built-in project automation instead of custom GitHub Actions

The native approach provides:
- **Drag & Drop**: Visual updates automatically sync to the Status field
- **Built-in Automation**: No custom workflows needed for basic functionality
- **Status Tracking**: Single source of truth using GitHub's Status field

### Manual Setup Steps

If you prefer manual setup:

1. **Configure Labels**: Use the commands above to create type labels for issue categorization
2. **Setup Project Board**: Create project and configure Board view with Status field
3. **Enable Built-in Automation**: Use GitHub's native project workflows instead of custom actions
4. **Reference in README**: Add links to these standards in your project documentation

**Migration from Custom Labels**: If you have existing `status:*` labels, you can:
- Remove them from issues and rely on the Status field instead
- Delete the custom labels to simplify your workflow
- Use GitHub's built-in automation for status management

## Updates and Changes

Changes to these workflow standards should be:
1. Proposed via Pull Request to the happyvertical/sdk repository
2. Reviewed by team leads across affected projects
3. Documented with rationale in the PR description
4. Communicated to all teams upon merge

## Questions or Suggestions

Open an issue in the [happyvertical/sdk](https://github.com/happyvertical/sdk/issues) repository to discuss improvements or clarifications to these workflow standards.