# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

## Monorepo Structure

The SDK is organized as a bun workspace with several packages that provide specific functionality:

- **ai**: A standardized interface for AI model interactions across multiple providers (OpenAI, Anthropic, Google Gemini, AWS Bedrock)
- **content**: Content processing module for documents, web content, and media (SMRT-specific module, excluded from main build)
- **files**: Tools for interacting with file systems (local and remote, Node.js-focused)
- **ocr**: Optical Character Recognition with multiple provider support
- **pdf**: Utilities for parsing and processing PDF documents with OCR fallback
- **smrt**: Core AI agent framework with standardized collections and code generators (simplified, no longer includes content processing)
- **spider**: Web crawling and content parsing tools
- **sql**: Database interaction with support for SQLite and Postgres
- **utils**: Shared utility functions used across packages

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

### SMRT Modules (smrt/ directory)

The following packages are SMRT-specific modules located in the `smrt/` directory and excluded from the main build:

- `@have/content` (content processing, depends on smrt, pdf, spider)
- `@have/products` (microservice template and examples)

**Note**: All packages now use Node.js-only builds for simplified deployment and better performance. The dual-target (browser/node) architecture has been removed in favor of focused Node.js development.

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
- Use bun for all package management and builds
- Ensure all scripts and tools are nix-friendly (use /usr/bin/env in shebangs)

### Testing

- Tests are written using Vitest
- Each package has its own test suite
- Run tests with `bun test` or `bun test --watch`

### Common Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build all packages in correct order
bun run build

# Watch mode development
bun run dev

# Lint code
bun run lint

# Format code
bun run format
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

1. Ensure code passes Biome linting (`bun lint`)
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
bun run docs
```

The build pipeline integrates documentation generation after all packages are built and before repomix is run:

```bash
bun run build  # Includes documentation generation
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
- **Use bun** - All package management should use bun, not npm or yarn
- **Nix compatibility** - Ensure all scripts use `/usr/bin/env` in shebangs
- **Local installation** - Install servers locally within the project when possible
- **Avoid global dependencies** - Keep dependencies project-scoped for reproducibility

### Bridge Script Pattern

MCP servers should be wrapped in bridge scripts that:
1. Handle connection setup and health monitoring
2. Use localhost-only binding for security
3. Implement proper error handling and cleanup
4. Are nix-friendly with proper shebangs
5. Use bun for any package operations

Example structure:
```bash
#!/usr/bin/env bash
# Bridge script for MCP server
# Uses bun for package management
# Implements health checks and error handling
``` 