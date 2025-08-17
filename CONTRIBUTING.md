

# Coding Guidelines
- Follow the Airbnb JavaScript Style Guide.
- Add comments to clarify non-obvious logic. **Ensure all comments are written in English.**
- Provide corresponding unit tests for all new features.
- After implementation, verify changes by running:
  ```bash
  bun lint  # Ensure code style compliance
  bun test  # Verify all tests pass
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

  - [ ] Run `bun test`
  - [ ] Run `bun lint`
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