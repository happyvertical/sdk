# Conventional Commits

This project follows the Conventional Commits specification for commit messages.

## Commit Message Format

```
{type}({scope}): {description}

{body}

Closes #{issue-number}
```

### Type

The type must be one of the following:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring (no functional changes)
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `perf`: Performance improvements
- `ci`: CI/CD configuration changes

### Scope

The scope should indicate the package or area of the codebase affected:

- Package names: `ai`, `sql`, `spider`, `pdf`, `utils`, etc.
- Areas: `cache`, `config`, `build`, `deps`, etc.

### Description

- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize the first letter
- No period at the end
- Keep it concise (50 characters or less)

### Body

- Explain what and why, not how
- Use bullet points for multiple changes
- Separate from description with a blank line
- Wrap at 72 characters

### Examples

```
feat(cache): add Redis provider support

- Implement RedisCache class with get/set/delete operations
- Add connection pooling and retry logic
- Add integration tests with real Redis (Docker)
- Add example tests for common patterns
- Update README with usage examples

Closes #123
```

```
fix(sql): handle null values in upsert operations

Fixes issue where null values were being converted to undefined,
causing database constraint violations.

- Add null value handling in upsert method
- Add regression test reproducing the issue
- Verified fix with SQLite and Postgres

Closes #45
```

```
docs(readme): update installation instructions

- Add Node.js 24+ requirement
- Include pnpm installation steps
- Update example code snippets

Closes #67
```

## Semantic Versioning

Conventional commits drive automatic semantic versioning:

- `feat:` → Minor version bump (0.45.0 → 0.46.0)
- `fix:`, `perf:`, `docs:`, `build:` → Patch version bump (0.45.0 → 0.45.1)
- `refactor:` → Minor version bump
- `BREAKING CHANGE:` in body → Minor version bump (until 1.0.0)
- `scope: no-release` → No version bump

## Tools

- **Commitizen**: Interactive CLI for creating commits
- **Commitlint**: Validates commit messages
- **Semantic Release**: Automates versioning and changelog generation

## Best Practices

1. **One commit per logical change**: Don't mix multiple unrelated changes
2. **Reference issues**: Always include `Closes #XXX` for issue tracking
3. **Write clear bodies**: Explain complex changes thoroughly
4. **Use present tense**: "add feature" not "added feature"
5. **Keep it atomic**: Each commit should be self-contained
