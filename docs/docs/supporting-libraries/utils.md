---
id: utils
title: "@have/utils: Shared Utilities"
sidebar_label: "@have/utils"
sidebar_position: 7
---

# @have/utils: Shared Utilities

Shared utility functions used across SMRT packages including ID generation, string manipulation, and date handling.

## Overview

The `@have/utils` package provides common utilities:

- **🆔 ID Generation**: Unique identifier creation
- **📝 String Utilities**: Manipulation and formatting
- **📅 Date Handling**: Parsing and formatting
- **🔧 Type Utilities**: TypeScript helper types
- **🎲 Randomization**: Random value generation

## Quick Start

```typescript
import {
  generateId,
  slugify,
  formatDate,
  debounce,
  chunk
} from '@have/utils';

// Generate unique IDs
const id = generateId(); // "abc123def456"

// String manipulation
const slug = slugify('My Blog Post Title'); // "my-blog-post-title"

// Date formatting
const formatted = formatDate(new Date(), 'YYYY-MM-DD'); // "2024-01-15"

// Array utilities
const batches = chunk([1, 2, 3, 4, 5, 6], 2); // [[1, 2], [3, 4], [5, 6]]
```

## Common Utilities

```typescript
// Debouncing function calls
const debouncedSave = debounce(async (data) => {
  await saveToDatabase(data);
}, 1000);

// Deep object merging
const merged = deepMerge(defaultConfig, userConfig);

// Type checking
const isString = (value: unknown): value is string =>
  typeof value === 'string';

// Async retry with backoff
const result = await retry(
  () => fetchFromAPI(url),
  { attempts: 3, delay: 1000 }
);
```

## SMRT Integration

These utilities are used throughout the SMRT framework:

```typescript
// BaseObject uses utils for ID generation
class BaseObject {
  id: string = generateId();
  slug: string = '';

  async getSlug(): Promise<string> {
    return slugify(this.name || this.title || this.id);
  }
}
```

*Full documentation coming soon...*