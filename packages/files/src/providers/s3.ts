import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import {
  type _Object,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BaseFilesystemProvider } from '../shared/base';
import {
  type CreateDirOptions,
  type DownloadOptions,
  type FileInfo,
  FileNotFoundError,
  type FileStats,
  type FilesystemCapabilities,
  FilesystemError,
  type ListOptions,
  PermissionError,
  type ReadOptions,
  type S3Options,
  type UploadOptions,
  type WriteOptions,
} from '../shared/types';

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function toDate(value?: Date): Date {
  return value instanceof Date ? value : new Date();
}

function toCopySource(bucket: string, key: string): string {
  return `${bucket}/${key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

export class S3FilesystemProvider extends BaseFilesystemProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly options: S3Options) {
    super(options);
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? {
              accessKeyId: options.accessKeyId,
              secretAccessKey: options.secretAccessKey,
            }
          : undefined,
    });
  }

  private normalizeS3Path(path: string): string {
    if (path === '.' || path === '/') {
      return this.basePath.replace(/^\/+|\/+$/g, '');
    }
    return this.normalizePath(path).replace(/^\/+|\/+$/g, '');
  }

  private async bodyToBuffer(body: unknown): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof Uint8Array) return Buffer.from(body);

    if (typeof (body as any).transformToByteArray === 'function') {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    }

    if (typeof (body as any).getReader === 'function') {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const chunks: Buffer[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    }

    if (Symbol.asyncIterator in Object(body)) {
      const chunks: Buffer[] = [];
      for await (const chunk of body as AsyncIterable<
        Uint8Array | Buffer | string
      >) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }

    return Buffer.from(String(body));
  }

  private async head(key: string) {
    try {
      return await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error: any) {
      if (
        error?.$metadata?.httpStatusCode === 404 ||
        error?.name === 'NotFound'
      ) {
        throw new FileNotFoundError(key, 's3');
      }
      if (error?.$metadata?.httpStatusCode === 403) {
        throw new PermissionError(key, 's3');
      }
      throw new FilesystemError(
        `Failed to stat S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        key,
        's3',
      );
    }
  }

  private toFileInfo(
    key: string,
    entry: Partial<_Object>,
    isDirectory = false,
  ): FileInfo {
    const normalized = key.replace(/\/$/, '');
    const name = normalized.split('/').pop() || normalized;
    const extension = isDirectory
      ? undefined
      : extname(normalized).replace(/^\./, '');
    const mimeType = isDirectory
      ? undefined
      : MIME_TYPES[extname(normalized).toLowerCase()] ||
        'application/octet-stream';

    return {
      name,
      path: normalized,
      size: Number(entry.Size || 0),
      isDirectory,
      lastModified: toDate(entry.LastModified),
      mimeType,
      extension,
    };
  }

  async exists(path: string): Promise<boolean> {
    const key = this.normalizeS3Path(path);
    if (!key) {
      return true;
    }

    try {
      await this.head(key);
      return true;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        const listing = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: `${key}/`,
            MaxKeys: 1,
          }),
        );
        return Boolean((listing.Contents || []).length);
      }
      throw error;
    }
  }

  async read(
    path: string,
    options: ReadOptions = {},
  ): Promise<string | Buffer> {
    const key = this.normalizeS3Path(path);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      const buffer = await this.bodyToBuffer(response.Body);
      if (options.raw) {
        return buffer;
      }
      return buffer.toString(options.encoding || 'utf8');
    } catch (error: any) {
      if (
        error?.$metadata?.httpStatusCode === 404 ||
        error?.name === 'NoSuchKey'
      ) {
        throw new FileNotFoundError(path, 's3');
      }
      if (error?.$metadata?.httpStatusCode === 403) {
        throw new PermissionError(path, 's3');
      }
      throw new FilesystemError(
        `Failed to read S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        path,
        's3',
      );
    }
  }

  async write(
    path: string,
    content: string | Buffer,
    options: WriteOptions = {},
  ): Promise<void> {
    const key = this.normalizeS3Path(path);
    const body =
      typeof content === 'string'
        ? Buffer.from(content, options.encoding || 'utf8')
        : content;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType:
            MIME_TYPES[extname(key).toLowerCase()] ||
            'application/octet-stream',
        }),
      );
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 403) {
        throw new PermissionError(path, 's3');
      }
      throw new FilesystemError(
        `Failed to write S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        path,
        's3',
      );
    }
  }

  async delete(path: string): Promise<void> {
    const key = this.normalizeS3Path(path);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to delete S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        path,
        's3',
      );
    }
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    const sourceKey = this.normalizeS3Path(sourcePath);
    const destKey = this.normalizeS3Path(destPath);
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          Key: destKey,
          CopySource: toCopySource(this.bucket, sourceKey),
        }),
      );
    } catch (error: any) {
      throw new FilesystemError(
        `Failed to copy S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        destPath,
        's3',
      );
    }
  }

  async move(sourcePath: string, destPath: string): Promise<void> {
    await this.copy(sourcePath, destPath);
    await this.delete(sourcePath);
  }

  async createDirectory(
    path: string,
    _options: CreateDirOptions = {},
  ): Promise<void> {
    const key = this.normalizeS3Path(path).replace(/\/?$/, '/');
    if (!key) {
      return;
    }
    await this.write(key, Buffer.alloc(0));
  }

  async list(path: string, options: ListOptions = {}): Promise<FileInfo[]> {
    const prefix = this.normalizeS3Path(path);
    const prefixWithSlash = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefixWithSlash,
        Delimiter: options.recursive ? undefined : '/',
      }),
    );

    const items: FileInfo[] = [];
    const seenDirectories = new Set<string>();

    for (const entry of response.Contents || []) {
      if (!entry.Key || entry.Key === prefixWithSlash) continue;
      const relative = prefixWithSlash
        ? entry.Key.slice(prefixWithSlash.length)
        : entry.Key;

      if (!options.recursive && relative.includes('/')) {
        const directory = relative.split('/')[0];
        if (!seenDirectories.has(directory)) {
          seenDirectories.add(directory);
          items.push(
            this.toFileInfo(
              `${prefixWithSlash}${directory}/`,
              { LastModified: entry.LastModified },
              true,
            ),
          );
        }
        continue;
      }

      items.push(this.toFileInfo(entry.Key, entry));
    }

    return items.filter((item) => {
      if (!options.filter) return true;
      const matcher =
        typeof options.filter === 'string'
          ? new RegExp(options.filter)
          : options.filter;
      return matcher.test(item.name);
    });
  }

  async getStats(path: string): Promise<FileStats> {
    const key = this.normalizeS3Path(path);

    try {
      const response = await this.head(key);
      return {
        size: Number(response.ContentLength || 0),
        isDirectory: key.endsWith('/'),
        isFile: !key.endsWith('/'),
        birthtime: toDate(response.LastModified),
        atime: toDate(response.LastModified),
        mtime: toDate(response.LastModified),
        ctime: toDate(response.LastModified),
        mode: 0,
        uid: 0,
        gid: 0,
      };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        const listing = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: `${key.replace(/\/+$/, '')}/`,
            MaxKeys: 1,
          }),
        );
        if ((listing.Contents || []).length) {
          return {
            size: 0,
            isDirectory: true,
            isFile: false,
            birthtime: new Date(),
            atime: new Date(),
            mtime: new Date(),
            ctime: new Date(),
            mode: 0,
            uid: 0,
            gid: 0,
          };
        }
      }
      throw error;
    }
  }

  async getMimeType(path: string): Promise<string> {
    const key = this.normalizeS3Path(path);
    try {
      const response = await this.head(key);
      return (
        response.ContentType ||
        MIME_TYPES[extname(key).toLowerCase()] ||
        'application/octet-stream'
      );
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return (
          MIME_TYPES[extname(key).toLowerCase()] || 'application/octet-stream'
        );
      }
      throw error;
    }
  }

  async upload(
    localPath: string,
    remotePath: string,
    _options: UploadOptions = {},
  ): Promise<void> {
    const { readFile } = await import('node:fs/promises');
    await this.write(remotePath, await readFile(localPath));
  }

  async download(
    remotePath: string,
    localPath?: string,
    _options: DownloadOptions = {},
  ): Promise<string> {
    const buffer = (await this.read(remotePath, { raw: true })) as Buffer;
    const target =
      localPath ||
      join(tmpdir(), 'happyvertical-files', this.normalizeS3Path(remotePath));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return target;
  }

  async getCapabilities(): Promise<FilesystemCapabilities> {
    return {
      streaming: true,
      atomicOperations: false,
      versioning: false,
      sharing: false,
      realTimeSync: false,
      offlineCapable: false,
      supportedOperations: [
        'exists',
        'read',
        'write',
        'delete',
        'copy',
        'move',
        'createDirectory',
        'list',
        'getStats',
        'getMimeType',
        'upload',
        'download',
      ],
    };
  }
}
