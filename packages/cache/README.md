# @have/cache

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Standardized caching interface supporting Memory, File, and Redis backends with TTL, eviction policies, and batch operations.

## Overview

The `@have/cache` package provides a unified caching interface that works seamlessly across multiple storage backends. Whether you need in-memory caching for development, file-based persistence for single-instance applications, or Redis for distributed systems, this package offers a consistent API with powerful features like automatic expiration, eviction policies, and performance tracking.

## Key Features

- **Multiple Backends**: Memory, File, and Redis providers with identical APIs
- **TTL Support**: Automatic expiration for all cache entries
- **Eviction Policies**: LRU, LFU, and FIFO strategies for memory management
- **Batch Operations**: Efficient multi-key get/set/delete operations
- **Performance Tracking**: Built-in statistics for hits, misses, and evictions
- **Compression**: Optional compression for file and Redis backends
- **Namespaces**: Logical grouping of cache entries
- **Pattern Matching**: Find keys using glob-style patterns
- **Type-Safe**: Full TypeScript support with generic type parameters

## Installation

```bash
# Install with npm
npm install @have/cache

# Or with pnpm
pnpm add @have/cache

# Or with yarn
yarn add @have/cache

# For Redis support, redis is already included
```

## Quick Start

```typescript
import { getCache } from '@have/cache';

// Create a memory cache
const cache = await getCache({
  provider: 'memory',
  maxSize: 100 * 1024 * 1024, // 100MB
  evictionPolicy: 'lru'
});

// Store and retrieve data
await cache.set('user:123', { name: 'John Doe', email: 'john@example.com' });
const user = await cache.get('user:123');

// With TTL (expires after 60 seconds)
await cache.set('session:abc', { userId: '123', token: 'xyz' }, 60);

// Check if key exists
const exists = await cache.has('user:123'); // true

// Delete entry
await cache.delete('user:123');
```

## Usage

### Memory Cache

Best for development, testing, and single-instance applications with limited cache needs.

```typescript
import { getCache } from '@have/cache';

const cache = await getCache({
  provider: 'memory',
  namespace: 'app',          // Optional: Logical grouping prefix
  defaultTTL: 3600,          // Default: 1 hour expiration
  maxSize: 100 * 1024 * 1024, // Maximum: 100MB
  maxEntries: 10000,         // Maximum: 10,000 entries
  evictionPolicy: 'lru',     // Strategy: Least Recently Used
  checkPeriod: 60            // Cleanup interval: every 60 seconds
});

// Use the cache
await cache.set('product:456', { name: 'Widget', price: 29.99 });
const product = await cache.get('product:456');
```

**Eviction Policies**:
- `lru` (Least Recently Used): Evicts entries that haven't been accessed recently
- `lfu` (Least Frequently Used): Evicts entries with the fewest hits
- `fifo` (First In, First Out): Evicts the oldest entries first

**Memory Cache Benefits**:
- Zero configuration
- No external dependencies
- Fastest performance (in-memory access)
- Ideal for development and testing

**Limitations**:
- Data lost on process restart
- Not shared across processes
- Memory consumption limits

### File Cache

Best for single-instance applications needing persistence across restarts.

```typescript
import { getCache } from '@have/cache';

const cache = await getCache({
  provider: 'file',
  cacheDir: './cache',       // Required: Cache storage directory
  namespace: 'app',          // Optional: Subdirectory prefix
  defaultTTL: 86400,         // Default: 24 hours
  maxSize: 1024 * 1024 * 1024, // Maximum: 1GB
  compression: true,         // Enable gzip compression
  fileExtension: '.cache',   // File suffix (default: .cache)
  checkPeriod: 300           // Cleanup interval: every 5 minutes
});

// Cache files are stored as: ./cache/app/key.cache
await cache.set('report:2024', { data: largeDataset }, 3600);
const report = await cache.get('report:2024');
```

**File Cache Benefits**:
- Data persists across restarts
- Compression support for large values
- No external service required
- Suitable for local development and single-server deployments

**Limitations**:
- Slower than memory cache (disk I/O)
- Not suitable for multi-server setups
- File system permissions required

### Redis Cache

Best for distributed systems, multi-server applications, and production environments.

```typescript
import { getCache } from '@have/cache';

const cache = await getCache({
  provider: 'redis',
  host: 'localhost',         // Redis server host
  port: 6379,                // Redis server port
  password: 'secret',        // Optional: Authentication
  db: 0,                     // Database number (0-15)
  namespace: 'app',          // Optional: Key prefix
  keyPrefix: 'cache:',       // Additional prefix
  defaultTTL: 3600,          // Default: 1 hour
  enableCompression: true,   // Compress large values
  compressionThreshold: 1024, // Compress values > 1KB
  connectTimeout: 5000,      // Connection timeout: 5 seconds
  commandTimeout: 1000,      // Command timeout: 1 second
  retryStrategy: (times) => {
    // Exponential backoff: 100ms, 200ms, 400ms...
    return Math.min(times * 100, 3000);
  }
});

// Keys stored as: cache:app:session:xyz
await cache.set('session:xyz', { userId: '123' }, 1800);
const session = await cache.get('session:xyz');
```

**Redis Cache Benefits**:
- Shared across multiple servers/processes
- High performance (in-memory with persistence)
- Production-ready with clustering support
- Advanced features (pub/sub, transactions, etc.)

**Limitations**:
- Requires Redis server installation
- Network latency for remote connections
- More complex setup than memory/file caches

## Core API

### Basic Operations

```typescript
// Set a value with optional TTL (in seconds)
await cache.set('key', { data: 'value' }, 60);

// Get a value (returns undefined if not found or expired)
const value = await cache.get<MyType>('key');

// Check if key exists (and is not expired)
const exists = await cache.has('key'); // true or false

// Delete a key
const deleted = await cache.delete('key'); // true if deleted, false if not found

// Update TTL for an existing key (in seconds)
await cache.touch('key', 120); // Extend expiration to 120 seconds

// Clear all entries (or within a namespace)
await cache.clear();           // Clear all
await cache.clear('users');    // Clear 'users' namespace only
```

### Batch Operations

Batch operations are more efficient than individual calls, especially for remote backends like Redis.

```typescript
// Get multiple values at once
const keys = ['user:1', 'user:2', 'user:3'];
const values = await cache.getMany<User>(keys);
// Returns: Map { 'user:1' => { name: 'Alice' }, 'user:2' => { name: 'Bob' }, ... }

for (const [key, user] of values) {
  console.log(`${key}: ${user.name}`);
}

// Set multiple values at once
await cache.setMany([
  { key: 'user:1', value: { name: 'Alice' }, ttl: 3600 },
  { key: 'user:2', value: { name: 'Bob' }, ttl: 3600 },
  { key: 'user:3', value: { name: 'Charlie' } } // No TTL = never expires
]);

// Delete multiple keys at once
const deletedCount = await cache.deleteMany(['user:1', 'user:2']);
console.log(`Deleted ${deletedCount} entries`);
```

### Key Discovery

```typescript
// Get all keys
const allKeys = await cache.keys();

// Find keys matching a pattern (glob-style)
const userKeys = await cache.keys('user:*');    // All user keys
const reports = await cache.keys('report:2024*'); // Reports from 2024
const sessions = await cache.keys('session:*');  // All sessions

// Iterate over matching keys
for (const key of userKeys) {
  const value = await cache.get(key);
  console.log(key, value);
}
```

### Performance Statistics

Track cache performance to optimize your application:

```typescript
const stats = await cache.getStats();

console.log(`
  Entries: ${stats.entries}
  Total Size: ${stats.totalSize} bytes
  Hits: ${stats.hits}
  Misses: ${stats.misses}
  Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%
  Evictions: ${stats.evictions}
  Backend: ${stats.backend?.type}
`);

// Example output:
// Entries: 1,234
// Total Size: 45,678,901 bytes
// Hits: 10,000
// Misses: 1,000
// Hit Rate: 90.91%
// Evictions: 234
// Backend: redis
```

## Advanced Usage

### Namespaced Caching

Use namespaces to logically group cache entries:

```typescript
const cache = await getCache({
  provider: 'redis',
  host: 'localhost',
  namespace: 'app-v2'  // All keys prefixed with 'app-v2:'
});

// Actual Redis key: app-v2:user:123
await cache.set('user:123', { name: 'John' });

// Clear only entries in this namespace
await cache.clear('users'); // Clears keys matching 'app-v2:users:*'
```

### Type-Safe Caching

Leverage TypeScript generics for type safety:

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

// Type-safe set
await cache.set<User>('user:123', {
  id: '123',
  name: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date()
});

// Type-safe get (returns User | undefined)
const user = await cache.get<User>('user:123');
if (user) {
  console.log(user.name); // TypeScript knows this is a string
}

// Type-safe batch operations
const sessions = await cache.getMany<Session>(['session:1', 'session:2']);
for (const [key, session] of sessions) {
  console.log(session.token); // TypeScript knows this is a string
}
```

### Compression for Large Values

File and Redis caches support compression to reduce storage and network overhead:

```typescript
// File cache with compression
const fileCache = await getCache({
  provider: 'file',
  cacheDir: './cache',
  compression: true  // Enable gzip compression
});

// Redis cache with selective compression
const redisCache = await getCache({
  provider: 'redis',
  host: 'localhost',
  enableCompression: true,
  compressionThreshold: 1024  // Only compress values > 1KB
});

// Large values are automatically compressed
await cache.set('large-dataset', hugeArray);
```

### Connection Cleanup

Always close cache connections when shutting down your application:

```typescript
// Graceful shutdown
process.on('SIGTERM', async () => {
  await cache.close(); // Closes Redis connection, releases file handles
  process.exit(0);
});

// Or in application cleanup
async function cleanup() {
  await cache.close();
}
```

## Writing Custom Adapters

To add support for a new cache backend, implement the cache adapter interface:

```typescript
interface CacheAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(pattern?: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(pattern?: string): Promise<string[]>;
  touch(key: string, ttl: number): Promise<void>;
  getStats(): Promise<CacheStats>;
}
```

### Example Implementation

```typescript
import type { CacheAdapter, CacheStats } from '@have/cache';

export class MyCustomCache implements CacheAdapter {
  constructor(private options: MyCustomCacheOptions) {
    // Initialize your cache backend
  }

  async get(key: string): Promise<string | undefined> {
    // Retrieve value from your backend
    // Return undefined if not found or expired
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    // Store value with optional TTL (in seconds)
    // Calculate expiration time if TTL provided
  }

  async delete(key: string): Promise<boolean> {
    // Remove key from cache
    // Return true if deleted, false if not found
  }

  async clear(pattern?: string): Promise<void> {
    // Clear all keys or keys matching pattern
    // Pattern uses glob-style matching (*, ?, etc.)
  }

  async has(key: string): Promise<boolean> {
    // Check if key exists and is not expired
  }

  async keys(pattern?: string): Promise<string[]> {
    // Return all keys or keys matching pattern
    // Filter out expired keys
  }

  async touch(key: string, ttl: number): Promise<void> {
    // Update TTL for existing key
    // Don't modify the value, only expiration
  }

  async getStats(): Promise<CacheStats> {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses),
      entries: await this.countEntries(),
      totalSize: await this.calculateSize(),
      evictions: this.stats.evictions,
      backend: {
        type: 'mycustom',
        info: {} // Backend-specific info
      }
    };
  }
}
```

### Registering Your Adapter

Update the factory function to support your adapter:

```typescript
import { getCache } from '@have/cache';

// Register your adapter
const cache = await getCache({
  provider: 'mycustom',
  // Your custom options
  option1: 'value1',
  option2: 'value2'
});
```

### Implementation Guidelines

- **TTL Handling**: Store expiration timestamp, check on every `get()` call
- **Eviction Policies**: Implement LRU, LFU, or FIFO as appropriate for your backend
- **Statistics Tracking**: Increment hits/misses/evictions counters for monitoring
- **Pattern Matching**: Support glob-style patterns in `keys()` and `clear()`
- **Error Handling**: Throw `CacheError` with appropriate error codes
- **Cleanup**: Implement periodic cleanup of expired entries
- **Thread Safety**: Ensure concurrent access is handled correctly
- **Batch Operations**: Consider supporting `getMany()`, `setMany()`, `deleteMany()` for performance

### Advanced Features (Optional)

```typescript
export class AdvancedCustomCache extends MyCustomCache {
  // Batch operations
  async getMany(keys: string[]): Promise<Map<string, string>> {
    // Fetch multiple keys efficiently
  }

  async setMany(entries: Array<{ key: string; value: string; ttl?: number }>): Promise<void> {
    // Store multiple entries in one operation
  }

  async deleteMany(keys: string[]): Promise<number> {
    // Delete multiple keys, return count deleted
  }

  // Compression support
  async set(key: string, value: string, ttl?: number): Promise<void> {
    const compressed = this.shouldCompress(value)
      ? await this.compress(value)
      : value;
    await super.set(key, compressed, ttl);
  }

  async get(key: string): Promise<string | undefined> {
    const value = await super.get(key);
    return value ? await this.decompress(value) : undefined;
  }
}
```

## Error Handling

The package provides specific error types for different failure scenarios:

```typescript
import {
  CacheError,
  CacheKeyError,
  CacheConnectionError,
  CacheSizeError,
  CacheSerializationError
} from '@have/cache';

try {
  await cache.set('key', value);
} catch (error) {
  if (error instanceof CacheKeyError) {
    console.error('Invalid cache key:', error.key);
  } else if (error instanceof CacheConnectionError) {
    console.error('Cannot connect to cache backend:', error.message);
  } else if (error instanceof CacheSizeError) {
    console.error('Cache size limit exceeded:', error.message);
  } else if (error instanceof CacheSerializationError) {
    console.error('Failed to serialize value:', error.message);
  } else if (error instanceof CacheError) {
    console.error('Cache error:', error.code, error.provider, error.message);
  }
}
```

## Performance Tips

### 1. Choose the Right Backend

- **Development**: Use memory cache for speed and simplicity
- **Single-server production**: Use file cache for persistence
- **Multi-server production**: Use Redis for shared state

### 2. Use Batch Operations

```typescript
// ❌ SLOW - Individual operations
for (const id of userIds) {
  await cache.get(`user:${id}`); // N network round-trips
}

// ✅ FAST - Batch operation
const keys = userIds.map(id => `user:${id}`);
const users = await cache.getMany(keys); // 1 network round-trip
```

### 3. Set Appropriate TTLs

```typescript
// Short TTL for frequently changing data
await cache.set('stock-price:AAPL', price, 60); // 1 minute

// Long TTL for stable data
await cache.set('user-profile:123', profile, 86400); // 24 hours

// No TTL for permanent cache
await cache.set('config:app', config); // Never expires
```

### 4. Monitor Cache Hit Rate

A low hit rate means your cache isn't effective:

```typescript
const stats = await cache.getStats();
if (stats.hitRate < 0.7) {
  // Consider increasing cache size or adjusting TTLs
  console.warn(`Low cache hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
}
```

### 5. Use Compression Wisely

```typescript
// Enable compression for large values
const cache = await getCache({
  provider: 'redis',
  enableCompression: true,
  compressionThreshold: 5120 // 5KB - good balance
});

// Small values: compression overhead > savings
// Large values: compression saves memory and bandwidth
```

## Common Patterns

### Cache-Aside Pattern

The most common caching pattern: check cache first, fallback to database on miss.

```typescript
async function getUser(userId: string): Promise<User> {
  const cacheKey = `user:${userId}`;

  // Try cache first
  const cached = await cache.get<User>(cacheKey);
  if (cached) {
    return cached;
  }

  // Cache miss - fetch from database
  const user = await database.users.findById(userId);

  // Store in cache for next time
  await cache.set(cacheKey, user, 3600); // 1 hour TTL

  return user;
}
```

### Write-Through Pattern

Update cache and database together:

```typescript
async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  // Update database
  const user = await database.users.update(userId, updates);

  // Update cache immediately
  await cache.set(`user:${userId}`, user, 3600);

  return user;
}
```

### Cache Invalidation

Remove stale data when the source changes:

```typescript
async function deleteUser(userId: string): Promise<void> {
  // Delete from database
  await database.users.delete(userId);

  // Invalidate cache
  await cache.delete(`user:${userId}`);

  // Invalidate related caches
  await cache.deleteMany([
    `user:${userId}:profile`,
    `user:${userId}:settings`,
    `user:${userId}:sessions`
  ]);
}
```

### Lazy Loading with Memoization

Combine caching with function memoization:

```typescript
async function getExpensiveData(key: string): Promise<Data> {
  const cacheKey = `expensive:${key}`;

  // Check cache
  const cached = await cache.get<Data>(cacheKey);
  if (cached) {
    return cached;
  }

  // Expensive operation (API call, complex computation, etc.)
  const data = await performExpensiveOperation(key);

  // Cache result for 1 hour
  await cache.set(cacheKey, data, 3600);

  return data;
}
```

## Comparison with Other Caching Libraries

| Feature | @have/cache | node-cache | cache-manager | keyv |
|---------|-------------|------------|---------------|------|
| Memory Cache | ✅ | ✅ | ✅ | ✅ |
| File Cache | ✅ | ❌ | ❌ | ✅ |
| Redis Cache | ✅ | ❌ | ✅ | ✅ |
| Unified API | ✅ | ❌ | ✅ | ✅ |
| TypeScript | ✅ | ✅ | ⚠️ | ✅ |
| Batch Operations | ✅ | ❌ | ❌ | ⚠️ |
| Eviction Policies | ✅ (LRU/LFU/FIFO) | ✅ (LRU) | ❌ | ❌ |
| Compression | ✅ | ❌ | ❌ | ✅ |
| Statistics | ✅ | ✅ | ❌ | ❌ |
| Pattern Matching | ✅ | ❌ | ❌ | ✅ |
| TTL Support | ✅ | ✅ | ✅ | ✅ |

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_cache.html) for detailed information on all available methods and options.

## Contributing

Contributions are welcome! Please see the [SDK Contributing Guide](../../../CONTRIBUTING.md) for details.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../../LICENSE) file for details.
