import { FilesystemCapabilities, LocalOptions, ReadOptions, WriteOptions, CreateDirOptions, ListOptions, FileInfo, FileStats } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * Local filesystem provider using Node.js fs module
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
     * Get provider capabilities
     */
    getCapabilities(): Promise<FilesystemCapabilities>;
}
//# sourceMappingURL=local.d.ts.map