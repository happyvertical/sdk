# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

> **Important**: As of October 2024, the SMRT framework has been split into its own repository at [github.com/happyvertical/smrt](https://github.com/happyvertical/smrt). This SDK provides core foundation packages (ai, files, sql, utils, logger) and infrastructure packages that can be used with SMRT or independently.

## Quick Start

### Installation

```bash
# Install packages from GitHub Packages
# Create .npmrc first (see Package Publishing section)
pnpm add @happyvertical/ai @happyvertical/sql
```

### Basic Usage

```typescript
import { getAI } from '@happyvertical/ai';
import { getDatabase } from '@happyvertical/sql';

// AI client
const ai = await getAI({ type: 'openai', apiKey: process.env.OPENAI_API_KEY });
const response = await ai.chat([{ role: 'user', content: 'Hello!' }]);

// Database client
const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
await db.insert('users', { id: '1', name: 'Alice' });
```

### Learn More

- See [Package Directory](#package-directory) below for links to all package documentation
- Read [Development Workflow](#development-workflow) for contribution guidelines
- Check [Monorepo Development](#monorepo-development) for build and publishing

## Package Directory

Each package has comprehensive documentation in its own `CLAUDE.md` file. Click package names for detailed APIs, examples, and development guidelines.

### Core Foundation Packages

- [**utils**](./packages/utils/CLAUDE.md) - ID generation, string manipulation, date handling, error classes, logging
- [**logger**](./packages/logger/CLAUDE.md) - Logging infrastructure
- [**files**](./packages/files/CLAUDE.md) - File system operations (local and remote)
- [**sql**](./packages/sql/CLAUDE.md) - Database operations (SQLite, Postgres, DuckDB, JSON adapter)
- [**ai**](./packages/ai/CLAUDE.md) - Multi-provider AI client (OpenAI, Anthropic, Google, AWS, Claude CLI)

### Infrastructure Packages

- [**cache**](./packages/cache/CLAUDE.md) - Caching utilities and abstractions
- [**geo**](./packages/geo/CLAUDE.md) - Geographic utilities and services
- [**translator**](./packages/translator/CLAUDE.md) - Translation services integration
- [**ocr**](./packages/ocr/CLAUDE.md) - Optical Character Recognition with multiple providers
- [**pdf**](./packages/pdf/CLAUDE.md) - PDF parsing and processing with OCR fallback
- [**spider**](./packages/spider/CLAUDE.md) - Web crawling and content extraction (Simple, DOM, Crawlee adapters)
- [**documents**](./packages/documents/CLAUDE.md) - Document processing and management
- [**weather**](./packages/weather/CLAUDE.md) - Weather data provider integration

### Developer Tools

- [**sdk-mcp**](./packages/sdk-mcp/CLAUDE.md) - MCP server for SDK documentation routing
- [**github-actions**](./packages/github-actions/README.md) - Reusable GitHub Actions workflows

### Experimental Packages

- **email**: Email utilities (stub/in development)
- **languages**: Language detection and processing (stub/in development)

## Monorepo Development

### Dependency Management

- Package versioning is synchronized across the monorepo
- Internal SDK packages use `workspace:*` to reference other SDK packages
- External dependencies are kept to a minimum
- Node.js 24+ or Bun 1.0+ required for development and runtime
- **Automated updates via Renovate CE**: Self-hosted Renovate automatically creates PRs for dependency updates across all HappyVertical repositories

**Cross-Repository Updates**:

When SDK publishes new versions, downstream repositories (SMRT, praeco, caelus) automatically receive Renovate PRs:
- Webhook triggers Renovate on SDK publish
- PRs created within seconds of new version
- Grouped updates with configurable automerge
- Configuration managed in [renovate-config](https://github.com/happyvertical/renovate-config)

### Build Process

The SDK uses **Turborepo** for intelligent build orchestration:

```bash
# Build all packages (intelligent, incremental)
npm run build

# Clean and rebuild everything
npm run build:clean

# Build in watch mode (rebuilds on file changes)
npm run dev
```

**Key Features**:
- Automatic dependency resolution based on package dependencies
- Incremental builds (only rebuilds changed packages and dependents)
- Remote caching via GitHub Actions
- Parallel execution for independent packages

**Build Artifacts**: `dist/` directories are NOT tracked in git. They're generated locally and included in published npm packages.

### Package Publishing

**Publishing Platform**: All SDK packages are published to **GitHub Packages** (not npm).

**Automated Publishing**:
- Merges to `main` branch trigger the release workflow
- Changesets determine which packages get version bumps
- Packages are built and published to GitHub Packages registry
- CHANGELOG.md is automatically updated

**Changesets**:
All PRs require either a changeset or the `skip-changeset` label:
- **For package changes**: Run `npx changeset` to create a changeset file describing the change and version bump type
- **For non-package changes** (CI, docs, tests): Add `skip-changeset` label to the PR
- The `changeset-check.yml` workflow enforces this requirement on all PRs

**Installing Published Packages**:

Create `.npmrc` in your project:
```
@have:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then install:
```bash
pnpm add @happyvertical/ai @happyvertical/sql @happyvertical/files
```

**Semantic Versioning**:
- `feat:` → Minor version bump (0.45.0 → 0.46.0)
- `fix:`, `perf:`, `docs:`, `build:` → Patch version bump
- `breaking:` in commit body → Minor version bump (until 1.0.0)

For more details, see [Conventional Commits](./notes/workflow/CONVENTIONAL_COMMITS.md).

### TypeScript Project References

The SDK uses TypeScript project references for proper type resolution across packages.

**Key Requirements**:
- Each package has `composite: true` in `tsconfig.json`
- Root `tsconfig.json` includes all packages in `references` array
- Vite handles actual builds (not raw `tsc`)

**Verify Configuration**:
```bash
npx tsc --build --dry  # Check project references
npm run build          # Use Vite for actual builds
```

### Code Style and Testing

- **Formatting**: Biome (2 spaces, single quotes, 80 char width)
- **Module Format**: ESM only
- **Testing**: Vitest
- **Commits**: Conventional commits (see [Conventional Commits](./notes/workflow/CONVENTIONAL_COMMITS.md))
- **Type Safety**: Full TypeScript with strict checking

**Common Commands**:
```bash
pnpm install     # Install dependencies
npm test         # Run tests
npm run build    # Build all packages
npm run lint     # Lint code
npm run format   # Format code
```

## Development Workflow

HAppy VErtical follows a standardized development workflow across all projects. The workflow documentation serves as the organization's source of truth:

### Standard Operating Procedures

- [**Starting Work on an Issue**](./notes/workflow/START_WORK_SOP.md) - Complete SOP for beginning implementation
- [**Creating a Pull Request**](./notes/workflow/CREATE_PR_SOP.md) - Complete SOP for PR creation with code review

### Workflow Standards

- [**Definition of Ready**](./notes/workflow/DEFINITION_OF_READY.md) - Criteria before starting an issue
- [**Definition of Done**](./notes/workflow/DEFINITION_OF_DONE.md) - Checklist for completing PRs
- [**Kanban Process**](./notes/workflow/KANBAN.md) - Kanban CI/CD workflow with automation

### Git Workflow

- [**Branching Strategy**](./notes/workflow/GIT_BRANCHING.md) - Feature branch workflow, never push to main
- [**Conventional Commits**](./notes/workflow/CONVENTIONAL_COMMITS.md) - Commit message format and semantic versioning

### Communication & Collaboration

- [**Communication Guidelines**](./notes/workflow/COMMUNICATION_GUIDELINES.md) - Using AskUserQuestion wizard
- [**Agent Orchestration**](./notes/workflow/AGENT_ORCHESTRATION.md) - Multi-agent coordination patterns
- [**AI-Powered Triage**](./notes/workflow/AI_TRIAGE.md) - Automated issue triage

All HAppy VErtical projects should reference and follow these workflow standards to ensure consistency across the organization.

## Cross-Package Dependencies

### Core Foundation Package Dependencies

Core foundation packages have minimal dependencies:

- `utils`: No internal dependencies
- `logger`: No internal dependencies
- `files`: Depends on `utils`
- `sql`: No internal dependencies
- `ai`: No internal dependencies

### Infrastructure Package Dependencies

SDK infrastructure packages dependency relationships:

- `cache`: No internal dependencies
- `geo`: Depends on `utils`, `cache`
- `translator`: No internal dependencies
- `ocr`: Depends on `utils`
- `spider`: No internal dependencies
- `pdf`: Depends on `ocr`, `utils`
- `documents`: Depends on `files`, `pdf`, `spider`, `ocr`, `utils`

When adding new features, maintain this dependency hierarchy to avoid circular dependencies.

### Adding New Packages

When adding a new package to the SDK:

1. **Create package directory** in `packages/` with proper structure
2. **Add CLAUDE.md** file documenting the package's purpose and APIs
3. **Update root tsconfig.json** to include the new package in `references` array
4. **Update build order** in Turborepo if the package has dependencies
5. **Update SDK MCP Server** (`packages/sdk-mcp/src/registry.ts`) to include the new package in keyword mapping
6. **Run full build** to ensure TypeScript project references are correct

## Tooling Configuration

- **TypeScript**: Configured for ES2022 with strict type checking
- **Biome**: Used for linting and formatting
- **pnpm**: Package management with workspace support
- **Vitest**: Testing framework
- **Semantic Release**: Automated versioning and publishing
- **TypeDoc**: API documentation generation
- **Turborepo**: Build orchestration

## Documentation

The SDK includes automatic API documentation generation using TypeDoc:

```bash
npm run docs  # Generate documentation
```

Documentation is stored in `docs/manual` directory and generated as part of the build process.

## MCP Server Management

When adding MCP servers to the project:

- **Use the mcp-server-manager agent** - Always delegate MCP server setup to this specialized agent
- **Prefer bridge scripts** - Create nix-friendly bridge scripts in `scripts/mcp-servers/`
- **Use pnpm** - All package management should use pnpm
- **Nix compatibility** - Ensure all scripts use `/usr/bin/env` in shebangs
- **Local installation** - Install servers locally within the project
- **Avoid global dependencies** - Keep dependencies project-scoped for reproducibility

MCP servers should be wrapped in bridge scripts that handle connection setup, health monitoring, error handling, and cleanup.

## Contributing

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/sdk.git`
3. Install dependencies: `pnpm install`
4. Create a feature branch: `git checkout -b feat/issue-XXX-description`
5. Make your changes and write tests
6. Run quality checks: `npm run lint && npm test && npm run build`
7. Commit using conventional commits: `git commit -m "feat(package): description"`
8. Push and create a pull request

### Contribution Guidelines

1. Ensure code passes linting and formatting checks
2. Write tests for new functionality (follow [Testing Standard](../TESTING_STANDARD.md))
3. Update package documentation when adding features
4. Follow existing code patterns in each package
5. Use conventional commits
6. Don't include Claude branding in commit messages
7. Follow the SOPs in [Development Workflow](#development-workflow)

### Pull Request Process

1. Follow the [Create PR SOP](./notes/workflow/CREATE_PR_SOP.md)
2. Ensure all quality checks pass (lint, format, typecheck, tests)
3. Code reviewer agent will automatically review your changes
4. Address any feedback from reviewers
5. Squash commits before merge

## License

MIT License - see individual package LICENSE files for specifics.

## Links

- **GitHub Organization**: https://github.com/happyvertical
- **SDK Repository**: https://github.com/happyvertical/sdk
- **SMRT Framework**: https://github.com/happyvertical/smrt
- **SDK Issues**: https://github.com/happyvertical/sdk/issues

---

This repository is designed to support building AI agents with minimal overhead and maximum flexibility.
