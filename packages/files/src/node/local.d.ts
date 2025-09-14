import { FilesystemCapabilities, LocalOptions, ReadOptions, WriteOptions, CreateDirOptions, ListOptions, FileInfo, FileStats } from '../shared/types.js';
import { BaseFilesystemProvider } from '../shared/base.js';
/**
 * Local filesystem provider using Node.js fs module with full feature support
 */
export declare class LocalFilesystemProvider extends BaseFilesystemProvider {
    private readonly rootPath;
    constructor(options?: LocalOptions);
    /**
     * Resolve path relative to root path
     */
    private resolvePath;
    /**
     * Check if file or directory exists
     */
    exists(path: string): Promise<boolean>;
    /**
     * Read file contents
     */
    read(path: string, options?: ReadOptions): Promise<string | Buffer>;
    /**
     * Write content to file
     */
    write(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
    /**
     * Delete file or directory
     */
    delete(path: string): Promise<void>;
    /**
     * Copy file from source to destination
     */
    copy(sourcePath: string, destPath: string): Promise<void>;
    /**
     * Move file from source to destination
     */
    move(sourcePath: string, destPath: string): Promise<void>;
    /**
     * Create directory
     */
    createDirectory(path: string, options?: CreateDirOptions): Promise<void>;
    /**
     * List directory contents
     */
    list(path: string, options?: ListOptions): Promise<FileInfo[]>;
    /**
     * Get file statistics
     */
    getStats(path: string): Promise<FileStats>;
    /**
     * Get MIME type for a file
     */
    getMimeType(path: string): Promise<string>;
    /**
     * Upload data to a URL using PUT method (legacy)
     */
    uploadToUrl(url: string, data: string | Buffer): Promise<Response>;
    /**
     * Download a file from a URL and save it to a local file (legacy)
     */
    downloadFromUrl(url: string, filepath: string): Promise<void>;
    /**
     * Download a file with caching support (legacy)
     */
    downloadFileWithCache(url: string, targetPath?: string | null): Promise<string>;
    /**
     * Get data from cache if available and not expired (legacy)
     */
    getCached(file: string, expiry?: number): Promise<string | undefined>;
    /**
     * Set data in cache (legacy)
     */
    setCached(file: string, data: string): Promise<void>;
    /**
     * Cache implementation using file system
     */
    cache: {
        get: (key: string, expiry?: number) => Promise<string | undefined>;
        set: (key: string, data: string) => Promise<void>;
        clear: (key?: string) => Promise<void>;
    };
    /**
     * Get provider capabilities
     */
    getCapabilities(): Promise<FilesystemCapabilities>;
}
//# sourceMappingURL=local.d.ts.map