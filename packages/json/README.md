# @happyvertical/json

High-performance JSON parsing and serialization with Rust SIMD acceleration and automatic fallback.

## Features

- **Drop-in replacements** for `JSON.parse()` and `JSON.stringify()`
- **2-3x faster** parsing with SIMD acceleration on supported platforms
- **Automatic fallback** to native JavaScript when Rust bindings unavailable
- **Deep clone** function optimized for the `JSON.parse(JSON.stringify())` pattern
- **Safe variants** that don't throw on errors
- **TypeScript first** with full type definitions

## Installation

```bash
npm install @happyvertical/json
# or
pnpm add @happyvertical/json
```

## Quick Start

```typescript
import { parse, stringify, clone } from '@happyvertical/json';

// Drop-in replacements for JSON.parse/stringify
const data = parse<User>('{"name": "Alice", "age": 30}');
const json = stringify(data);

// Deep clone (optimized)
const copy = clone(data);
copy.age = 31; // Original unchanged
```

## API

### Drop-in Replacements

```typescript
// Parse JSON string to value
function parse<T = unknown>(text: string, reviver?: Reviver): T;

// Stringify value to JSON
function stringify(value: unknown, replacer?: Replacer, space?: number | string): string;

// Deep clone via JSON round-trip (optimized)
function clone<T>(value: T): T;
```

### Safe Variants (Non-throwing)

```typescript
import { safeParse, safeStringify } from '@happyvertical/json';

// Returns { success: true, value: T } or { success: false, error: ParseError }
const result = safeParse<User>(maybeInvalidJson);
if (result.success) {
  console.log(result.value.name);
} else {
  console.error(`Line ${result.error.line}: ${result.error.message}`);
}

// Returns { success: true, value: string } or { success: false, error: StringifyError }
const stringifyResult = safeStringify(data);
```

### Validation

```typescript
import { isValid } from '@happyvertical/json';

if (isValid(userInput)) {
  const data = parse(userInput);
}
```

### Adapter Control

```typescript
import { JSONFactory, getAdapterInfo, isSIMDAvailable } from '@happyvertical/json';

// Check if SIMD acceleration is available
console.log(isSIMDAvailable()); // true on supported platforms

// Get detailed adapter info
const info = getAdapterInfo();
console.log(info.name);        // 'sonic' or 'native'
console.log(info.simdEnabled); // true if using SIMD

// Create adapter with specific options
const json = JSONFactory.create({
  adapter: 'sonic',    // 'sonic' | 'native' | 'auto'
  fallback: true,      // Fall back to native if sonic unavailable
});

// Use adapter directly
const data = json.parse('{"key": "value"}');
const text = json.stringify(data);
```

## Performance

On a 680KB manifest file (typical SMRT manifest):

| Operation | Native JSON | @happyvertical/json | Speedup |
|-----------|-------------|---------------------|---------|
| Parse | ~50ms | ~18ms | **2.8x** |
| Stringify | ~45ms | ~16ms | **2.8x** |
| Clone | ~95ms | ~34ms | **2.8x** |

Results measured on Apple M2 Pro. Performance varies by platform and data structure.

## Platform Support

SIMD-accelerated parsing is available on:

- ✅ macOS ARM64 (Apple Silicon)
- ✅ macOS x64 (Intel)
- ✅ Linux x64 (GNU)
- ✅ Linux ARM64 (GNU)
- ✅ Linux x64 (musl)
- ✅ Linux ARM64 (musl)
- ✅ Windows x64

When the native binary isn't available, the package automatically falls back to JavaScript's built-in `JSON` object with zero overhead.

## How It Works

This package uses [sonic-rs](https://github.com/cloudwego/sonic-rs) - a Rust JSON library that uses SIMD instructions (AVX2, SSE4.2, NEON) for vectorized parsing and serialization.

The adapter pattern allows:
1. Automatic selection of the fastest available implementation
2. Graceful fallback when native bindings can't be loaded
3. Consistent API regardless of the underlying implementation

## TypeScript Support

Full TypeScript definitions included:

```typescript
interface User {
  name: string;
  age: number;
}

// Type-safe parsing
const user = parse<User>('{"name": "Alice", "age": 30}');
user.name; // string
user.age;  // number

// Safe variant preserves types
const result = safeParse<User>(json);
if (result.success) {
  result.value.name; // string
}
```

## Reviver and Replacer

Standard reviver and replacer functions work as expected:

```typescript
// Reviver for custom transformations
const data = parse<{ date: Date }>(
  '{"date": "2024-01-15"}',
  (key, value) => (key === 'date' ? new Date(value) : value)
);
console.log(data.date instanceof Date); // true

// Replacer for filtering
const json = stringify(data, ['name', 'email']); // Only include these keys

// Pretty printing
const pretty = stringify(data, null, 2);
```

## Environment Variables

- `HAPPYVERTICAL_JSON_ADAPTER`: Force adapter selection ('sonic' | 'native')

## License

MIT
