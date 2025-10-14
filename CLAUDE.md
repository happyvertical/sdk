# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

## Monorepo Structure

The SDK is organized as a pnpm workspace with packages organized into two main categories:

### Core Packages (`packages/core/`)
Infrastructure and framework packages that provide foundational capabilities:

- **types**: Shared type definitions
- **utils**: Base utility functions used across all packages
- **logger**: Logging infrastructure with @have/logger
- **files**: File system operations (local and remote, Node.js-focused)
- **cache**: Caching utilities and abstractions
- **geo**: Geographic utilities and services
- **translator**: Translation services integration
- **sql**: Database interaction (SQLite and Postgres)
- **ocr**: Optical Character Recognition with multiple providers
- **pdf**: PDF parsing and processing with OCR fallback
- **ai**: Standardized AI interface (OpenAI, Anthropic, Google Gemini, AWS Bedrock)
- **spider**: Web crawling and content extraction
- **smrt**: Core AI agent framework with auto-generation capabilities
- **config**: Configuration management
- **languages**: Language support

### SMRT Modules (`packages/modules/`)
Domain-specific modules built on the SMRT framework:

- **tags**: Tagging system with hierarchies and contexts
- **places**: Places and location management
- **profiles**: User profile management
- **events**: Event management and scheduling
- **assets**: Asset management with versioning
- **content**: Content processing for documents and media
- **products**: Product catalog (reference implementation)
- **gnode**: Federation module for distributed knowledge bases

## Development Patterns

### Dependency Management

- Package versioning is synchronized across the monorepo
- Internal dependencies use `workspace:*` to reference other packages
- External dependencies are kept to a minimum
- Bun 1.0+ is required for all development and runtime environments

### Build Process

The build process follows a specific order to respect internal dependencies:

1. `@have/utils` (base utilities used by all packages)
2. `@have/files` (file system interactions)
3. `@have/sql` (database interactions, no internal dependencies)
4. `@have/ocr` (OCR processing, no internal dependencies)
5. `@have/pdf` (PDF processing with OCR integration)
6. `@have/ai` (AI model interfaces, no internal dependencies)
7. `@have/spider` (web crawling with files integration)
8. `@have/smrt` (core agent framework, depends on ai, files, sql, utils)

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
  "extends": "../../../tsconfig.json",  // Three levels up (packages/core/types -> root)
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
    // Core packages
    { "path": "./packages/core/types" },
    { "path": "./packages/core/utils" },
    { "path": "./packages/core/smrt" },
    // ... all 15 core packages

    // SMRT modules
    { "path": "./packages/modules/tags" },
    { "path": "./packages/modules/places" },
    // ... all 8 module packages
  ]
}
```

#### Common TypeScript Issues and Fixes

**Issue**: `Argument of type 'SmrtObjectOptions' is not assignable to parameter of type 'SmrtCollectionOptions'`

**Cause**: When passing `this.options` from a SmrtObject to a collection constructor, TypeScript sees incompatible types because SmrtObjectOptions has additional properties (id, name, slug, context) that collections don't need.

**Fix**: Extract only collection-compatible options when creating collections:
```typescript
// ❌ WRONG - Type error
const collection = new ProfileCollection(this.options);

// ✅ CORRECT - Extract only collection options
const { persistence, db, ai, fs, _className } = this.options;
const collection = new ProfileCollection({ persistence, db, ai, fs, _className });
```

**Never use `as any` to bypass type errors** - always find and fix the root cause.

#### Verifying TypeScript Configuration

```bash
# Check that all packages have proper project references
npx tsc --build --dry

# Force rebuild all projects
npx tsc --build --force

# Use Vite for actual builds (not raw tsc)
npm run build
```

### SMRT Modules (smrt/ directory)

The following packages are SMRT-specific modules located in the `smrt/` directory and excluded from the main build:

- `@have/content` (content processing, depends on smrt, pdf, spider)
- `@have/products` (microservice template and examples)

**Note**: All packages now use Node.js-only builds for simplified deployment and better performance. The dual-target (browser/node) architecture has been removed in favor of focused Node.js development.

### SMRT System Tables

The SMRT framework includes built-in system tables for storing framework metadata alongside user data. These tables use a `_smrt_` prefix to avoid naming conflicts:

#### System Tables Architecture

- **`_smrt_contexts`**: Context memory storage for AI agents
  - Stores remembered context (learned strategies, patterns, selectors) for reuse
  - Includes confidence tracking and hierarchical scoping (e.g., `discovery/parser/domain.com`)
  - Supports versioning and expiration for evolving patterns
  - Used by `remember()`, `recall()`, `recallAll()`, `forget()`, and `forgetScope()` methods

- **`_smrt_migrations`**: Schema version tracking
  - Records framework schema changes and migrations
  - Tracks applied migrations with timestamps and descriptions
  - Enables backward compatibility and upgrade paths

- **`_smrt_registry`**: Object registry persistence
  - Stores metadata about registered SMRT objects
  - Includes field definitions, relationships, and configuration
  - Supports runtime introspection and code generation

- **`_smrt_signals`**: Signal history and audit log
  - Records signal events across the application
  - Enables debugging, monitoring, and audit trails
  - Supports temporal queries and event replay

#### Database Initialization

System tables are automatically created when `SmrtClass.initialize()` is called:

```typescript
class MyAgent extends SmrtObject {
  // ...
}

const agent = new MyAgent({ db: 'my-database.db' });
await agent.initialize(); // System tables created automatically

// System tables are now available
await agent.remember({
  scope: 'discovery/parser',
  key: 'date-format',
  value: 'MM/DD/YYYY',
  confidence: 0.95
});
```

**Key Features**:
- **Idempotent initialization**: Tables only created once per database
- **Shared database**: System tables use the same database as user data
- **Per-database tracking**: Static Set tracks which databases have been initialized
- **No migration required**: Fresh installations get the latest schema automatically

#### Using System Tables

All SMRT objects have built-in methods for working with system tables:

```typescript
// Remember learned patterns
await agent.remember({
  scope: 'parser/html',
  key: 'selector',
  value: '.content > article',
  confidence: 0.9
});

// Recall patterns with hierarchical fallback
const selector = await agent.recall({
  scope: 'parser/html/example.com',
  key: 'selector',
  includeAncestors: true // Falls back to parent scopes
});

// Recall all matching patterns
const allSelectors = await agent.recallAll({
  scope: 'parser/html',
  includeDescendants: true // Includes child scopes
});

// Clean up old patterns
await agent.forget({
  scope: 'parser/html',
  key: 'old-selector'
});

await agent.forgetScope({
  scope: 'parser/html/old-domain.com'
});
```

**Hierarchical Scoping Example**:
```typescript
// Remember at specific scope
await agent.remember({
  scope: 'discovery/parser/example.com',
  key: 'date-format',
  value: 'MM/DD/YYYY'
});

// Remember at parent scope
await agent.remember({
  scope: 'discovery/parser',
  key: 'date-format',
  value: 'ISO-8601' // Fallback for unknown domains
});

// Recall with fallback
const format = await agent.recall({
  scope: 'discovery/parser/new-domain.com',
  key: 'date-format',
  includeAncestors: true
});
// Returns 'ISO-8601' (parent scope) since new-domain.com has no specific pattern
```

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

The packages have these dependency relationships:

- `utils`: No internal dependencies
- `files`: Depends on `utils`
- `spider`: Depends on `utils` and `files`
- `sql`: No internal dependencies
- `pdf`: No internal dependencies
- `ai`: No internal dependencies
- `smrt`: Depends on all other packages

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