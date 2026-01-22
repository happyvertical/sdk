# @happyvertical/json - Development Guide

High-performance JSON parsing and serialization with Rust SIMD acceleration.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    @happyvertical/json                  │
├─────────────────────────────────────────────────────────┤
│  index.ts (drop-in functions: parse, stringify, clone)  │
├─────────────────────────────────────────────────────────┤
│  factory.ts (JSONFactory.create() → JSONAdapter)        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐              ┌─────────────┐          │
│  │SonicAdapter │              │NativeAdapter│          │
│  │   (Rust)    │              │    (JS)     │          │
│  └─────────────┘              └─────────────┘          │
│         │                            │                  │
│         └────────────────────────────┘                  │
│                       │                                 │
│           ┌───────────┴───────────┐                     │
│           │    JSONAdapter        │                     │
│           │  (common interface)   │                     │
│           └───────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main exports and drop-in functions |
| `src/types.ts` | TypeScript interfaces |
| `src/factory.ts` | JSONFactory for adapter creation |
| `src/adapters/native.ts` | JavaScript fallback adapter |
| `src/adapters/sonic.ts` | Rust sonic-rs adapter wrapper |
| `src/lib.rs` | Rust implementation with sonic-rs |
| `Cargo.toml` | Rust dependencies |

## Building

### TypeScript only (no native module)

```bash
cd packages/json
pnpm install
pnpm build  # Builds TypeScript, skips Rust if not available
```

### With Rust native module

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Build native module
cd packages/json
pnpm install
pnpm build:rust  # Builds Rust native module
pnpm build       # Builds TypeScript
```

### Cross-compilation

```bash
# Install cross
cargo install cross

# Build for different targets
cross build --release --target aarch64-unknown-linux-gnu
cross build --release --target x86_64-unknown-linux-musl
```

## Testing

```bash
# Run unit tests
pnpm test

# Run benchmarks
pnpm test:bench

# Watch mode
pnpm test:watch
```

## Adapter Pattern

### Why adapters?

1. **Graceful degradation**: Works everywhere, fast where possible
2. **Testability**: Can test native adapter in isolation
3. **Future-proof**: Easy to add new backends (simd-json, etc.)

### Creating adapters

```typescript
import { JSONFactory } from '@happyvertical/json';

// Auto-select best available
const auto = JSONFactory.create();

// Force native (for testing)
const native = JSONFactory.create({ adapter: 'native' });

// Force sonic, throw if unavailable
const sonic = JSONFactory.create({ adapter: 'sonic', fallback: false });
```

### Checking availability

```typescript
import { isSonicAvailable } from '@happyvertical/json/adapters';
import { isSIMDAvailable } from '@happyvertical/json';

// Low-level check
if (isSonicAvailable()) {
  console.log('Rust bindings loaded');
}

// High-level check
if (isSIMDAvailable()) {
  console.log('Using SIMD acceleration');
}
```

## Rust Implementation

### sonic-rs

We use [sonic-rs](https://github.com/cloudwego/sonic-rs) from ByteDance/CloudWeGo:

- **SIMD parsing**: Uses AVX2/SSE4.2 on x86, NEON on ARM
- **Serde compatible**: Works with standard Rust serialization
- **Battle-tested**: Used at scale by ByteDance

### napi-rs

Bindings via [napi-rs](https://napi.rs/):

- **Zero-copy**: Efficient data transfer JS ↔ Rust
- **Multi-platform**: Handles cross-compilation
- **Async support**: Non-blocking operations possible

### Key Rust functions

```rust
// src/lib.rs

#[napi]
pub fn parse(input: String) -> Result<serde_json::Value>;

#[napi]
pub fn stringify(value: serde_json::Value) -> Result<String>;

#[napi]
pub fn clone(value: serde_json::Value) -> Result<serde_json::Value>;

#[napi]
pub fn is_valid(input: String) -> bool;
```

## Performance Considerations

### When sonic-rs helps most

- Large JSON files (100KB+)
- Deep nesting
- Many string values
- Repeated parsing of same structure

### When native JSON is fine

- Small objects (<1KB)
- Simple structures
- Infrequent parsing
- Browser environments (no native module)

### Benchmarking

```typescript
import { bench } from 'vitest';

bench('native JSON.parse', () => {
  JSON.parse(largeJson);
});

bench('@happyvertical/json parse', () => {
  parse(largeJson);
});
```

## Adding New Adapters

1. Create adapter class implementing `JSONAdapter`
2. Add to `factory.ts` adapter selection
3. Add availability check
4. Update tests

Example:

```typescript
// src/adapters/simd-json.ts
export class SimdJsonAdapter implements JSONAdapter {
  readonly name = 'simd-json' as const;
  readonly isNative = false;

  parse<T>(text: string): T {
    return simdJson.parse(text);
  }

  // ... other methods
}
```

## CI/CD

### Build workflow

The `build-json-native.yml` workflow:

1. Builds Rust for all target platforms
2. Creates platform-specific npm packages
3. Publishes to GitHub Packages

### Platform packages

- `@happyvertical/json-darwin-arm64`
- `@happyvertical/json-darwin-x64`
- `@happyvertical/json-linux-x64-gnu`
- `@happyvertical/json-linux-arm64-gnu`
- `@happyvertical/json-linux-x64-musl`
- `@happyvertical/json-linux-arm64-musl`
- `@happyvertical/json-win32-x64-msvc`

## Troubleshooting

### "Cannot find native module"

Native module not available for your platform. The package automatically falls back to native JSON.

### Performance not improved

Check if SIMD is actually being used:

```typescript
import { getAdapterInfo } from '@happyvertical/json';
console.log(getAdapterInfo());
// { name: 'sonic', isNative: false, simdEnabled: true, ... }
```

### Build failures

Ensure Rust toolchain is installed:

```bash
rustc --version
cargo --version
```

## Integration with SMRT

This package was created to optimize SMRT CLI startup:

```typescript
// In SMRT manifest-loader.ts
import { parse } from '@happyvertical/json';

// 2-3x faster manifest parsing
const manifest = parse<SmrtManifest>(fs.readFileSync(manifestPath, 'utf-8'));
```

## Related

- [sonic-rs](https://github.com/cloudwego/sonic-rs) - Rust JSON library
- [napi-rs](https://napi.rs/) - Node.js native addons in Rust
- [SMRT Framework](https://github.com/happyvertical/smrt) - Uses this package
