# @have/utils

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Shared utility functions for the HAVE SDK.

## Overview

The `@have/utils` package provides common utility functions and helpers used across the HAVE SDK packages. It includes tools for working with arrays, objects, strings, errors, validation, and more.

## Features

- Type utilities and type guards
- String manipulation and formatting
- Array and object helpers
- Error handling and custom error classes
- Validation utilities
- Async helpers and concurrency tools
- Date and time utilities
- Logging utilities
- Random and UUID generation
- Memoization and caching utilities

## Installation

```bash
# Install with npm
npm install @have/utils

# Or with yarn
yarn add @have/utils

# Or with bun
bun add @have/utils
```

## Usage

### Type Guards and Checking

```typescript
import { isString, isNumber, isArray, isObject, isNullOrUndefined } from '@have/utils';

// Check types
isString('hello'); // true
isNumber(123); // true
isArray([1, 2, 3]); // true
isObject({ foo: 'bar' }); // true
isNullOrUndefined(null); // true
isNullOrUndefined(undefined); // true
```

### Object Manipulation

```typescript
import { 
  deepMerge, 
  pick, 
  omit, 
  flatten, 
  unflatten 
} from '@have/utils';

// Deep merge objects
const merged = deepMerge({ a: 1, b: { c: 2 } }, { b: { d: 3 }, e: 4 });
// Result: { a: 1, b: { c: 2, d: 3 }, e: 4 }

// Pick specific properties
const picked = pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
// Result: { a: 1, c: 3 }

// Omit specific properties
const omitted = omit({ a: 1, b: 2, c: 3 }, ['b']);
// Result: { a: 1, c: 3 }

// Flatten nested objects
const flattened = flatten({ a: { b: { c: 1, d: 2 }, e: 3 } });
// Result: { 'a.b.c': 1, 'a.b.d': 2, 'a.e': 3 }

// Unflatten objects
const unflattened = unflatten({ 'a.b.c': 1, 'a.b.d': 2, 'a.e': 3 });
// Result: { a: { b: { c: 1, d: 2 }, e: 3 } }
```

### String Utilities

```typescript
import { 
  camelCase, 
  snakeCase, 
  kebabCase, 
  pascalCase,
  slugify,
  truncate 
} from '@have/utils';

// Convert between case styles
camelCase('hello-world'); // 'helloWorld'
snakeCase('helloWorld'); // 'hello_world'
kebabCase('helloWorld'); // 'hello-world'
pascalCase('hello-world'); // 'HelloWorld'

// Create URL-friendly slugs
slugify('Hello World!'); // 'hello-world'

// Truncate text
truncate('This is a long text that will be truncated', 10); // 'This is a...'
```

### Async Utilities

```typescript
import { 
  retry, 
  timeout, 
  debounce, 
  throttle, 
  parallel 
} from '@have/utils';

// Retry a function
const result = await retry(
  async () => fetch('https://example.com/api'),
  { 
    attempts: 3, 
    delay: 1000,
    backoff: 'exponential' 
  }
);

// Add timeout to a promise
const data = await timeout(
  fetch('https://example.com/api').then(res => res.json()),
  5000 // 5 seconds
);

// Debounce a function
const debouncedSave = debounce(saveData, 500);
debouncedSave(); // Will execute after 500ms of inactivity

// Throttle a function
const throttledScroll = throttle(handleScroll, 100);
window.addEventListener('scroll', throttledScroll);

// Run multiple async tasks in parallel with concurrency limit
const results = await parallel(
  [task1, task2, task3, task4, task5],
  { concurrency: 2 } // Run 2 tasks at a time
);
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_utils.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.