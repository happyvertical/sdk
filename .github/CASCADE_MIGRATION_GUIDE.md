# Cascade System Migration Guide

## Overview

This guide helps you migrate from the deprecated cascade-handler pattern to the new consolidated on-merge-main pattern.

**Issue:** [#404](https://github.com/happyvertical/sdk/issues/404)

## Why Migrate?

The old pattern had significant issues:

1. **Tests run twice**: First in cascade-handler, then again when PR merges
2. **Wrong build order**: Tests ran before build, causing failures
3. **Wasted CI resources**: Duplicate test runs increase feedback time
4. **Complex architecture**: Separate workflow harder to maintain

## New Pattern Benefits

✅ Tests run only once instead of twice
✅ Correct build order (build → test)
✅ Eliminates duplicate test runs
✅ Simplifies workflow architecture
✅ Reuses existing test/build/release infrastructure
✅ Cascade PRs trigger normal workflow when merged

## Migration Steps

### Step 1: Update on-merge-main.yml

Add `repository_dispatch` trigger and `update-dependencies` job to your `on-merge-main.yml`:

```yaml
name: On Merge Main

on:
  push:
    branches: [main]

  # NEW: Handle cascade events from upstream dependencies
  repository_dispatch:
    types: [dependency-updated, sdk-updated]

jobs:
  # NEW: Update dependencies if triggered by cascade
  update-dependencies:
    name: Update Dependencies
    runs-on: ubuntu-latest
    if: github.event_name == 'repository_dispatch'

    outputs:
      pr_number: ${{ steps.create-pr.outputs.pull-request-number }}
      pr_url: ${{ steps.create-pr.outputs.pull-request-url }}
      updated: ${{ steps.check-updates.outputs.updated }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Environment
        uses: ./.github/actions/setup-environment
        with:
          node-version: '24'
          registry-url: 'https://npm.pkg.github.com'

      - name: Update @happyvertical dependencies
        id: update
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          echo "🔄 Updating @happyvertical dependencies..."
          pnpm update '@happyvertical/*' --latest
          pnpm install

      - name: Check for updates
        id: check-updates
        run: |
          if git diff --quiet package.json pnpm-lock.yaml 2>/dev/null; then
            echo "updated=false" >> $GITHUB_OUTPUT
            echo "⏭️  No updates needed"
          else
            echo "updated=true" >> $GITHUB_OUTPUT
            echo "✅ Dependencies updated"

            # Show updated packages
            git diff package.json | grep '^\+.*@happyvertical' | sed 's/^+//' > /tmp/updates.txt || true
            if [ -s /tmp/updates.txt ]; then
              echo "📦 Updated packages:"
              cat /tmp/updates.txt
            fi
          fi

      - name: Create Pull Request
        id: create-pr
        if: steps.check-updates.outputs.updated == 'true'
        uses: peter-evans/create-pull-request@v6
        with:
          token: ${{ secrets.GH_TOKEN }}
          commit-message: 'chore: update @happyvertical dependencies'
          title: 'chore: update @happyvertical dependencies'
          body: |
            ## Automated Dependency Update 🤖

            This PR was automatically created by the dependency cascade system.

            ### Upstream Changes
            ${{ github.event.client_payload.package && format('- **Package:** {0}', github.event.client_payload.package) || '' }}
            ${{ github.event.client_payload.version && format('- **Version:** {0}', github.event.client_payload.version) || '' }}
            ${{ github.event.client_payload.repository && format('- **Source:** {0}', github.event.client_payload.repository) || '' }}

            ### Next Steps
            - ✅ Dependencies updated
            - 🧪 Tests will run automatically
            - 📦 Will auto-merge if tests pass

            ---
            *This PR will be automatically merged when all checks pass*
          branch: cascade/update-dependencies
          delete-branch: true
          labels: dependencies,automated

      - name: Enable auto-merge
        if: steps.create-pr.outputs.pull-request-number
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
        run: |
          echo "🔀 Enabling auto-merge for PR #${{ steps.create-pr.outputs.pull-request-number }}"
          gh pr merge ${{ steps.create-pr.outputs.pull-request-number }} \
            --auto --squash \
            --delete-branch

  # UPDATED: Make test job depend on update-dependencies
  test:
    name: Test Suite
    needs: [update-dependencies]
    # Run tests if:
    # - Update dependencies succeeded (cascade event)
    # - OR this is a normal push/workflow_dispatch (not cascade event)
    if: |
      always() &&
      (needs.update-dependencies.result == 'success' || github.event_name != 'repository_dispatch')
    uses: ./.github/workflows/test-suite.yml
    with:
      runner: 'ubuntu-latest'
      node-version: '24'

  # UPDATED: Only run release on push events (not cascades)
  changesets:
    name: Create Version PR or Publish
    runs-on: ubuntu-latest
    needs: [test]
    if: |
      always() &&
      needs.test.outputs.success == 'true' &&
      github.event_name == 'push'
    # ... rest of changesets job

  # UPDATED: Only deploy docs on push events (not cascades)
  deploy-docs:
    name: Deploy Documentation
    runs-on: ubuntu-latest
    needs: [test]
    if: |
      always() &&
      needs.test.outputs.success == 'true' &&
      github.event_name == 'push' &&
      github.event.inputs.skip-docs != 'true'
    # ... rest of deploy-docs job
```

### Step 2: Remove Old Cascade Handler

Delete `.github/workflows/dependency-cascade.yml` (or whatever you named it)

### Step 3: Test the Migration

1. Create a test PR to verify your workflow syntax is correct
2. Monitor the next upstream cascade event to ensure it works correctly
3. Verify that:
   - Dependencies are updated automatically
   - PR is created with correct information
   - Tests run only once
   - PR auto-merges when tests pass

## Troubleshooting

### Tests run twice

**Cause:** The test job's conditional is incorrect

**Fix:** Ensure the test job has:
```yaml
if: |
  always() &&
  (needs.update-dependencies.result == 'success' || github.event_name != 'repository_dispatch')
```

### Release runs on cascade events

**Cause:** The changesets/deploy-docs job doesn't check event type

**Fix:** Ensure changesets and deploy-docs have:
```yaml
if: |
  always() &&
  needs.test.outputs.success == 'true' &&
  github.event_name == 'push'
```

### Cascade PR not created

**Cause:** Missing GH_TOKEN secret or incorrect permissions

**Fix:**
1. Ensure `GH_TOKEN` secret is set in repository settings
2. Verify it has permissions: `contents: write`, `pull-requests: write`

### Dependencies not updating

**Cause:** Package manager detection or registry authentication

**Fix:**
1. Verify `NODE_AUTH_TOKEN` is set in update step
2. Check that your package manager (pnpm/bun/npm) is correctly detected
3. Ensure registry URL is correct for your setup

## Example Repositories

See these repositories for complete examples:

- **SDK** (reference implementation): [happyvertical/sdk](https://github.com/happyvertical/sdk)
- **SMRT** (after migration): Check [happyvertical/smrt](https://github.com/happyvertical/smrt) once migrated

## Support

If you encounter issues during migration:

1. Check the [issue discussion](https://github.com/happyvertical/sdk/issues/404)
2. Review the [SDK on-merge-main.yml](https://github.com/happyvertical/sdk/blob/main/.github/workflows/on-merge-main.yml) reference implementation
3. Open an issue in the SDK repository

## Timeline

- **Now**: Cascade-handler pattern is deprecated but still functional
- **Future**: Cascade-handler action may be removed in a future SDK version
- **Recommendation**: Migrate as soon as possible to get benefits immediately
