# Cache Package Specification

## Overview

The Cache package provides a standardized interface for interacting with various caching backends (Memory, File system, Redis). It abstracts the backend-specific implementations, allowing applications to use a consistent API for caching operations across different storage mechanisms.

The primary goal is to provide efficient key-value storage with automatic expiration, batch operations, and backend-agnostic caching that can scale from development (memory) to production (Redis).

## Core Concepts

- **CacheManager**: The main entry point and public interface of the package. It is initialized with a specific backend and orchestrates caching operations.
- **Provider**: An adapter that conforms to the `ICacheProvider` interface. Each provider is responsible for communicating with a specific backend (e.g., memory, file system, Redis) and transforming operations into backend-specific calls.
- **CacheEntry**: A standardized data structure representing a cached value with metadata like expiration time, size, and access statistics.

## Data Models

### CacheEntry

This is the standardized object used internally to track cached values.

```typescript
interface CacheEntry<T = any> {
  // The cached value (can be any serializable type)
  value: T;

  // When this entry was created (Unix timestamp in milliseconds)
  createdAt: number;

  // When this entry will expire (Unix timestamp in milliseconds)
  // undefined means no expiration
  expiresAt?: number;

  // Size in bytes (for memory/disk management)
  size: number;

  // Number of times this entry has been accessed
  hits: number;

  // Additional metadata for advanced features
  metadata?: {
    compressed?: boolean;
    serialized?: boolean;
    namespace?: string;
  };
}
```

### CacheStats

Statistics about cache performance and usage.

```typescript
interface CacheStats {
  // Total number of cached entries
  entries: number;

  // Total size in bytes
  totalSize: number;

  // Cache hit count
  hits: number;

  // Cache miss count
  misses: number;

  // Hit rate (hits / (hits + misses))
  hitRate: number;

  // Number of evictions (entries removed due to size/TTL)
  evictions: number;

  // Backend-specific statistics
  backend?: {
    type: 'memory' | 'file' | 'redis';
    [key: string]: any;
  };
}
```

## Provider Interface

All providers must implement this interface.

```typescript
interface ICacheProvider {
  /**
   * Retrieves a value from the cache by key.
   * @param key The cache key.
   * @returns A promise that resolves to the cached value, or undefined if not found or expired.
   */
  get<T = any>(key: string): Promise<T | undefined>;

  /**
   * Stores a value in the cache with an optional time-to-live.
   * @param key The cache key.
   * @param value The value to cache.
   * @param ttl Optional time-to-live in seconds. If not provided, uses default TTL or no expiration.
   * @returns A promise that resolves when the value is cached.
   */
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Checks if a key exists in the cache and is not expired.
   * @param key The cache key.
   * @returns A promise that resolves to true if the key exists and is valid.
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes a value from the cache.
   * @param key The cache key.
   * @returns A promise that resolves to true if the key was deleted, false if it didn't exist.
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clears all entries from the cache, or all entries in a namespace if specified.
   * @param namespace Optional namespace to clear. If not provided, clears entire cache.
   * @returns A promise that resolves when the cache is cleared.
   */
  clear(namespace?: string): Promise<void>;

  /**
   * Gets all keys in the cache, optionally filtered by a pattern.
   * @param pattern Optional glob-style pattern to filter keys (e.g., "user:*").
   * @returns A promise that resolves to an array of matching keys.
   */
  keys(pattern?: string): Promise<string[]>;

  /**
   * Retrieves multiple values from the cache.
   * @param keys An array of cache keys.
   * @returns A promise that resolves to a map of key-value pairs. Missing keys are omitted.
   */
  getMany<T = any>(keys: string[]): Promise<Map<string, T>>;

  /**
   * Stores multiple key-value pairs in the cache.
   * @param entries An array of {key, value, ttl?} objects.
   * @returns A promise that resolves when all values are cached.
   */
  setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void>;

  /**
   * Removes multiple values from the cache.
   * @param keys An array of cache keys.
   * @returns A promise that resolves to the number of keys deleted.
   */
  deleteMany(keys: string[]): Promise<number>;

  /**
   * Gets cache statistics.
   * @returns A promise that resolves to cache statistics.
   */
  getStats(): Promise<CacheStats>;

  /**
   * Updates the TTL for an existing cache entry.
   * @param key The cache key.
   * @param ttl New time-to-live in seconds.
   * @returns A promise that resolves to true if TTL was updated, false if key doesn't exist.
   */
  touch(key: string, ttl: number): Promise<boolean>;

  /**
   * Closes the cache connection/cleanup resources.
   * @returns A promise that resolves when cleanup is complete.
   */
  close(): Promise<void>;
}
```

## Public API

The primary way to interact with this package is through the `getCache` factory function.

### `getCache(options)`

This function returns a standardized Cache adapter that conforms to the `ICacheAdapter` interface, based on the provided options.

```typescript
// The interface of the returned adapter.
// Note: This is structurally identical to the ICacheProvider interface.
interface ICacheAdapter {
  get<T = any>(key: string): Promise<T | undefined>;
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
  getMany<T = any>(keys: string[]): Promise<Map<string, T>>;
  setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;
  getStats(): Promise<CacheStats>;
  touch(key: string, ttl: number): Promise<boolean>;
  close(): Promise<void>;
}

// Configuration options for the factory function.
// This allows for selecting and configuring the desired backend.
type CacheAdapterOptions =
  | {
      provider: 'memory';
      namespace?: string;
      defaultTTL?: number; // Default time-to-live in seconds
      maxSize?: number; // Maximum memory in bytes
      maxEntries?: number; // Maximum number of entries
      evictionPolicy?: 'lru' | 'lfu' | 'fifo'; // Eviction strategy
      checkPeriod?: number; // How often to check for expired entries (ms)
    }
  | {
      provider: 'file';
      cacheDir: string; // Directory path for cache files
      namespace?: string;
      defaultTTL?: number;
      maxSize?: number; // Maximum disk usage in bytes
      compression?: boolean; // Enable gzip compression
      fileExtension?: string; // File extension (default: '.cache')
      checkPeriod?: number; // How often to check for expired entries (ms)
    }
  | {
      provider: 'redis';
      host?: string; // Redis host (default: 'localhost')
      port?: number; // Redis port (default: 6379)
      password?: string; // Redis password
      db?: number; // Redis database number (default: 0)
      namespace?: string; // Key prefix for namespacing
      keyPrefix?: string; // Alias for namespace
      defaultTTL?: number;
      enableCompression?: boolean; // Compress values over a size threshold
      compressionThreshold?: number; // Size in bytes to trigger compression
      connectTimeout?: number; // Connection timeout in milliseconds
      commandTimeout?: number; // Command timeout in milliseconds
      retryStrategy?: (times: number) => number | null; // Retry logic for failed connections
    };

function getCache(options: CacheAdapterOptions): Promise<ICacheAdapter>;
```

### Example Usage

This demonstrates how applications would use the `getCache` factory with different backends.

#### Memory Cache (Development)

```typescript
import { getCache } from '@have/cache';

// Create a memory cache with LRU eviction
const cache = await getCache({
  provider: 'memory',
  namespace: 'myapp',
  defaultTTL: 3600, // 1 hour default TTL
  maxSize: 100 * 1024 * 1024, // 100MB max
  maxEntries: 10000, // Maximum 10k entries
  evictionPolicy: 'lru', // Least Recently Used eviction
  checkPeriod: 60000, // Check for expired entries every minute
});

// Store a value with default TTL
await cache.set('user:123', { name: 'John', email: 'john@example.com' });

// Store a value with custom TTL (30 minutes)
await cache.set('session:abc', { userId: 123, token: 'xyz' }, 1800);

// Retrieve a value
const user = await cache.get('user:123');
console.log(user); // { name: 'John', email: 'john@example.com' }

// Check if key exists
const exists = await cache.has('user:123');

// Delete a value
await cache.delete('session:abc');

// Batch operations
await cache.setMany([
  { key: 'user:124', value: { name: 'Jane' } },
  { key: 'user:125', value: { name: 'Bob' }, ttl: 600 },
]);

const users = await cache.getMany(['user:123', 'user:124', 'user:125']);

// Get cache statistics
const stats = await cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Total entries: ${stats.entries}`);
console.log(`Total size: ${stats.totalSize} bytes`);

// Pattern-based key retrieval
const userKeys = await cache.keys('user:*');

// Clear namespace
await cache.clear('myapp');
```

#### File Cache (Persistent Development/Testing)

```typescript
import { getCache } from '@have/cache';
import { resolve } from 'node:path';

// Create a file-based cache
const cache = await getCache({
  provider: 'file',
  cacheDir: resolve('./cache'),
  namespace: 'myapp',
  defaultTTL: 7200, // 2 hours
  maxSize: 500 * 1024 * 1024, // 500MB max disk usage
  compression: true, // Compress large values
  fileExtension: '.cache',
  checkPeriod: 300000, // Check for expired files every 5 minutes
});

// Same API as memory cache
await cache.set('config', { apiUrl: 'https://api.example.com' });

const config = await cache.get('config');

// Cache large data (will be compressed automatically)
await cache.set('large-dataset', {
  /* ... large object ... */
});

// Cleanup when done
await cache.close();
```

#### Redis Cache (Production)

```typescript
import { getCache } from '@have/cache';

// Create a Redis cache
const cache = await getCache({
  provider: 'redis',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  namespace: 'myapp',
  defaultTTL: 3600,
  enableCompression: true,
  compressionThreshold: 1024, // Compress values over 1KB
  connectTimeout: 5000,
  commandTimeout: 3000,
  retryStrategy: (times) => {
    // Exponential backoff: 50ms, 100ms, 200ms, ...
    return times < 10 ? Math.min(times * 50, 2000) : null;
  },
});

// Same API as memory and file caches
await cache.set('user:123', { name: 'John' });

const user = await cache.get('user:123');

// Touch to extend TTL without modifying value
await cache.touch('user:123', 7200); // Extend to 2 hours

// Batch operations are optimized for Redis pipelining
await cache.setMany([
  { key: 'product:1', value: { name: 'Widget', price: 9.99 } },
  { key: 'product:2', value: { name: 'Gadget', price: 19.99 } },
  { key: 'product:3', value: { name: 'Doohickey', price: 29.99 } },
]);

// Pattern matching uses Redis SCAN (cursor-based, efficient)
const productKeys = await cache.keys('product:*');

// Cleanup connection
await cache.close();
```

### Advanced Usage Patterns

#### Cache Wrapper for Function Memoization

```typescript
import { getCache } from '@have/cache';

const cache = await getCache({ provider: 'memory' });

async function memoize<T>(
  key: string,
  fn: () => Promise<T>,
  ttl?: number,
): Promise<T> {
  // Check cache first
  const cached = await cache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  // Execute function and cache result
  const result = await fn();
  await cache.set(key, result, ttl);
  return result;
}

// Usage
const expensiveData = await memoize(
  'expensive-operation',
  async () => {
    // Expensive database query or API call
    return await fetchExpensiveData();
  },
  600, // Cache for 10 minutes
);
```

#### Multi-Layer Caching

```typescript
import { getCache } from '@have/cache';

// Create a two-tier cache: fast memory + persistent Redis
const l1Cache = await getCache({
  provider: 'memory',
  maxSize: 50 * 1024 * 1024, // 50MB L1 cache
  defaultTTL: 300, // 5 minutes in memory
});

const l2Cache = await getCache({
  provider: 'redis',
  host: 'redis.example.com',
  defaultTTL: 3600, // 1 hour in Redis
});

async function multiLayerGet<T>(key: string): Promise<T | undefined> {
  // Check L1 (memory) first
  let value = await l1Cache.get<T>(key);
  if (value !== undefined) {
    return value;
  }

  // Check L2 (Redis) if L1 miss
  value = await l2Cache.get<T>(key);
  if (value !== undefined) {
    // Promote to L1
    await l1Cache.set(key, value);
    return value;
  }

  return undefined;
}

async function multiLayerSet<T>(
  key: string,
  value: T,
  ttl?: number,
): Promise<void> {
  // Write to both layers
  await Promise.all([l1Cache.set(key, value, ttl), l2Cache.set(key, value, ttl)]);
}
```

## Error Handling

All providers throw standardized error types for consistent error handling.

```typescript
// Base error class
class CacheError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

// Specific error types
class CacheKeyError extends CacheError {
  constructor(
    key: string,
    provider: string,
  ) {
    super(`Invalid cache key: ${key}`, 'INVALID_KEY', provider);
    this.name = 'CacheKeyError';
  }
}

class CacheConnectionError extends CacheError {
  constructor(
    message: string,
    provider: string,
  ) {
    super(message, 'CONNECTION_ERROR', provider);
    this.name = 'CacheConnectionError';
  }
}

class CacheSizeError extends CacheError {
  constructor(
    message: string,
    provider: string,
  ) {
    super(message, 'SIZE_EXCEEDED', provider);
    this.name = 'CacheSizeError';
  }
}

class CacheSerializationError extends CacheError {
  constructor(
    message: string,
    provider: string,
  ) {
    super(message, 'SERIALIZATION_ERROR', provider);
    this.name = 'CacheSerializationError';
  }
}

// Usage
import {
  CacheError,
  CacheConnectionError,
  CacheKeyError,
  CacheSizeError,
  CacheSerializationError,
} from '@have/cache';

try {
  await cache.set('my-key', myValue);
} catch (error) {
  if (error instanceof CacheConnectionError) {
    console.error('Failed to connect to cache backend');
  } else if (error instanceof CacheSizeError) {
    console.error('Cache size limit exceeded');
  } else if (error instanceof CacheSerializationError) {
    console.error('Failed to serialize value');
  } else if (error instanceof CacheError) {
    console.error(`Cache error [${error.code}]: ${error.message}`);
  }
}
```

## Backend-Specific Behaviors

### Memory Cache

- **Eviction**: Implements LRU (Least Recently Used), LFU (Least Frequently Used), or FIFO eviction when size limits are reached
- **Expiration**: Background check process removes expired entries at configured intervals
- **Persistence**: Data is lost when process restarts
- **Performance**: Fastest for read/write operations (in-memory)
- **Use Cases**: Development, testing, short-lived caches, session storage

### File Cache

- **Eviction**: Removes oldest files when disk size limit is reached
- **Expiration**: Background scan checks file modification times and embedded expiration metadata
- **Persistence**: Data survives process restarts
- **Compression**: Optional gzip compression for large values
- **Performance**: Slower than memory but faster than network-based caches
- **Use Cases**: Development with persistence, build caches, asset caching

### Redis Cache

- **Eviction**: Uses Redis built-in eviction policies (configure via Redis config)
- **Expiration**: Native Redis TTL support (automatic, no background checks needed)
- **Persistence**: Depends on Redis configuration (RDB snapshots, AOF)
- **Compression**: Optional compression for values over threshold
- **Performance**: Network overhead but highly scalable
- **Use Cases**: Production applications, distributed systems, session storage across servers

## Future Work

- **Distributed Caching**: Support for cache invalidation across multiple instances
- **Cache Warming**: Preload frequently accessed data on startup
- **Additional Backends**: Memcached, DynamoDB, CloudFlare KV, Vercel KV
- **Advanced Eviction**: Configurable eviction policies with custom logic
- **Cache Tagging**: Tag-based invalidation for related entries
- **Observability**: Metrics export (Prometheus, OpenTelemetry)
- **Cache Aside Pattern**: Helper utilities for common caching patterns
- **Stale-While-Revalidate**: Serve stale data while updating in background
- **Cache Locking**: Distributed locks to prevent cache stampede
- **Compression Algorithms**: Support for Brotli, Zstandard in addition to gzip
