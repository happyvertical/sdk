import { 
  FilesystemCapabilities, 
  S3Options, 
  ReadOptions, 
  WriteOptions,
  CreateDirOptions,
  ListOptions,
  FileInfo,
  FileStats,
  UploadOptions,
  DownloadOptions,
  FilesystemError
} from '../types.js';
import { BaseFilesystemProvider } from './base.js';

/**
 * S3-compatible filesystem provider
 * 
 * This provider supports AWS S3, MinIO, DigitalOcean Spaces, and other S3-compatible services.
 * It uses the AWS SDK v3 for optimal performance and tree-shaking.
 */
export class S3FilesystemProvider extends BaseFilesystemProvider {
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private s3Client: any; // Will be initialized when AWS SDK is available

  constructor(options: S3Options) {
    super(options);
    this.region = options.region;
    this.bucket = options.bucket;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.endpoint = options.endpoint;
    this.forcePathStyle = options.forcePathStyle ?? false;
  }

  /**
   * Initialize S3 client
   */
  private async initializeS3Client(): Promise<void> {
    if (this.s3Client) return;

    try {
      // Dynamic import to avoid bundling AWS SDK if not needed
      const { S3Client } = await import('@aws-sdk/client-s3');
      
      this.s3Client = new S3Client({
        region: this.region,
        credentials: this.accessKeyId && this.secretAccessKey ? {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey
        } : undefined,
        endpoint: this.endpoint,
        forcePathStyle: this.forcePathStyle
      });
    } catch (error) {
      throw new FilesystemError(
        'AWS SDK for S3 is not available. Install @aws-sdk/client-s3 to use S3 provider.',
        'ENOTFOUND'
      );
    }
  }

  /**
   * Convert S3 path to S3 key
   */
  private getS3Key(path: string): string {
    return this.normalizePath(path);
  }

  async exists(path: string): Promise<boolean> {
    await this.initializeS3Client();
    
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(path)
      });
      
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw new FilesystemError(
        `Failed to check existence: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async read(path: string, options: ReadOptions = {}): Promise<string | Buffer> {
    await this.initializeS3Client();
    
    try {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(path)
      });
      
      const response = await this.s3Client.send(command);
      
      if (!response.Body) {
        throw new FilesystemError('Empty response body', 'ENODATA', path, 's3');
      }
      
      // Convert stream to buffer/string
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      
      const buffer = Buffer.concat(chunks);
      
      if (options.raw) {
        return buffer;
      }
      
      return buffer.toString(options.encoding || 'utf8');
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw new FilesystemError(`File not found: ${path}`, 'ENOENT', path, 's3');
      }
      throw new FilesystemError(
        `Failed to read file: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async write(path: string, content: string | Buffer, options: WriteOptions = {}): Promise<void> {
    await this.initializeS3Client();
    
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(path),
        Body: content,
        ContentType: await this.getMimeType(path)
      });
      
      await this.s3Client.send(command);
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to write file: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async delete(path: string): Promise<void> {
    await this.initializeS3Client();
    
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(path)
      });
      
      await this.s3Client.send(command);
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to delete file: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    await this.initializeS3Client();
    
    try {
      const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${this.getS3Key(sourcePath)}`,
        Key: this.getS3Key(destPath)
      });
      
      await this.s3Client.send(command);
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to copy file: ${error.message}`,
        error.code || 'UNKNOWN',
        sourcePath,
        's3'
      );
    }
  }

  async move(sourcePath: string, destPath: string): Promise<void> {
    await this.copy(sourcePath, destPath);
    await this.delete(sourcePath);
  }

  async createDirectory(path: string, options: CreateDirOptions = {}): Promise<void> {
    // S3 doesn't have true directories, but we can create a directory marker
    const directoryPath = path.endsWith('/') ? path : `${path}/`;
    await this.write(directoryPath, '', options);
  }

  async list(path: string, options: ListOptions = {}): Promise<FileInfo[]> {
    await this.initializeS3Client();
    
    try {
      const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const prefix = this.getS3Key(path);
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        Delimiter: options.recursive ? undefined : '/'
      });
      
      const response = await this.s3Client.send(command);
      const results: FileInfo[] = [];
      
      // Process objects (files)
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (!obj.Key || obj.Key === prefix) continue;
          
          const name = obj.Key.replace(prefix, '').replace(/\/$/, '');
          if (!name) continue;
          
          // Apply filter if provided
          if (options.filter) {
            const filterPattern = typeof options.filter === 'string' 
              ? new RegExp(options.filter) 
              : options.filter;
            
            if (!filterPattern.test(name)) {
              continue;
            }
          }
          
          const fileInfo: FileInfo = {
            name,
            path: obj.Key,
            size: obj.Size || 0,
            isDirectory: false,
            lastModified: obj.LastModified || new Date(),
            extension: name.includes('.') ? name.split('.').pop() : undefined
          };
          
          if (options.detailed) {
            fileInfo.mimeType = await this.getMimeType(obj.Key);
          }
          
          results.push(fileInfo);
        }
      }
      
      // Process common prefixes (directories)
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (!prefix.Prefix) continue;
          
          const name = prefix.Prefix.replace(this.getS3Key(path), '').replace(/\/$/, '');
          if (!name) continue;
          
          results.push({
            name,
            path: prefix.Prefix,
            size: 0,
            isDirectory: true,
            lastModified: new Date(),
            extension: undefined
          });
        }
      }
      
      return results;
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to list directory: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async getStats(path: string): Promise<FileStats> {
    await this.initializeS3Client();
    
    try {
      const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.getS3Key(path)
      });
      
      const response = await this.s3Client.send(command);
      
      return {
        size: response.ContentLength || 0,
        isDirectory: false,
        isFile: true,
        birthtime: response.LastModified || new Date(),
        atime: response.LastModified || new Date(),
        mtime: response.LastModified || new Date(),
        ctime: response.LastModified || new Date(),
        mode: 0o644,
        uid: 0,
        gid: 0
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new FilesystemError(`File not found: ${path}`, 'ENOENT', path, 's3');
      }
      throw new FilesystemError(
        `Failed to get stats: ${error.message}`,
        error.code || 'UNKNOWN',
        path,
        's3'
      );
    }
  }

  async getMimeType(path: string): Promise<string> {
    try {
      const { getMimeType } = await import('../index.js');
      return getMimeType(path);
    } catch (error) {
      return 'application/octet-stream';
    }
  }

  async upload(localPath: string, remotePath: string, options: UploadOptions = {}): Promise<void> {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(localPath);
    await this.write(remotePath, content, {
      encoding: options.contentType ? undefined : 'utf8'
    });
  }

  async download(remotePath: string, localPath?: string, options: DownloadOptions = {}): Promise<string> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    
    const content = await this.read(remotePath, { raw: true }) as Buffer;
    const targetPath = localPath || join(this.cacheDir, remotePath);
    
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
    return targetPath;
  }

  async getCapabilities(): Promise<FilesystemCapabilities> {
    return {
      streaming: true,
      atomicOperations: true,
      versioning: true,
      sharing: true,
      realTimeSync: false,
      offlineCapable: false,
      supportedOperations: [
        'exists', 'read', 'write', 'delete', 'copy', 'move',
        'createDirectory', 'list', 'getStats', 'getMimeType',
        'upload', 'download', 'downloadWithCache'
      ]
    };
  }
}