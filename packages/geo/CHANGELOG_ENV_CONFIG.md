# Environment Configuration Integration - @have/geo

## Summary

Integrated `loadEnvConfig()` utility from `@have/utils` into the `@have/geo` package to enable environment variable-based configuration using the `HAVE_GEO_*` pattern.

## Changes Made

### 1. Updated Factory Function (`src/index.ts`)

**Before:**
```typescript
export async function getGeoAdapter(
  options: GeoAdapterOptions,
): Promise<GeoAdapter>
```

**After:**
```typescript
export async function getGeoAdapter(
  options: Partial<GeoAdapterOptions> = {},
): Promise<GeoAdapter>
```

**Key Changes:**
- Made `options` parameter optional with default empty object
- Integrated `loadEnvConfig()` to load configuration from environment variables
- Added support for `HAVE_GEO_*` environment variables
- Maintained backward compatibility with `GOOGLE_MAPS_API_KEY` environment variable
- User-provided options always take precedence over environment variables

### 2. Environment Variables Supported

| Variable | Type | Description |
|----------|------|-------------|
| `HAVE_GEO_PROVIDER` | string | Provider to use ('google' or 'openstreetmap') |
| `GOOGLE_MAPS_API_KEY` | string | Google Maps API key (for Google provider) |
| `HAVE_GEO_TIMEOUT` | number | Request timeout in milliseconds |
| `HAVE_GEO_MAX_RESULTS` | number | Maximum number of results to return |
| `HAVE_GEO_RATE_LIMIT_DELAY` | number | Delay between requests for OpenStreetMap (ms) |
| `HAVE_GEO_USER_AGENT` | string | Custom User-Agent for OpenStreetMap |

### 3. New Test Suite (`src/env-config.test.ts`)

Created comprehensive test suite with 18 tests covering:
- Loading provider from `HAVE_GEO_PROVIDER`
- Loading Google Maps API key from `GOOGLE_MAPS_API_KEY`
- Loading numeric configuration (timeout, maxResults, rateLimitDelay)
- Loading string configuration (userAgent)
- User option precedence over environment variables
- Mixed environment and user options
- Error handling for invalid values
- Real-world usage patterns

**Test Results:** ✅ All 18 tests passing

### 4. Updated Documentation

#### README.md
- Added "Using Environment Variables" section to Quick Start
- Added comprehensive Environment Variables table to API Reference
- Included examples of:
  - Zero-configuration setup with env vars
  - Mixing env vars with explicit options
  - Environment variable precedence

#### CLAUDE.md
- Updated "Creating a Geo Adapter" section with env var examples
- Added dedicated "Environment Variable Configuration" section
- Documented configuration precedence
- Added practical examples with .env file usage

### 5. Example Code (`examples/env-config.example.ts`)

Created comprehensive example demonstrating:
- Using only environment variables
- Google Maps with environment variables
- Mixing environment variables with explicit options
- Complete explicit configuration (no env vars)

## Configuration Precedence

1. **User-provided options** (highest priority)
2. **Environment variables** (HAVE_GEO_*)
3. **Default values** (lowest priority)

## Usage Examples

### Zero-Configuration Setup

```bash
# .env file
HAVE_GEO_PROVIDER=google
GOOGLE_MAPS_API_KEY=your-api-key
HAVE_GEO_TIMEOUT=20000
HAVE_GEO_MAX_RESULTS=10
```

```typescript
import { getGeoAdapter } from '@have/geo';

// No options needed
const adapter = await getGeoAdapter();
```

### Mixed Configuration

```typescript
// Environment provides defaults, user options override
const adapter = await getGeoAdapter({
  timeout: 30000  // Overrides HAVE_GEO_TIMEOUT
});
```

### Explicit Configuration (No Env Vars)

```typescript
const adapter = await getGeoAdapter({
  provider: 'openstreetmap',
  timeout: 5000,
  maxResults: 1,
});
```

## Backward Compatibility

✅ **Fully backward compatible** - All existing code continues to work without changes:

```typescript
// Still works exactly as before
const adapter = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!
});
```

## Testing

```bash
# Run all tests
npm test

# Run only env config tests
npm test -- env-config.test.ts

# Run integration tests
npm test -- openstreetmap.integration.test.ts
```

**Test Coverage:**
- ✅ 28 tests passing (18 env config + 10 integration)
- ✅ All existing tests still pass
- ✅ No breaking changes

## Build Verification

```bash
npm run build
```

**Build Output:**
- ✅ TypeScript compilation successful
- ✅ Declaration files generated
- ✅ No type errors
- ✅ Bundle size unchanged

## Benefits

1. **Zero-configuration deployments** - Set env vars and go
2. **Environment-specific configuration** - Different settings per environment
3. **Consistent patterns** - Same `HAVE_{PACKAGE}_*` pattern across SDK
4. **Security** - Sensitive data (API keys) in environment, not code
5. **Flexibility** - Mix env vars with explicit options as needed
6. **Developer experience** - Less boilerplate, easier testing

## Migration Guide

### For Existing Users

No migration needed! Existing code continues to work unchanged.

### For New Users

**Option 1: Environment Variables (Recommended)**
```bash
export HAVE_GEO_PROVIDER=google
export GOOGLE_MAPS_API_KEY=your-key
```
```typescript
const adapter = await getGeoAdapter();
```

**Option 2: Explicit Options (Still Supported)**
```typescript
const adapter = await getGeoAdapter({
  provider: 'google',
  apiKey: 'your-key'
});
```

## Dependencies

No new dependencies added. Uses existing `@have/utils` dependency which provides `loadEnvConfig()`.

## Files Modified

- ✏️ `src/index.ts` - Factory function with env config integration
- ✏️ `README.md` - Documentation updates
- ✏️ `CLAUDE.md` - Architecture documentation updates
- ➕ `src/env-config.test.ts` - New test suite (18 tests)
- ➕ `examples/env-config.example.ts` - Usage examples
- ➕ `CHANGELOG_ENV_CONFIG.md` - This file

## Implementation Details

### Type Safety

Used type casting to handle `GeoAdapterOptions` union type with `loadEnvConfig()`:

```typescript
const config = loadEnvConfig(options as any, {
  packageName: 'geo',
  schema: { /* ... */ }
}) as Partial<GeoAdapterOptions>;
```

This is necessary because `loadEnvConfig` expects a single type, but we have a discriminated union (`GoogleMapsOptions | OpenStreetMapOptions`).

### Special Handling for GOOGLE_MAPS_API_KEY

The Google Maps API key uses a non-prefixed environment variable for compatibility:

```typescript
if (config.provider === 'google' && !config.apiKey) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    config.apiKey = apiKey;
  }
}
```

This allows users to use the standard `GOOGLE_MAPS_API_KEY` environment variable name instead of requiring `HAVE_GEO_API_KEY`.

## Next Steps

Consider applying this pattern to other packages in the SDK:
- `@have/ai` - Already has env config support
- `@have/sql` - Could benefit from `HAVE_SQL_*` env vars
- `@have/cache` - Could benefit from `HAVE_CACHE_*` env vars
- Other infrastructure packages

## Related Issues

Addresses the requirement to integrate `loadEnvConfig()` utility from `@have/utils` into `@have/geo` package for consistent environment variable configuration across the SDK.
