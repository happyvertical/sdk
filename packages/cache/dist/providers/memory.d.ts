import { CacheStats, CacheProvider, MemoryOptions } from '../shared/types';
/**
 * Memory cache provider implementation
 * Stores cache entries in memory with LRU eviction
 */
export declare class MemoryProvider implements CacheProvider {
    private cache;
    private namespace?;
    private defaultTTL?;
    private maxSize;
    private maxEntries;
    private evictionPolicy;
    private checkPeriod;
    private checkInterval?;
    private stats;
    constructor(options: MemoryOptions);
    get<T = any>(key: string): Promise<T | undefined>;
    set<T = any>(key: string, value: T, ttl?: number): Promise<void>;
    has(key: string): Promise<boolean>;
    delete(key: string): Promise<boolean>;
    clear(namespace?: string): Promise<void>;
    keys(pattern?: string): Promise<string[]>;
    getMany<T = any>(keys: string[]): Promise<Map<string, T>>;
    setMany<T = any>(entries: Array<{
        key: string;
        value: T;
        ttl?: number;
    }>): Promise<void>;
    deleteMany(keys: string[]): Promise<number>;
    getStats(): Promise<CacheStats>;
    touch(key: string, ttl: number): Promise<boolean>;
    close(): Promise<void>;
    /**
     * Evicts entries if size or count limits are exceeded
     */
    private evictIfNeeded;
    /**
     * Evicts entries based on eviction policy
     */
    private evict;
    /**
     * Starts background task to remove expired entries
     */
    private startExpirationCheck;
    /**
     * Removes all expired entries from the cache
     */
    private removeExpiredEntries;
}
//# sourceMappingURL=memory.d.ts.map