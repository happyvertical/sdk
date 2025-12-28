---
"@happyvertical/utils": minor
---

Add `number` type support to CLI `OptionConfig`.

Previously `OptionConfig.type` only supported `'string' | 'boolean'`. Now it supports `'number'` as well:

```typescript
const command = {
  name: 'search',
  options: {
    limit: { type: 'number', description: 'Max results', default: 50 },
    threshold: { type: 'number', description: 'Match threshold', short: 't' }
  }
};

// Handler receives actual numbers, not strings
const result = parseCliArgs(['search', '--limit=100', '-t', '0.75'], [command]);
console.log(result.options.limit);     // 100 (number)
console.log(result.options.threshold); // 0.75 (number)
```

Features:
- Automatic conversion from string to number after parsing
- Supports integers, decimals, negative numbers, and scientific notation
- Validates that values are valid numbers (throws error for invalid values like `--limit=abc`)
- Empty string values are treated as invalid (throws error for `--limit=`)
- Default values work correctly with number types
