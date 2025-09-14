import { FilesystemCapabilities, S3Options, ReadOptions, WriteOptions, CreateDirOptions, ListOptions, FileInfo, FileStats, UploadOptions, DownloadOptions } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * S3-compatible filesystem provider
 *
 * This provider supports AWS S3, MinIO, DigitalOcean Spaces, and other S3-compatible services.
 * It uses the AWS SDK v3 for optimal performance and tree-shaking.
 */
export declare class S3FilesystemProvider extends BaseFilesystemProvider {
    private readonly region;
    private readonly bucket;
    private readonly accessKeyId?;
    private readonly secretAccessKey?;
    private readonly endpoint?;
    private readonly forcePathStyle;
    private s3Client;
    constructor(options: S3Options);
    /**
     * Initialize S3 client
     */
    private initializeS3Client;
    /**
     * Convert S3 path to S3 key
     */
    private getS3Key;
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
//# sourceMappingURL=s3.d.ts.map