# @have/utils: Utility Functions Package

## Purpose and Responsibilities

The `@have/utils` package provides foundational utility functions used throughout the HAVE SDK. It serves as the base dependency for most other packages and offers common functionality for:

- File system path handling
- URL parsing and manipulation
- String manipulation and formatting
- Date handling and parsing
- Data structure transformation
- Unique ID generation

This package is intentionally lightweight with minimal external dependencies and focused on providing pure utility functions.

## Key APIs

### ID and Slug Generation

```typescript
// Generate a UUID
const id = makeId();

// Convert a string to a URL-friendly slug
const slug = makeSlug("My Example Title");
```

### Path Utilities

```typescript
// Get a temporary directory path
const tempPath = tmpdir("my-folder");

// Extract path components from a URL
const urlPathString = urlPath("https://example.com/path/to/resource");

// Get filename from URL
const filename = urlFilename("https://example.com/path/to/file.pdf");
```

### String Manipulation

```typescript
// Convert keys to camelCase
const camelCaseObj = keysToCamel({ some_key: "value" });

// Convert keys to snake_case
const snakeCaseObj = keysToSnake({ someKey: "value" });

// Convert string to camelCase
const camelString = camelCase("some-string-here");

// Convert string to snake_case
const snakeString = snakeCase("someStringHere");
```

### Date Utilities

```typescript
// Parse a date from a string
const date = dateInString("Report_January_2023.pdf");

// Format a date in a pretty format
const formatted = prettyDate("2023-01-15T12:00:00Z");
```

### Async Utilities

```typescript
// Wait for a condition with timeout
await waitFor(
  async () => { /* return something when ready */ },
  { timeout: 5000, delay: 100 }
);

// Sleep for a duration
await sleep(1000);
```

### Type Checking

```typescript
// Check if value is an array
const isArrayVal = isArray(value);

// Check if value is a plain object
const isObjVal = isPlainObject(value);

// Check if string is a URL
const isValidUrl = isUrl("https://example.com");
```

## Dependencies

`@have/utils` has minimal external dependencies:

- `@paralleldrive/cuid2`: For ID generation
- `date-fns`: For date manipulation
- `pluralize`: For singular/plural string transformation
- `uuid`: For UUID generation

## Development Guidelines

### Adding New Utilities

When adding new utility functions:

1. Keep functions pure and focused on a single responsibility
2. Add type definitions for parameters and return values
3. Use descriptive names that indicate function purpose
4. Write unit tests for each new function

### Testing

The package uses Vitest for testing. Run tests with:

```bash
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
```

### Building

Build the package with:

```bash
pnpm build       # Build once
pnpm build:watch # Build in watch mode
```

### Best Practices

- Keep utility functions stateless when possible
- Prefer functional programming patterns
- Document complex functions with JSDoc comments
- Write utilities to be reusable across different contexts
- Consider performance implications for functions that may be called frequently

This package should remain lightweight and focused on general-purpose utilities that might be needed by multiple other packages.