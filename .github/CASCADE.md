# Dependency Cascade System

Automated dependency update system for HappyVertical repositories.

## Overview

The cascade system automatically propagates dependency updates across the HappyVertical ecosystem:

```
SDK (@happyvertical/*)
  ↓
SMRT (@happyvertical/smrt)
  ↓
├── Praeco
├── Caelus
└── [future SMRT agents]
  ↓
bentleyalberta.com
```

When SDK publishes a new version:
1. SMRT automatically updates SDK dependencies
2. SMRT runs tests and publishes if passing
3. Praeco and Caelus automatically update SMRT + SDK
4. bentleyalberta.com updates Praeco

**Result:** All projects stay up-to-date automatically, no manual intervention needed.

## How It Works

### 1. Trigger (SDK)

When SDK merges to `main` and publishes new versions:
- `.github/workflows/cascade-trigger.yml` detects version changes
- Reads `.github/cascade-config.json` to find downstream targets
- Triggers `repository_dispatch` events to downstream repos

### 2. Handler (All Downstream Repos)

Each downstream repo has `.github/workflows/dependency-cascade.yml`:
- Listens for `repository_dispatch` events
- Uses the reusable `.github/actions/cascade-handler` action
- Updates dependencies, runs tests, creates PR
- Auto-merges if tests pass
- Triggers its own downstream repos

### 3. Configuration

All cascade behavior is defined in `.github/cascade-config.json`:

```json
{
  "cascade": {
    "sdk": {
      "repository": "happyvertical/sdk",
      "triggers": ["smrt"],
      "packages": ["@happyvertical/*"]
    },
    "smrt": {
      "repository": "happyvertical/smrt",
      "triggers": ["praeco", "caelus"],
      "packages": ["@happyvertical/smrt"],
      "dependencies": ["sdk"]
    }
  }
}
```

## Setup for New Repositories

### Step 1: Add Cascade Handler Workflow

Copy `.github/workflows/cascade-handler-template.yml` to your repo:

```bash
curl https://raw.githubusercontent.com/happyvertical/sdk/main/.github/workflows/cascade-handler-template.yml \
  -o .github/workflows/dependency-cascade.yml
```

### Step 2: Update Project Name

Edit `.github/workflows/dependency-cascade.yml`:

```yaml
- uses: happyvertical/sdk/.github/actions/cascade-handler@main
  with:
    project_name: 'your-project-name'  # Change this!
```

### Step 3: Add to Cascade Config

Submit PR to SDK repo to add your project to `.github/cascade-config.json`:

```json
{
  "your-project": {
    "repository": "happyvertical/your-project",
    "triggers": ["downstream-project"],
    "packages": [],
    "dependencies": ["sdk", "smrt"]
  }
}
```

### Step 4: Configure Secrets

Ensure your repo has access to:
- `secrets.GH_TOKEN` (organization secret, already configured)

## Configuration Reference

### cascade-config.json Schema

```typescript
{
  cascade: {
    [projectName: string]: {
      repository: string;      // GitHub repo (owner/name)
      triggers: string[];      // Projects to trigger after this one updates
      packages: string[];      // Packages this project publishes
      dependencies: string[];  // Upstream projects this depends on
    }
  },
  settings: {
    auto_merge: {
      enabled: boolean;        // Auto-merge PRs if tests pass
      require_tests: boolean;  // Require tests to pass
      require_build: boolean;  // Require build to succeed
    },
    notifications: {
      on_failure: boolean;     // Notify on failure
      on_success: boolean;     // Notify on success
    },
    timeouts: {
      test_timeout_minutes: number;    // Max time for tests
      cascade_timeout_hours: number;   // Max time for full cascade
    }
  }
}
```

### Workflow Inputs

#### cascade-trigger.yml (SDK only)

```yaml
workflow_dispatch:
  inputs:
    target_repo: string      # Specific repo to trigger (optional)
    dry_run: boolean         # Test mode, no actual triggers
```

#### dependency-cascade.yml (All downstream repos)

```yaml
workflow_dispatch:
  inputs:
    dry_run: boolean         # Test mode, no actual changes
```

### Action Inputs

The `cascade-handler` action accepts:

```yaml
inputs:
  project_name: string       # Required: Name from cascade-config.json
  upstream_package: string   # Package that was updated
  upstream_version: string   # New version number
  github_token: string       # Required: GitHub token
  npm_token: string          # Optional: NPM token for private packages
  auto_merge: boolean        # Default: true
  dry_run: boolean           # Default: false
```

### Action Outputs

```yaml
outputs:
  pr_number: number          # PR number if created
  pr_url: string             # PR URL if created
  updated: boolean           # Whether updates were made
  triggered_downstream: string[]  # Repos that were triggered
```

## Testing

### Test the Full Cascade

From SDK repo:

```bash
# Dry run (no actual changes)
gh workflow run cascade-trigger.yml -f dry_run=true

# Real trigger
gh workflow run cascade-trigger.yml
```

### Test Individual Repos

From any downstream repo:

```bash
# Dry run
gh workflow run dependency-cascade.yml -f dry_run=true

# Real run
gh workflow run dependency-cascade.yml
```

### Monitor Progress

```bash
# Watch cascade propagate
gh run watch

# View all cascade-related runs
gh run list --workflow=cascade-trigger.yml
gh run list --workflow=dependency-cascade.yml
```

## Troubleshooting

### PR Not Created

**Symptoms:** Workflow runs but no PR appears

**Causes:**
1. No dependency changes detected
2. Tests or build failed
3. Branch already exists with same changes

**Solutions:**
```bash
# Check for existing branch
git branch -r | grep cascade/update-dependencies

# Delete old branch
git push origin --delete cascade/update-dependencies

# Re-run workflow
gh workflow run dependency-cascade.yml
```

### Downstream Not Triggered

**Symptoms:** PR created but downstream repos not updated

**Causes:**
1. Missing `CASCADE_TOKEN` secret
2. Incorrect repository names in config
3. Downstream repo not configured

**Solutions:**
```bash
# Verify token has permissions
gh auth status

# Check cascade config
cat .github/cascade-config.json | jq '.cascade.sdk.triggers'

# Manually trigger downstream
gh workflow run dependency-cascade.yml \
  --repo happyvertical/smrt
```

### Tests Fail

**Symptoms:** PR created but not auto-merged

**Expected:** This is correct behavior!

**Actions:**
1. Review the PR
2. Check test logs
3. Fix issues locally
4. Push to PR branch or close and retry

### Circular Dependencies

**Symptoms:** Infinite cascade loop

**Prevention:** The config enforces a DAG (directed acyclic graph):
- SDK → SMRT → Projects → Sites
- No reverse dependencies allowed

## Advanced Usage

### Add Custom Steps

You can wrap the cascade-handler action with custom logic:

```yaml
steps:
  - uses: actions/checkout@v4

  # Custom pre-update steps
  - name: Prepare environment
    run: ./scripts/pre-update.sh

  - uses: happyvertical/sdk/.github/actions/cascade-handler@main
    with:
      project_name: 'my-project'
      github_token: ${{ secrets.GITHUB_TOKEN }}
      npm_token: ${{ secrets.GITHUB_TOKEN }}

  # Custom post-update steps
  - name: Run migrations
    if: steps.cascade-handler.outputs.updated == 'true'
    run: npm run migrate
```

### Conditional Cascades

Only trigger downstream for major/minor versions:

```yaml
- name: Check version type
  id: version-check
  run: |
    version="${{ github.event.client_payload.version }}"
    if [[ $version =~ ^[0-9]+\.[0-9]+\.0$ ]]; then
      echo "should_cascade=true" >> $GITHUB_OUTPUT
    else
      echo "should_cascade=false" >> $GITHUB_OUTPUT
    fi

- uses: happyvertical/sdk/.github/actions/cascade-handler@main
  if: steps.version-check.outputs.should_cascade == 'true'
```

### Custom Notifications

Add Slack/Discord notifications:

```yaml
- name: Notify on success
  if: steps.cascade-handler.outputs.updated == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    webhook: ${{ secrets.SLACK_WEBHOOK }}
    payload: |
      {
        "text": "Dependencies updated in ${{ github.repository }}",
        "pr_url": "${{ steps.cascade-handler.outputs.pr_url }}"
      }
```

## Maintenance

### Update Cascade Config

To add/remove projects or change triggers:

1. Edit `.github/cascade-config.json` in SDK repo
2. Submit PR with changes
3. Changes take effect immediately after merge

### Update Cascade Handler

The handler action is versioned with `@main`:

```yaml
uses: happyvertical/sdk/.github/actions/cascade-handler@main
```

To pin to a specific version:

```yaml
uses: happyvertical/sdk/.github/actions/cascade-handler@v1.0.0
```

### Monitor Cascade Health

Create a dashboard workflow:

```yaml
name: Cascade Health Check
on:
  schedule:
    - cron: '0 0 * * *'
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check all repos are up to date
        run: node scripts/check-cascade-health.js
```

## Security

### Token Permissions

The `GH_TOKEN` organization secret is already configured with:
- `repo` scope for triggering workflows
- `packages:read` for installing private packages
- Full access to all HappyVertical repositories

No additional token setup is required!

### Secret Management

`GH_TOKEN` is stored as an organization secret and is automatically available to all repositories in the HappyVertical organization.

### Rate Limits

The cascade system respects GitHub API rate limits:
- Max 5000 requests/hour per token
- Cascades are sequential, not parallel
- Typical cascade uses ~10 API calls

## FAQ

**Q: How long does a full cascade take?**
A: Typically 10-30 minutes:
- SDK → SMRT: 5-10 minutes
- SMRT → Projects: 5-10 minutes each
- Projects → Sites: 5-10 minutes

**Q: Can I pause cascades?**
A: Yes, disable the workflow in any repo:
```bash
gh workflow disable dependency-cascade.yml
```

**Q: What if I need to skip a cascade?**
A: Use `[skip cascade]` in commit message:
```bash
git commit -m "fix: urgent hotfix [skip cascade]"
```

**Q: Can I manually trigger a cascade?**
A: Yes:
```bash
gh workflow run cascade-trigger.yml
```

**Q: How do I add a new project?**
A:
1. Copy template workflow to new repo
2. Update `project_name` in workflow
3. Add project to cascade-config.json
4. Test with dry run

**Q: What happens if tests fail?**
A: PR is created but not auto-merged. You review and fix manually.

## Support

- **Issues:** https://github.com/happyvertical/sdk/issues
- **Config:** `.github/cascade-config.json`
- **Template:** `.github/workflows/cascade-handler-template.yml`
- **Action:** `.github/actions/cascade-handler/action.yml`
