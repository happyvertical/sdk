import { FilesystemInterface, BaseProviderOptions, FilesystemCapabilities, CacheOptions } from '../types.js';
/**
 * Base class for all filesystem providers
 */
export declare abstract class BaseFilesystemProvider implements FilesystemInterface {
    protected basePath: string;
    protected cacheDir: string;
    protected createMissing: boolean;
    constructor(options?: BaseProviderOptions);
    /**
     * Normalize path by removing leading/trailing slashes and resolving relative paths
     */
    protected normalizePath(path: string): string;
    /**
     * Validate that a path is safe (no directory traversal)
     */
    protected validatePath(path: string): void;
    /**
     * Get cache key for a given path
     */
    protected getCacheKey(path: string): string;
    /**
     * Abstract methods that must be implemented by providers
     */
    abstract exists(path: string): Promise<boolean>;
    abstract read(path: string, options?: any): Promise<string | Buffer>;
    abstract write(path: string, content: string | Buffer, options?: any): Promise<void>;
    abstract delete(path: string): Promise<void>;
    abstract copy(sourcePath: string, destPath: string): Promise<void>;
    abstract move(sourcePath: string, destPath: string): Promise<void>;
    abstract createDirectory(path: string, options?: any): Promise<void>;
    abstract list(path: string, options?: any): Promise<any[]>;
    abstract getStats(path: string): Promise<any>;
    abstract getMimeType(path: string): Promise<string>;
    abstract getCapabilities(): Promise<FilesystemCapabilities>;
    /**
     * Default implementations for upload/download (may be overridden)
     */
    upload(localPath: string, remotePath: string, options?: any): Promise<void>;
    download(remotePath: string, localPath?: string, options?: any): Promise<string>;
    downloadWithCache(remotePath: string, options?: CacheOptions): Promise<string>;
    /**
     * Cache implementation using the existing cache functions
     */
    cache: {
        get: (key: string, expiry?: number) => Promise<string | undefined>;
        set: (key: string, data: string) => Promise<void>;
        clear: (key?: string) => Promise<void>;
    };
}
//# sourceMappingURL=base.d.ts.map