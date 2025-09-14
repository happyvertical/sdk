import { FilesystemCapabilities, GoogleDriveOptions, ReadOptions, WriteOptions, CreateDirOptions, ListOptions, FileInfo, FileStats, UploadOptions, DownloadOptions } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * Google Drive filesystem provider
 *
 * This provider uses the Google Drive API v3 for file operations.
 * It supports OAuth 2.0 authentication and handles API rate limiting.
 */
export declare class GoogleDriveFilesystemProvider extends BaseFilesystemProvider {
    private readonly clientId;
    private readonly clientSecret;
    private readonly refreshToken;
    private readonly folderId?;
    private readonly scopes;
    private drive;
    private auth;
    constructor(options: GoogleDriveOptions);
    /**
     * Initialize Google Drive client
     */
    private initializeDriveClient;
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
//# sourceMappingURL=gdrive.d.ts.map