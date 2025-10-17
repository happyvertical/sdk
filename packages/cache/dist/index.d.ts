import { CacheAdapter, CacheAdapterOptions } from './shared/types';
export * from './shared/types';
export * from './shared/utils';
/**
 * Factory function to create a cache adapter instance
 *
 * @param options - Configuration options for the cache provider
 * @returns Promise resolving to a cache adapter that implements CacheAdapter
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
export declare function getCache(options: CacheAdapterOptions): Promise<CacheAdapter>;
//# sourceMappingURL=index.d.ts.map