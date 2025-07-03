# HAppy VErtical SDK: Architecture and Development Guide

## Overview

The HAppy VErtical (HAVE) SDK is a TypeScript monorepo designed for building vertical AI agents. It follows these core principles:

- Pure TypeScript implementation to avoid CommonJS vs ESM compatibility issues
- Minimized dependencies through a modular monorepo architecture
- Compartmentalized code to keep AI agents lean and focused
- Support for testing and scaling with minimal overhead
- Standardized interfaces across different packages

## Monorepo Structure

The SDK is organized as a pnpm workspace with several packages that provide specific functionality:

- **ai**: A standardized interface for AI model interactions, currently supporting OpenAI
- **files**: Tools for interacting with file systems (local and remote)
- **pdf**: Utilities for parsing and processing PDF documents
- **smrt**: Core library for building AI agents with standardized collections and objects 
- **spider**: Web crawling and content parsing tools (renamed from "web")
- **sql**: Database interaction with support for SQLite and Postgres
- **utils**: Shared utility functions used across packages

## Development Patterns

### Dependency Management

- Package versioning is synchronized across the monorepo
- Internal dependencies use `workspace:*` to reference other packages
- External dependencies are kept to a minimum
- Node.js v22.x is required for all packages

### Build Process

The build process follows a specific order to respect internal dependencies:

1. `@have/utils` (base utilities used by all packages)
2. `@have/files` (file system interactions)
3. `@have/spider` (web crawling)
4. `@have/sql` (database interactions)
5. `@have/pdf` (PDF processing)
6. `@have/ai` (AI model interfaces)
7. `@have/smrt` (agent framework that depends on all the above)

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
- use pnpm 

### Testing

- Tests are written using Vitest
- Each package has its own test suite
- Run tests with `pnpm test` or `pnpm test:watch`

### Common Development Commands

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages in correct order
pnpm build

# Watch mode development
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm format
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

1. Ensure code passes Biome linting (`pnpm lint`)
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

## Tooling Configuration

- **TypeScript**: Configured for ES2022 with strict type checking
- **Biome**: Used for linting and formatting
- **pnpm**: Package management with workspace support
- **Vitest**: Testing framework
- **Changesets**: Used for versioning and publishing packages
- **TypeDoc**: Used for generating API documentation

## Documentation

The SDK includes automatic API documentation generation using TypeDoc. The documentation is stored in the `docs/manual` directory and can be viewed by opening `docs/manual/index.html` in a browser.

Documentation is generated as part of the build process, but can also be generated separately:

```bash
pnpm docs
```

The build pipeline integrates documentation generation after all packages are built and before repomix is run:

```bash
pnpm build  # Includes documentation generation
```

This repository is designed to support building AI agents with minimal overhead and maximum flexibility.

## 