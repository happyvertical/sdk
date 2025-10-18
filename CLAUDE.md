# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

> **Important**: As of October 2024, the SMRT framework has been split into its own repository at [github.com/happyvertical/smrt](https://github.com/happyvertical/smrt). This SDK provides core foundation packages (ai, files, sql, utils, logger) and infrastructure packages that can be used with SMRT or independently.

## Monorepo Structure

The SDK is organized as a pnpm workspace with the following packages:

### Core Foundation Packages (`packages/`)
Core packages used by infrastructure and the SMRT framework:

- **utils**: Base utility functions
- **logger**: Logging infrastructure
- **files**: File system operations (local and remote)
- **sql**: Database operations (SQLite, Postgres, DuckDB)
- **ai**: Multi-provider AI client (OpenAI, Anthropic, Google, AWS)

### Infrastructure Packages (`packages/`)
Infrastructure packages for advanced functionality:

- **cache**: Caching utilities and abstractions
- **geo**: Geographic utilities and services
- **translator**: Translation services integration
- **ocr**: Optical Character Recognition with multiple providers
- **pdf**: PDF parsing and processing with OCR fallback
- **spider**: Web crawling and content extraction
- **documents**: Document processing and management

## Development Patterns

### Dependency Management

- Package versioning is synchronized across the monorepo
- Internal SDK packages use `workspace:*` to reference other SDK packages
- External dependencies are kept to a minimum
- Node.js 24+ or Bun 1.0+ required for development and runtime

### Build Process

The build process follows a specific order to respect internal dependencies:

**Core Foundation Packages** (in `packages/`):
1. `@have/utils` (base utilities, no internal dependencies)
2. `@have/logger` (logging infrastructure, no internal dependencies)
3. `@have/files` (file system operations, no internal dependencies)
4. `@have/sql` (database operations, no internal dependencies)
5. `@have/ai` (AI client with multi-provider support, no internal dependencies)

**Infrastructure Packages** (in `packages/`):
1. `@have/cache` (caching utilities, no internal dependencies)
2. `@have/geo` (geographic utilities, no internal dependencies)
3. `@have/translator` (translation services, no internal dependencies)
4. `@have/ocr` (OCR providers, no internal dependencies)
5. `@have/pdf` (PDF processing, depends on ocr)
6. `@have/spider` (web crawling, no internal dependencies)
7. `@have/documents` (document processing, depends on pdf, spider, ocr)

### TypeScript Project References

The SDK uses TypeScript project references for proper type resolution across packages. **This is critical for avoiding module resolution conflicts.**

#### Configuration Requirements

Each package must have:
1. `composite: true` in its tsconfig.json
2. `outDir`, `rootDir`, and `tsBuildInfoFile` properly configured
3. Entry in root tsconfig.json `references` array

**Example package tsconfig.json:**
```json
{
  "extends": "../../tsconfig.json",  // Two levels up (packages/cache -> root)
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Root tsconfig.json references (must be complete):**
```json
{
  "references": [
    // Core foundation packages
    { "path": "./packages/utils" },
    { "path": "./packages/logger" },
    { "path": "./packages/files" },
    { "path": "./packages/sql" },
    { "path": "./packages/ai" },

    // Infrastructure packages
    { "path": "./packages/cache" },
    { "path": "./packages/geo" },
    { "path": "./packages/translator" },
    { "path": "./packages/ocr" },
    { "path": "./packages/pdf" },
    { "path": "./packages/documents" },
    { "path": "./packages/spider" }
  ]
}
```

#### Verifying TypeScript Configuration

```bash
# Check that all packages have proper project references
npx tsc --build --dry

# Force rebuild all projects
npx tsc --build --force

# Use Vite for actual builds (not raw tsc)
npm run build
```

**Note**: All packages use Node.js-only builds for simplified deployment and better performance. The dual-target (browser/node) architecture has been removed in favor of focused Node.js development.

### Code Style and Conventions

- Code formatting is enforced by Biome
- Spaces (2) for indentation
- Single quotes for strings
- Line width of 80 characters
- ESM module format exclusively
- Each package has its own tsconfig that extends from the root
- Use camelCase for variables and functions, PascalCase for classes
- Use conventional commits
- Dont include claude branding in commit messages
- Use pnpm for package management and npm scripts for builds
- Ensure all scripts and tools are nix-friendly (use /usr/bin/env in shebangs)

### Testing

- Tests are written using Vitest
- Each package has its own test suite
- Run tests with `npm test` or `npm run test:watch`

### Common Development Commands

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Build all packages in correct order
npm run build

# Watch mode development
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Cross-Package Dependencies

### Core Foundation Package Dependencies

Core foundation packages have minimal dependencies:

- `utils`: No internal dependencies
- `logger`: No internal dependencies
- `files`: Depends on `utils`
- `sql`: No internal dependencies
- `ai`: No internal dependencies

### Infrastructure Package Dependencies

SDK infrastructure packages have these dependency relationships:

- `cache`: No internal dependencies
- `geo`: Depends on `utils`
- `translator`: No internal dependencies
- `ocr`: Depends on `utils`
- `spider`: No internal dependencies
- `pdf`: Depends on `ocr`, `utils`
- `documents`: Depends on `pdf`, `spider`, `ocr`, `utils`

When adding new features, maintain this dependency hierarchy to avoid circular dependencies.

## Contribution Guidelines

1. Ensure code passes Biome linting (`npm run lint`)
2. Write tests for new functionality
3. Update package documentation when adding new features
4. Follow existing code patterns in each package
5. Run the full test suite before submitting changes

## Development Workflow

HAppy VErtical follows a standardized development workflow across all projects. The workflow documentation serves as the organization's source of truth:

- **[Definition of Ready](./docs/workflow/DEFINITION_OF_READY.md)**: Criteria that must be met before an issue can be started
- **[Definition of Done](./docs/workflow/DEFINITION_OF_DONE.md)**: Checklist for completing Pull Requests
- **[Kanban Process](./docs/workflow/KANBAN.md)**: Kanban CI/CD workflow with automation setup

All HAppy VErtical projects should reference and follow these workflow standards to ensure consistency across the organization.

### Git Branching Strategy

**IMPORTANT**: Never push directly to `main`. Always use feature branches and pull requests.

**Branch Naming Convention**:
```
feat/issue-XXX-short-description      # New features
fix/issue-XXX-short-description       # Bug fixes
docs/issue-XXX-short-description      # Documentation updates
refactor/issue-XXX-short-description  # Code refactoring
test/issue-XXX-short-description      # Test additions/updates
```

**Workflow**:
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

### GitHub Issue Management

When creating Pull Requests, use closing keywords in the PR description or commit messages to automatically close related issues when the PR is merged:

- `closes #123` - Closes issue #123 when PR is merged
- `fixes #123` - Closes issue #123 when PR is merged
- `resolves #123` - Closes issue #123 when PR is merged

Example PR description:
```
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

## Tooling Configuration

- **TypeScript**: Configured for ES2022 with strict type checking
- **Biome**: Used for linting and formatting
- **Bun**: Package management with workspace support
- **Vitest**: Testing framework
- **Changesets**: Used for versioning and publishing packages
- **TypeDoc**: Used for generating API documentation

## Documentation

The SDK includes automatic API documentation generation using TypeDoc. The documentation is stored in the `docs/manual` directory and can be viewed by opening `docs/manual/index.html` in a browser.

Documentation is generated as part of the build process, but can also be generated separately:

```bash
npm run docs
```

The build pipeline integrates documentation generation after all packages are built and before repomix is run:

```bash
npm run build  # Includes documentation generation
```

This repository is designed to support building AI agents with minimal overhead and maximum flexibility.

## Agent Orchestration Guidelines

When working with multiple agents in the HAVE SDK, follow these orchestration patterns:

### Delegation Patterns

**Sequential Pattern** - Use when tasks have clear dependencies:
1. First agent completes foundation work
2. Next agent builds on previous output
3. Final agent refines or validates results

Example: `agent-reviewer` → `agent-trainer` (review first, then train based on findings)

**Parallel Pattern** - Use when tasks can be done independently:
1. Delegate multiple non-dependent tasks simultaneously
2. Coordinate results at completion

Example: Multiple domain agents analyzing different packages concurrently

**Hierarchical Pattern** - Use when tasks have sub-components:
1. Break down into major components
2. Delegate sub-components to specialized agents
3. Integrate results at each level

### Best Practices for Multi-Agent Coordination

- **Single Responsibility**: Each agent should focus on one domain
- **Clear Handoffs**: Pass relevant context between agent delegations
- **Avoid Redundancy**: Don't have multiple agents doing the same work
- **Validate Integration**: Ensure combined outputs meet requirements
- **Use TodoWrite**: Track complex multi-step workflows

### Agent Performance Tracking

All agents sign their commits using `type(agent-name):` format, enabling:
- Performance analysis via `git log --grep="(agent-name):"`
- Error pattern detection through fix-to-feat ratios
- Continuous improvement based on actual performance

### When to Delegate

Delegate to specialized agents when:
- The task matches an agent's specific expertise
- Multiple domains need coordination
- Systematic review or updates are needed
- Complex workflows require specialized knowledge

Direct implementation is preferred when:
- The task is straightforward and within general capabilities
- No specialized domain knowledge is required
- The overhead of delegation exceeds the benefit

## MCP Server Management

### Installation Guidelines

When adding MCP servers to the project:
- **Use the mcp-server-manager agent** - Always delegate MCP server setup to this specialized agent
- **Prefer bridge scripts** - Create nix-friendly bridge scripts in `scripts/mcp-servers/`
- **Use pnpm** - All package management should use pnpm, not npm or yarn
- **Nix compatibility** - Ensure all scripts use `/usr/bin/env` in shebangs
- **Local installation** - Install servers locally within the project when possible
- **Avoid global dependencies** - Keep dependencies project-scoped for reproducibility

### Bridge Script Pattern

MCP servers should be wrapped in bridge scripts that:
1. Handle connection setup and health monitoring
2. Use localhost-only binding for security
3. Implement proper error handling and cleanup
4. Are nix-friendly with proper shebangs
5. Use pnpm for any package operations

Example structure:
```bash
#!/usr/bin/env bash
# Bridge script for MCP server
# Uses pnpm for package management
# Implements health checks and error handling
``` 