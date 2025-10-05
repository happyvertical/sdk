/**
 * Cache package entry point
 * Provides standardized caching interface
 */

import type {
  CacheAdapterOptions,
  FileOptions,
  ICacheAdapter,
  MemoryOptions,
  RedisOptions,
} from './shared/types';

// Export all types
export * from './shared/types';
export * from './shared/utils';

/**
 * Type guard for Memory cache options
 */
function isMemoryOptions(
  options: CacheAdapterOptions,
): options is MemoryOptions {
  return options.provider === 'memory';
}

/**
 * Type guard for File cache options
 */
function isFileOptions(options: CacheAdapterOptions): options is FileOptions {
  return options.provider === 'file';
}

/**
 * Type guard for Redis cache options
 */
function isRedisOptions(options: CacheAdapterOptions): options is RedisOptions {
  return options.provider === 'redis';
}

/**
 * Factory function to create a cache adapter instance
 *
 * @param options - Configuration options for the cache provider
 * @returns Promise resolving to a cache adapter that implements ICacheAdapter
 *
 * @example
 * ```typescript
 * // Create memory cache
 * const memoryCache = await getCache({
 *   provider: 'memory',
 *   maxSize: 100 * 1024 * 1024,
 *   evictionPolicy: 'lru'
 * });
 *
 * // Create file cache
 * const fileCache = await getCache({
 *   provider: 'file',
 *   cacheDir: './cache',
 *   compression: true
 * });
 *
 * // Create Redis cache
 * const redisCache = await getCache({
 *   provider: 'redis',
 *   host: 'localhost',
 *   port: 6379
 * });
 *
 * // Use the cache
 * await memoryCache.set('user:123', { name: 'John' });
 * const user = await memoryCache.get('user:123');
 * ```
 */
export async function getCache(
  options: CacheAdapterOptions,
): Promise<ICacheAdapter> {
  if (isMemoryOptions(options)) {
    const { MemoryProvider } = await import('./providers/memory.js');
    return new MemoryProvider(options);
  }

  if (isFileOptions(options)) {
    const { FileProvider } = await import('./providers/file.js');
    return new FileProvider(options);
  }

  if (isRedisOptions(options)) {
    const { RedisProvider } = await import('./providers/redis.js');
    return new RedisProvider(options);
  }

  // This should never happen due to TypeScript's discriminated union
  throw new Error(`Unsupported provider: ${(options as any).provider}`);
}
