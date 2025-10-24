# @happyvertical/cache

## Purpose and Responsibilities

The cache package provides a unified interface for caching with multiple provider implementations. It abstracts away the differences between memory, file-based, and Redis caching behind a simple, consistent API.

## Key Features

- **Provider Pattern**: Memory, File, and Redis adapters
- **Unified API**: Same interface regardless of backend
- **TTL Support**: Time-to-live for cache entries
- **Batch Operations**: get/set/delete many keys at once
- **Cache Statistics**: Track hits, misses, and evictions
- **Environment Variable Configuration**: Auto-configure from env vars

## Architecture Overview

```
CacheAdapter Interface
    ├── MemoryCache (in-memory Map)
    ├── FileCache (JSON files)
    └── RedisCache (Redis client)
```

## Key APIs

### Basic Usage

```typescript
import { getCache } from '@happyvertical/cache';

// Memory cache (default)
const cache = await getCache({ type: 'memory' });

// Set with TTL (seconds)
await cache.set('key', 'value', 3600);

// Get value
const value = await cache.get('key');

// Delete
await cache.delete('key');

// Check existence
const exists = await cache.has('key');

// Clear all
await cache.clear();
```

### Batch Operations

```typescript
// Set many
await cache.setMany({
  'key1': 'value1',
  'key2': 'value2',
  'key3': 'value3'
}, 3600);

// Get many
const values = await cache.getMany(['key1', 'key2', 'key3']);

// Delete many
await cache.deleteMany(['key1', 'key2']);
```

### Redis Provider

```typescript
const cache = await getCache({
  type: 'redis',
  host: 'localhost',
  port: 6379,
  // Optional: password, db, tls
});
```

### File Provider

```typescript
const cache = await getCache({
  type: 'file',
  directory: './cache'
});
```

## Environment Variable Configuration

```bash
# Automatically configure from environment
export HAVE_CACHE_TYPE=redis
export HAVE_CACHE_REDIS_HOST=localhost
export HAVE_CACHE_REDIS_PORT=6379
export HAVE_CACHE_REDIS_PASSWORD=secret

# Then use without options
const cache = await getCache();
```

## Dependencies

- **Internal**: None
- **External**:
  - `ioredis` (optional, for Redis provider)
  - Node.js `fs/promises` (for File provider)

## Development Guidelines

- All providers must implement the complete CacheAdapter interface
- TTL is in seconds (consistent with Redis)
- Keys should be strings
- Values are serialized as JSON
- Handle connection errors gracefully
- Support both sync and async close()

## Expert Agent Expertise

When working with cache:

1. **Provider Selection**: Memory for development, Redis for production
2. **TTL Strategy**: Set appropriate expiry times based on data volatility
3. **Error Handling**: Cache failures should not break the application
4. **Batch Operations**: Use batch methods for better performance
5. **Statistics**: Use getStats() to monitor cache effectiveness

## Common Patterns

```typescript
// Cache-aside pattern
async function getData(key: string) {
  // Try cache first
  const cached = await cache.get(key);
  if (cached) return JSON.parse(cached);

  // Fetch from source
  const data = await fetchFromSource(key);

  // Store in cache
  await cache.set(key, JSON.stringify(data), 3600);

  return data;
}

// Refresh on touch
const value = await cache.get('key', 3600); // Reset TTL when accessed
```

## Related Packages

- **@happyvertical/geo**: Uses cache for geocoding results
- **@happyvertical/translator**: May cache translations
- **@happyvertical/ai**: Could cache embeddings or completions
