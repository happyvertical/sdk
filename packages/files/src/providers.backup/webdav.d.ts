import { FilesystemCapabilities, WebDAVOptions, ReadOptions, WriteOptions, CreateDirOptions, ListOptions, FileInfo, FileStats, UploadOptions, DownloadOptions } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * WebDAV filesystem provider
 *
 * This provider uses WebDAV protocol for file operations and supports various
 * WebDAV-compatible servers including Nextcloud, ownCloud, Apache mod_dav,
 * Nginx WebDAV module, Windows IIS, SabreDAV, and others.
 * It supports basic authentication and chunked uploads for large files.
 */
export declare class WebDAVFilesystemProvider extends BaseFilesystemProvider {
    private readonly baseUrl;
    private readonly username;
    private readonly password;
    private readonly davPath;
    private webdavClient;
    constructor(options: WebDAVOptions);
    /**
     * Initialize WebDAV client
     */
    private initializeWebDAVClient;
    /**
     * Convert path to WebDAV path
     */
    private getWebDAVPath;
    exists(path: string): Promise<boolean>;
    read(path: string, options?: ReadOptions): Promise<string | Buffer>;
    write(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
    delete(path: string): Promise<void>;
    copy(sourcePath: string, destPath: string): Promise<void>;
    move(sourcePath: string, destPath: string): Promise<void>;
    createDirectory(path: string, options?: CreateDirOptions): Promise<void>;
    list(path: string, options?: ListOptions): Promise<FileInfo[]>;
    getStats(path: string): Promise<FileStats>;
    getMimeType(path: string): Promise<string>;
    upload(localPath: string, remotePath: string, options?: UploadOptions): Promise<void>;
    download(remotePath: string, localPath?: string, options?: DownloadOptions): Promise<string>;
    getCapabilities(): Promise<FilesystemCapabilities>;
}
//# sourceMappingURL=webdav.d.ts.map