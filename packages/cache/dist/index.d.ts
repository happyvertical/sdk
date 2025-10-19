import { CacheAdapter, CacheAdapterOptions } from './shared/types';
export * from './shared/types';
export * from './shared/utils';
/**
 * Factory function to create a cache adapter instance
 *
 * Supports environment variable configuration using the HAVE_CACHE_* pattern:
 * - HAVE_CACHE_PROVIDER → provider ('memory'|'file'|'redis')
 * - HAVE_CACHE_NAMESPACE → namespace (string)
 * - HAVE_CACHE_DEFAULT_TTL → defaultTTL (number: seconds)
 * - HAVE_CACHE_MAX_SIZE → maxSize (number: bytes)
 * - HAVE_CACHE_MAX_ENTRIES → maxEntries (number, memory only)
 * - HAVE_CACHE_EVICTION_POLICY → evictionPolicy ('lru'|'lfu'|'fifo', memory only)
 * - HAVE_CACHE_CACHE_DIR → cacheDir (string, file only)
 * - HAVE_CACHE_COMPRESSION → compression (boolean, file only)
 * - HAVE_CACHE_HOST → host (string, redis only)
 * - HAVE_CACHE_PORT → port (number, redis only)
 *
 * User-provided options always take precedence over environment variables.
 *
 * @param options - Configuration options for the cache provider
 * @returns Promise resolving to a cache adapter that implements CacheAdapter
 *
 * @example
 * ```typescript
 * // Create memory cache with explicit options
 * const memoryCache = await getCache({
 *   provider: 'memory',
 *   maxSize: 100 * 1024 * 1024,
 *   evictionPolicy: 'lru'
 * });
 *
 * // Create memory cache with environment variables
 * // HAVE_CACHE_PROVIDER=memory
 * // HAVE_CACHE_MAX_SIZE=104857600
 * // HAVE_CACHE_EVICTION_POLICY=lru
 * const envCache = await getCache({ provider: 'memory' });
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
export declare function getCache(options: CacheAdapterOptions): Promise<CacheAdapter>;
//# sourceMappingURL=index.d.ts.map