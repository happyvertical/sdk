# Act Integration for Local CI Testing

This devcontainer is configured with [Act](https://github.com/nektos/act) for running GitHub Actions workflows locally. This enables debugging CI failures without pushing to GitHub.

## Features

- **Exact CI Environment**: Runs the same Ubuntu container as GitHub Actions
- **PostgreSQL Service**: Includes PostgreSQL service matching CI setup
- **Workflow Validation**: Validate workflow syntax locally before pushing
- **Verbose Debugging**: Run the CI workflow locally with detailed logs
- **Artifact Collection**: Save CI artifacts locally for inspection

## Quick Start

### 1. Rebuild DevContainer
After pulling these changes, rebuild the devcontainer:

**Option A: Automated Script (Recommended)**
```bash
# From host machine (outside devcontainer)
pnpm run rebuild-devcontainer
```

**Option B: VS Code Command Palette**
- `Dev Containers: Rebuild Container`
- Or: `Dev Containers: Rebuild Container Without Cache`

**Option C: VS Code Task**
- Command Palette → `Tasks: Run Task` → `Rebuild DevContainer`

This installs act and Docker CLI with all dependencies.

### 2. Validate Setup
```bash
pnpm run validate-act-setup
```

### 3. Run CI Locally
```bash
# Full CI workflow
pnpm run test:ci

# Debug with verbose output
pnpm run debug-ci

# Investigate local build/export readiness
pnpm run investigate-ci

# Test specific issues
pnpm run test-exports
```

## Available Commands

### Package Scripts
- `pnpm run test:ci` - Run full PR workflow locally
- `pnpm run test:ci-debug` - Verbose local workflow debugging
- `pnpm run test:ci-build` - Run local build and artifact validation
- `pnpm run test:ci-clean` - Clean run (removes cached containers)
- `pnpm run debug-ci` - Comprehensive debugging script
- `pnpm run investigate-ci` - Local build/export investigation
- `pnpm run test-exports` - Test module export resolution
- `pnpm run validate-act-setup` - Validate act integration setup
- `pnpm run rebuild-devcontainer` - Rebuild devcontainer (from host)

### VS Code Tasks
Access via Command Palette → `Tasks: Run Task`:
- **Run CI Tests Locally** - Full workflow execution
- **Debug CI Failure** - Comprehensive debugging
- **Investigate CI Environment** - Local build/export investigation
- **Test Export Resolution** - Module resolution testing
- **CI Build Only** - Just the build step
- **CI Clean Run** - Fresh container run
- **Rebuild DevContainer** - Rebuild with latest changes

## Debugging Workflow

### 1. Reproduce CI Failure
```bash
pnpm run test:ci
```

### 2. Debug Specific Issues
```bash
# Test build artifacts
pnpm run test:ci-build

# Local build/export investigation
pnpm run investigate-ci
```

### 3. Examine Export Resolution
```bash
pnpm run test-exports
```

### 4. Local Build Artifact Analysis
```bash
# Build and validate artifacts locally
pnpm run test:ci-build
pnpm run test-exports

# Inspect generated artifacts
ls -la packages/sql/dist/
cat packages/sql/dist/index.d.ts
node --input-type=module -e "import('./packages/sql/dist/index.js').then(m => console.log(Object.keys(m)))"
```

## Configuration Files

### `.actrc`
Global act configuration:
```
-P ubuntu-latest=catthehacker/ubuntu:act-latest
--container-architecture linux/amd64
--use-gitignore=false
--artifact-server-path /tmp/act-artifacts
--env-file .env.act
```

### `.env.act`
Environment variables for CI runs:
```
NODE_ENV=test
SQLOO_HOST=localhost
SQLOO_USER=postgres
SQLOO_PASSWORD=postgres
SQLOO_DATABASE=testdb
SQLOO_PORT=5432
```

## Common Issues

### Docker Permission Issues
If you get Docker permission errors:
```bash
sudo usermod -aG docker $USER
# Then restart the container
```

### PostgreSQL Connection Issues
Act runs its own PostgreSQL service. For detailed service logs, run:
```bash
pnpm run test:ci-debug
```

### Path Structure Differences
CI uses `/home/runner/work/sdk/sdk/` while local uses `/workspaces/sdk/`.
Act automatically mounts with CI path structure.

## Advanced Usage

### Custom Event Data
```bash
act pull_request -e custom-event.json
```

### Specific Runner Images
```bash
act -P ubuntu-latest=node:18-buster
```

### Bind Mount Debugging
```bash
act --bind
```

### Reuse Containers
```bash
act --reuse
```

## Troubleshooting

### Act Not Found
Rebuild the devcontainer to install act.

### Docker Socket Access
Ensure Docker socket is mounted:
```bash
ls -la /var/run/docker.sock
```

### Memory Issues
Increase Docker memory limit in Docker Desktop settings.

### Network Issues
Check if GitHub container registry is accessible:
```bash
docker pull catthehacker/ubuntu:act-latest
```

## Files Added/Modified

### DevContainer Configuration
- `.devcontainer/Dockerfile` - Added act and Docker CLI installation
- `.devcontainer/docker-compose.yml` - Added Docker socket mount
- `.devcontainer/devcontainer.json` - No changes needed

### Act Configuration
- `.actrc` - Act configuration file
- `.env.act` - Environment variables for CI runs

### Scripts
- `.devcontainer/scripts/debug-ci.sh` - Comprehensive debugging
- `.devcontainer/scripts/investigate-ci.sh` - Local build/export investigation
- `.devcontainer/scripts/test-exports.sh` - Export resolution testing
- `.devcontainer/scripts/validate-act-setup.sh` - Setup validation

### VS Code Integration
- `.vscode/tasks.json` - Added act-related tasks

### Project Configuration
- `package.json` - Added act-related scripts
- `.gitignore` - Added act artifacts to ignore list

This integration provides a complete local CI debugging environment that matches GitHub Actions exactly.
