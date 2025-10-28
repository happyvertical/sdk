

# Building and Development

## Turborepo Build System

The SDK uses [Turborepo](https://turbo.build/repo/docs) for intelligent build orchestration:

- **Automatic Dependency Resolution**: Turborepo determines build order automatically based on package dependencies
- **Incremental Builds**: Only rebuilds packages that have changed (and their dependents)
- **Local Caching**: Build outputs are cached in `.turbo/` directory
- **CI/CD Caching**: GitHub Actions shares build artifacts across runs

### Common Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages (incremental, uses cache when possible)
npm run build

# Clean all build artifacts and rebuild
npm run build:clean

# Build in watch mode (rebuilds on file changes)
npm run dev

# Run tests
npm test

# Run linter
npm run lint

# Type check
npm run typecheck
```

### Working with Package Dependencies

When you modify a package, Turborepo will automatically:
1. Rebuild that package
2. Rebuild any packages that depend on it
3. Skip rebuilding packages that haven't changed

This means you can focus on your changes and let Turborepo handle the build orchestration.

# Coding Guidelines
- Follow the Airbnb JavaScript Style Guide.
- Add comments to clarify non-obvious logic. **Ensure all comments are written in English.**
- Provide corresponding unit tests for all new features.
- After implementation, verify changes by running:
  ```bash
  npm run lint  # Ensure code style compliance
  npm test     # Verify all tests pass
  ```

## Commit Messages
- Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for all commit messages
- Always include a scope in your commit messages
- Format: `type(scope): Description`
- Types: feat, fix, docs, style, refactor, test, chore, etc.
- Scope should indicate the affected part of the codebase (cli, core, website, security, etc.)
- Description should be clear and concise in present tense
- Description must start with a capital letter

## Pull Request Guidelines
- All pull requests must follow the template:
  ```md
  <!-- Please include a summary of the changes -->

  ## Checklist

  - [ ] Run `npm test`
  - [ ] Run `npm run lint`
  ```
- Include a clear summary of the changes at the top of the pull request description
- Reference any related issues using the format `#issue-number` 

## Dependencies and Testing
- Inject dependencies through a deps object parameter for testability
- Example:
  ```typescript
  export const functionName = async (
    param1: Type1,
    param2: Type2,
    deps = {
      defaultFunction1,
      defaultFunction2,
    }
  ) => {
    // Use deps.defaultFunction1() instead of direct call
  };
  ```
- Mock dependencies by passing test doubles through deps object
- Use vi.mock() only when dependency injection is not feasible

## Generate Comprehensive Output
- Include all content without abbreviation, unless specified otherwise
- Optimize for handling large codebases while maintaining output quality