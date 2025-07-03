# GitHub Actions Security Configuration

This document explains the security configurations implemented in the GitHub Actions workflows.

## Security Improvements Implemented

### 1. Action Version Pinning

**Problem**: Using unpinned action versions like `@beta`, `@v5`, `@latest` creates supply chain security risks.

**Solution**: All actions are now pinned to specific versions:
- `actions/checkout@v4` - Consistent across all workflows
- `actions/setup-node@v4` - Latest stable version
- `actions/cache@v4` - Latest stable version
- `anthropics/claude-code-action@v1.0.0` - Pinned to stable release
- `alstr/todo-to-issue-action@v5.0.0` - Pinned to specific version
- `dependabot/fetch-metadata@v2.1.0` - Pinned to specific version

### 2. Secret Validation

**Problem**: Workflows would fail silently or with unclear errors if required secrets were missing.

**Solution**: Added validation steps to check for required secrets before proceeding:

```yaml
- name: Validate required secrets
  run: |
    if [ -z "${{ secrets.ANTHROPIC_API_KEY }}" ]; then
      echo "Error: ANTHROPIC_API_KEY secret is not configured"
      exit 1
    fi
    echo "All required secrets are configured"
```

### 3. Secure Token Handling

**Problem**: Writing authentication tokens to files creates security risks.

**Before**:
```yaml
echo "//npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}" >> .npmrc
```

**After**:
```yaml
echo "@have:registry=https://npm.pkg.github.com" > .npmrc
# Token is passed via environment variables instead
env:
  NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  NPM_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Permission Documentation

**Problem**: Unclear why specific permissions are required.

**Solution**: Added clear documentation for each permission:

```yaml
permissions:
  contents: write       # Required for creating git tags/releases and pushing commits
  packages: write       # Required for publishing packages to GitHub Packages
  pages: write          # Required for GitHub Pages deployment (when enabled)
  id-token: write       # Required for GitHub Pages deployment (when enabled)
```

### 5. Enhanced Dependabot Security

**Problem**: Dependabot automatically approved and merged all non-major updates without additional security checks.

**Solution**: 
- Added security validation steps
- Added manual review requirement for major updates
- Enhanced logging for dependency update metadata
- Added security validation comments on PRs

### 6. Reusable Security Validation Script

**Location**: `.github/scripts/validate-security.sh`

**Purpose**: Provides centralized security validation that can be reused across workflows.

**Features**:
- Secret validation
- GitHub token permission validation
- Action version validation
- Colored output for better visibility

**Usage**:
```bash
# Validate specific secrets
./validate-security.sh --secrets GITHUB_TOKEN ANTHROPIC_API_KEY

# Validate workflow files
./validate-security.sh --workflows .github/workflows/claude.yaml

# Combined validation
./validate-security.sh --secrets GITHUB_TOKEN --workflows .github/workflows/claude.yaml
```

## Security Checklist

When adding new workflows, ensure:

- [ ] All actions are pinned to specific versions (no @latest, @beta, @main)
- [ ] Required secrets are validated before use
- [ ] Permissions are documented with clear justification
- [ ] Sensitive data is not written to files
- [ ] Security validation script is used where appropriate
- [ ] Manual review is required for high-impact changes

## Secrets Configuration

The following secrets must be configured in the repository:

| Secret Name | Purpose | Required For |
|-------------|---------|--------------|
| `GITHUB_TOKEN` | GitHub API access (auto-provided) | All workflows |
| `ANTHROPIC_API_KEY` | Claude AI integration | claude.yaml |

## Monitoring and Maintenance

1. **Regular Updates**: Review and update pinned action versions quarterly
2. **Security Audits**: Run security validation script before major releases
3. **Permission Reviews**: Audit workflow permissions annually
4. **Secret Rotation**: Rotate secrets according to security policy

## Incident Response

If a security issue is discovered:

1. **Immediate**: Disable affected workflows
2. **Assessment**: Evaluate scope and impact
3. **Remediation**: Apply fixes using this security framework
4. **Validation**: Run security validation script
5. **Documentation**: Update this document with lessons learned