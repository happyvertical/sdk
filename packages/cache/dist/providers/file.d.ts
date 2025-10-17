import { CacheStats, FileOptions, CacheProvider } from '../shared/types';
/**
 * File cache provider implementation
 * Stores cache entries as files with optional compression
 */
export declare class FileProvider implements CacheProvider {
    private cacheDir;
    private namespace?;
    private defaultTTL?;
    private maxSize;
    private compression;
    private fileExtension;
    private checkPeriod;
    private checkInterval?;
    private stats;
    constructor(options: FileOptions);
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
     * Ensures cache directory exists
     */
    private ensureCacheDir;
    /**
     * Gets the file path for a cache key
     */
    private getFilePath;
    /**
     * Sanitizes a key for use as a filename
     */
    private sanitizeKey;
    /**
     * Desanitizes a filename back to the original key
     */
    private desanitizeKey;
    /**
     * Gets all cache file names
     */
    private getAllFiles;
    /**
     * Writes an entry to a file
     */
    private writeEntry;
    /**
     * Evicts files if size limit is exceeded
     */
    private evictIfNeeded;
    /**
     * Evicts oldest files based on creation time
     */
    private evict;
    /**
     * Starts background cleanup of expired files
     */
    private startCleanup;
    /**
     * Removes expired files
     */
    private removeExpiredFiles;
}
//# sourceMappingURL=file.d.ts.map