# @have/utils: Foundational Utility Functions Package

## Purpose and Responsibilities

The `@have/utils` package provides foundational utility functions used throughout the HAVE SDK. It serves as the base dependency for most other packages and is designed to be the lowest-level package in the dependency hierarchy. It offers essential functionality for:

- **Cross-platform compatibility**: Provides universal utilities that work in both browser and Node.js environments
- **Unique ID generation**: CUID2 and UUID generation for different use cases
- **String manipulation**: URL-safe slug generation, case conversions, and key transformations
- **Date handling**: Date parsing from filenames, formatting, and Amazon date string parsing
- **Path operations**: Cross-platform temporary directory handling and URL path manipulation
- **Type checking**: Safe type guards for arrays, objects, and URLs
- **Async utilities**: Polling functions and sleep utilities with timeout handling
- **Error handling**: Structured error classes with context for debugging
- **Logging**: Configurable logging interface for consistent debugging across packages

This package is intentionally lightweight with minimal external dependencies and focuses on providing pure, testable utility functions that form the foundation of the entire SDK.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (@paralleldrive/cuid2, date-fns, pluralize, uuid) as they frequently add new features, performance improvements, and API changes that can enhance utility implementations.

## Key APIs

### ID Generation

```typescript
import { makeId } from '@have/utils';

// Generate a CUID2 (default, more secure than UUID)
const id = makeId(); // "ckx5f8h3z0000qzrmn831i7rn"

// Generate UUID when needed for RFC4122 compliance
const uuid = makeId('uuid'); // "f47ac10b-58cc-4372-a567-0e02b2c3d479"

// The implementation provides:
// - CUID2 by default (more secure and collision-resistant)
// - UUID fallback with crypto.randomUUID() or custom implementation
```

### Slug Generation

```typescript
import { makeSlug } from '@have/utils';

// Convert strings to URL-friendly slugs
const slug = makeSlug("My Example Title & Co."); // "my-example-title-38-co"
const blogSlug = makeSlug("Understanding AI/ML Models"); // "understanding-ai-ml-models"

// Handles international characters
const intlSlug = makeSlug("Café España"); // "cafe-espana"
```

### Path Utilities

```typescript
import { urlPath, urlFilename, getTempDirectory } from '@have/utils';

// Extract path components from URLs
const urlPathString = urlPath("https://example.com/path/to/resource");
// Returns: "example.com/path/to/resource"

// Get filename from URL
const filename = urlFilename("https://example.com/path/to/file.pdf");
// Returns: "file.pdf"

// Get temporary directory (cross-platform)
const tempPath = getTempDirectory("my-folder");
// Node.js: "/tmp/.have-sdk/my-folder"
// Browser: "/temp/.have-sdk/my-folder"
```

### String Case Conversions

```typescript
import { camelCase, snakeCase, keysToCamel, keysToSnake } from '@have/utils';

// Convert individual strings
const camelString = camelCase("some-string-here"); // "someStringHere"
const snakeString = snakeCase("someStringHere"); // "some_string_here"

// Transform object keys recursively
const apiResponse = {
  user_name: "john",
  user_details: {
    first_name: "John",
    last_name: "Doe",
    contact_info: ["email@example.com"]
  }
};

const camelCaseObj = keysToCamel(apiResponse);
// Result: { userName: "john", userDetails: { firstName: "John", ... } }

const snakeCaseObj = keysToSnake({ userName: "john", userDetails: {...} });
// Converts back to snake_case structure
```

### Date Utilities

```typescript
import { dateInString, prettyDate, parseAmazonDateString } from '@have/utils';

// Extract dates from filenames (useful for processing files)
const date = dateInString("Report_January_15_2023.pdf");
// Returns: Date object for January 15, 2023

const date2 = dateInString("financial-report-dec-2023.pdf");
// Returns: Date object for December 2023

// Format dates in human-readable format
const formatted = prettyDate("2023-01-15T12:00:00Z");
// Returns: "January 15, 2023" (localized)

// Parse Amazon date strings (for AWS integrations)
const awsDate = parseAmazonDateString('20220223T215409Z');
// Returns: Date object for February 23, 2022, 21:54:09 UTC
```

### Async Utilities

```typescript
import { waitFor, sleep } from '@have/utils';

// Wait for a condition with timeout and custom delay
await waitFor(
  async () => {
    const result = await checkSomeCondition();
    return result?.isReady ? result : undefined;
  },
  { timeout: 10000, delay: 500 }
);

// Simple sleep utility
await sleep(1000); // Wait 1 second

// Polling example for file operations
await waitFor(
  async () => {
    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
    return fileExists;
  },
  { timeout: 30000, delay: 1000 }
);
```

### Type Checking

```typescript
import { isArray, isPlainObject, isUrl } from '@have/utils';

// Safe type guards
function processData(data: unknown) {
  if (isArray(data)) {
    // TypeScript knows data is unknown[]
    data.forEach(item => console.log(item));
  }
  
  if (isPlainObject(data)) {
    // TypeScript knows data is Record<string, unknown>
    Object.keys(data).forEach(key => console.log(key, data[key]));
  }
}

// URL validation
const userInput = "https://example.com";
if (isUrl(userInput)) {
  // Safe to use as URL
  const url = new URL(userInput);
}
```

### Error Handling

```typescript
import { 
  ValidationError, 
  NetworkError, 
  TimeoutError, 
  ParsingError 
} from '@have/utils';

// Structured error handling with context
function validateUserInput(input: string) {
  if (!input || input.length < 3) {
    throw new ValidationError('Input too short', {
      input,
      minLength: 3,
      actualLength: input?.length || 0
    });
  }
}

// Network operations with context
async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new NetworkError('HTTP error', {
        status: response.status,
        statusText: response.statusText,
        url
      });
    }
    return response.json();
  } catch (error) {
    if (error instanceof NetworkError) {
      console.error('Network issue:', error.toJSON());
    }
    throw error;
  }
}
```

### Logging

```typescript
import { getLogger, setLogger, disableLogging } from '@have/utils';

// Use default console logger
const logger = getLogger();
logger.info('Processing started', { userId: 123 });
logger.error('Process failed', { error: 'Connection timeout', retryCount: 3 });

// Disable logging in production
if (process.env.NODE_ENV === 'production') {
  disableLogging();
}

// Custom logger implementation
class CustomLogger implements Logger {
  info(message: string, context?: Record<string, unknown>) {
    // Send to external logging service
    logService.send({ level: 'info', message, context });
  }
  // ... implement other methods
}

setLogger(new CustomLogger());
```

### Utility Functions

```typescript
import { logTicker, domainToCamel } from '@have/utils';

// Visual progress indicator
let tick = null;
setInterval(() => {
  tick = logTicker(tick);
  process.stdout.write(`\rProcessing ${tick}`);
}, 500);
// Outputs: "Processing ." → "Processing .." → "Processing ..." → repeats

// Domain string conversion
const camelDomain = domainToCamel("api-service"); // "apiService"
```

## Dependencies

The package has carefully selected minimal external dependencies:

### External Dependencies
- **@paralleldrive/cuid2** (^2.2.2): Secure, collision-resistant ID generation
  - More secure and readable than UUIDs
  - Optimized for distributed systems and horizontal scaling
  - Cryptographically secure with multiple entropy sources

- **date-fns** (^3.3.1): Modern JavaScript date utility library
  - Comprehensive date manipulation and formatting
  - Tree-shakable for minimal bundle size
  - Better timezone support than native Date

- **pluralize** (^8.0.0): English word pluralization
  - Handles singular/plural transformations
  - Customizable rules for edge cases
  - Used for generating readable API responses

- **uuid** (^9.0.1): RFC4122 UUID generation
  - Industry standard for unique identifiers
  - Multiple UUID versions (v1, v4, v5, etc.)
  - Fallback option for environments needing RFC compliance

### Internal Dependencies
None - this package is the foundation layer with no internal HAVE SDK dependencies.

## Development Guidelines

### Cross-Platform Development

When adding utilities:

1. **Universal first**: Write functions that work in both browser and Node.js
2. **Platform-specific when needed**: Use separate files for environment-specific code
3. **Graceful fallbacks**: Provide fallback implementations for missing APIs
4. **Test both environments**: Ensure functions work correctly in all target environments

```typescript
// Example: Universal approach with fallbacks
export const timeNow = (): number => {
  // Browser: Use performance.now() if available
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  
  // Node.js: Use high-resolution timer
  if (typeof process !== 'undefined' && process.hrtime) {
    const time = process.hrtime();
    return Math.round(time[0] * 1e3 + time[1] / 1e6);
  }
  
  // Fallback: Standard Date.now()
  return Date.now();
};
```

### ID Generation Strategy

**CUID2 vs UUID Guidelines**:
- **Use makeId() (UUID)** for:
  - Internal system identifiers
  - Database primary keys
  - When RFC4122 compliance is required
  - Legacy system integration

- **Consider @paralleldrive/cuid2 directly** for:
  - User-facing identifiers (shorter, more readable)
  - Distributed systems requiring collision resistance
  - When security and unpredictability are priorities
  - High-performance scenarios

### Error Handling Patterns

```typescript
// Always provide context in custom errors
throw new ValidationError('Invalid email format', {
  email: userInput,
  pattern: EMAIL_REGEX.toString(),
  validExamples: ['user@example.com', 'test@domain.org']
});

// Use specific error types for better error handling
try {
  const result = await parseData(input);
} catch (error) {
  if (error instanceof ParsingError) {
    // Handle parsing-specific issues
    logger.warn('Data parsing failed', error.context);
  } else if (error instanceof ValidationError) {
    // Handle validation issues
    return { success: false, errors: [error.message] };
  } else {
    // Handle unexpected errors
    throw error;
  }
}
```

### Testing

The package includes comprehensive tests using Vitest:

```bash
bun test              # Run tests once
bun test --watch      # Run tests in watch mode  
bun test --coverage   # Run with coverage report
```

**Testing Guidelines**:
- Test both browser and Node.js environments
- Include edge cases and error conditions
- Test async utilities with various timeout scenarios
- Verify type guards work correctly with TypeScript
- Test cross-platform path utilities

### Building

Build the package with environment-specific outputs:

```bash
bun run build         # Build both browser and Node.js versions
bun run build:browser # Build browser-specific bundle
bun run build:node    # Build Node.js-specific bundle
bun run build:watch   # Build in watch mode
```

### Performance Considerations

- **Function purity**: Keep utilities stateless for predictable performance
- **Memoization**: Consider caching for expensive operations called frequently
- **Bundle size**: Minimize dependencies and prefer tree-shakable implementations
- **Memory usage**: Clean up resources in async utilities
- **Type guards**: Use efficient type checking methods

### Best Practices

- **Single responsibility**: Each utility should do one thing well
- **Predictable behavior**: Functions should handle edge cases gracefully
- **TypeScript first**: Provide strong types for all parameters and returns
- **Documentation**: Use JSDoc for complex functions and edge cases
- **Error messages**: Provide clear, actionable error messages with context
- **Version compatibility**: Consider backward compatibility when updating APIs

## API Documentation

The @have/utils package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

### Generated Documentation Formats

**HTML Documentation** (recommended for browsing):
- Generated in `docs/` directory for public website
- Full API reference with interactive navigation
- Cross-linked type definitions and examples
- Accessible via development server at `http://localhost:3030/`

**Markdown Documentation** (great for development):
- Generated in `packages/utils/docs/` directory
- Markdown format perfect for IDE integration
- Accessible via development server at `http://localhost:3030/packages/utils/`

### Generating Documentation

```bash
# Generate documentation for this package
npm run docs

# Generate and watch for changes during development
npm run docs:watch

# Start development server to browse documentation
npm run dev  # Serves docs at http://localhost:3030
```

### Development Workflow

Documentation is automatically generated during the build process and can be viewed alongside development:

1. **During Development**: Use `npm run docs:watch` to regenerate docs as you code
2. **Local Browsing**: Access HTML docs at `http://localhost:3030/` or markdown at `http://localhost:3030/packages/utils/`
3. **IDE Integration**: Point your editor to `packages/utils/docs/` for offline markdown reference

The documentation includes complete API coverage, usage examples, and cross-references to related HAVE SDK packages.

## Documentation Links

Always reference the latest documentation when planning utility implementations, as these libraries frequently add new features and performance improvements:

### Core Libraries

- **@paralleldrive/cuid2**: [NPM Package](https://www.npmjs.com/package/@paralleldrive/cuid2) | [GitHub](https://github.com/paralleldrive/cuid2)
  - Next-generation CUID with improved collision resistance
  - Check for new configuration options and security enhancements

- **date-fns**: [Official Documentation](https://date-fns.org/) | [GitHub](https://github.com/date-fns/date-fns)
  - Modern JavaScript date utility library
  - Monitor for new timezone handling features and locale support

- **pluralize**: [NPM Package](https://www.npmjs.com/package/pluralize) | [GitHub](https://github.com/plurals/pluralize)
  - English word pluralization utilities
  - Review for new language rules and custom rule support

- **uuid**: [NPM Package](https://www.npmjs.com/package/uuid) | [GitHub](https://github.com/uuidjs/uuid)
  - RFC4122 UUID generation
  - Check for new UUID versions and performance improvements

### Expert Agent Instructions

When working with @have/utils:

1. **Always check latest documentation** before implementing solutions using WebFetch tool
2. **Stay current with API changes** - utility libraries evolve to improve performance
3. **Review new features** that could simplify common operations
4. **Check for breaking changes** in major version updates
5. **Look for security updates** especially for ID generation libraries

Example workflow:
```typescript
// Before implementing a date solution, check latest docs
await WebFetch.get('https://date-fns.org/docs/latest');
// Then implement with current best practices
import { format, parseISO } from 'date-fns';
```

## Cross-Package Usage Patterns

As the foundational package, @have/utils is used throughout the SDK:

### Common Integration Patterns

```typescript
// Files package: Path and ID utilities
import { makeSlug, urlFilename } from '@have/utils';
const filename = `${makeSlug(title)}_${makeId()}.${extension}`;

// AI package: Error handling and logging
import { NetworkError, getLogger } from '@have/utils';
const logger = getLogger();

// Spider package: URL utilities and async operations
import { isUrl, waitFor, sleep } from '@have/utils';

// SQL package: Key transformations for data normalization
import { keysToCamel, keysToSnake } from '@have/utils';
```

### Performance Optimization

- Utilities are designed for frequent use across packages
- Functions are pure and stateless for predictable performance
- String operations are optimized for common use cases
- Async utilities include proper cleanup and timeout handling

This package provides the essential building blocks that enable all other HAVE SDK packages to function reliably across different environments while maintaining consistent behavior and error handling patterns.