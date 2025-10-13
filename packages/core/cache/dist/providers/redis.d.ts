import { CacheStats, ICacheProvider, RedisOptions } from '../shared/types';
/**
 * Redis cache provider implementation
 * Uses official redis client with optional compression
 */
export declare class RedisProvider implements ICacheProvider {
    private options;
    private client;
    private namespace?;
    private defaultTTL?;
    private enableCompression;
    private compressionThreshold;
    private stats;
    private connected;
    constructor(options: RedisOptions);
    /**
     * Ensures the client is connected
     */
    private ensureConnected;
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
}
//# sourceMappingURL=redis.d.ts.map