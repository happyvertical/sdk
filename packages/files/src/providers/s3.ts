import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
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
import { enforceMaxBytes, validateMaxBytes } from '../shared/limits';
import {
  ConditionalWriteConflictError,
  ConditionalWriteUnsupportedError,
  type CreateDirOptions,
  DirectoryNotEmptyError,
  type DownloadOptions,
  FileExistsError,
  type FileInfo,
  FileNotFoundError,
  type FileStats,
  type FilesystemCapabilities,
  FilesystemError,
  InvalidPathError,
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

  private normalizeS3Path(
    path: string,
    options: { preserveTrailingSlash?: boolean } = {},
  ): string {
    const normalized =
      path === '.' || path === '/'
        ? this.basePath.replace(/^\/+|\/+$/g, '')
        : this.normalizePath(path).replace(/^\/+|\/+$/g, '');

    if (!normalized) {
      return '';
    }

    if (
      options.preserveTrailingSlash &&
      path !== '.' &&
      path !== '/' &&
      /\/+$/.test(path)
    ) {
      return `${normalized}/`;
    }

    return normalized;
  }

  private toDirectoryKey(path: string): string {
    const directoryPath = path.endsWith('/') ? path : `${path}/`;
    return this.normalizeS3Path(directoryPath, {
      preserveTrailingSlash: true,
    });
  }

  private isRootPath(path: string): boolean {
    return path === '.' || path === '/';
  }

  private toDirectoryStats(lastModified?: Date): FileStats {
    const timestamp = toDate(lastModified);
    return {
      size: 0,
      isDirectory: true,
      isFile: false,
      birthtime: timestamp,
      atime: timestamp,
      mtime: timestamp,
      ctime: timestamp,
      mode: 0,
      uid: 0,
      gid: 0,
    };
  }

  private async headDirectoryMarker(path: string) {
    const directoryKey = this.toDirectoryKey(path);
    if (!directoryKey) {
      return null;
    }

    try {
      return await this.head(directoryKey);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  private async directoryHasChildren(directoryKey: string): Promise<boolean> {
    const listing = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: directoryKey,
        MaxKeys: 2,
      }),
    );

    return (listing.Contents || []).some(
      (entry) => entry.Key && entry.Key !== directoryKey,
    );
  }

  private getDefaultDownloadTarget(remotePath: string): string {
    const normalizedRemotePath = this.normalizeS3Path(remotePath, {
      preserveTrailingSlash: remotePath.endsWith('/'),
    });
    const segments = normalizedRemotePath.split('/').filter(Boolean);

    if (!segments.length) {
      throw new InvalidPathError(remotePath, 's3');
    }

    if (
      segments.some(
        (segment) =>
          segment === '..' ||
          segment === '~' ||
          segment.startsWith('~') ||
          /^[A-Za-z]:/.test(segment),
      )
    ) {
      throw new InvalidPathError(remotePath, 's3');
    }

    const baseDir = resolve(this.cacheDir);
    const target = resolve(baseDir, ...segments);
    const targetRelativePath = relative(baseDir, target);

    if (
      !targetRelativePath ||
      targetRelativePath === '..' ||
      targetRelativePath.startsWith(`..${sep}`)
    ) {
      throw new InvalidPathError(remotePath, 's3');
    }

    return target;
  }

  private async bodyToBuffer(
    body: unknown,
    path: string,
    maxBytes?: number,
  ): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);

    const checkedBuffer = (value: Uint8Array | string): Buffer => {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      enforceMaxBytes(buffer.byteLength, maxBytes, path, 's3');
      return buffer;
    };

    if (Buffer.isBuffer(body)) return checkedBuffer(body);
    if (body instanceof Uint8Array) return checkedBuffer(body);

    if (
      maxBytes === undefined &&
      typeof (body as any).transformToByteArray === 'function'
    ) {
      const bytes = await (body as any).transformToByteArray();
      return Buffer.from(bytes);
    }

    if (typeof (body as any).getReader === 'function') {
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = Buffer.from(value);
            totalBytes += chunk.byteLength;
            enforceMaxBytes(totalBytes, maxBytes, path, 's3');
            chunks.push(chunk);
          }
        }
      } catch (error) {
        await reader.cancel(error).catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      return Buffer.concat(chunks);
    }

    if (Symbol.asyncIterator in Object(body)) {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of body as AsyncIterable<
        Uint8Array | Buffer | string
      >) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        enforceMaxBytes(totalBytes, maxBytes, path, 's3');
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    }

    if (typeof (body as any).transformToByteArray === 'function') {
      throw new FilesystemError(
        `S3 response body cannot enforce maxBytes while streaming: ${path}`,
        'ENOTSUP',
        path,
        's3',
      );
    }

    return checkedBuffer(String(body));
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
    if (this.isRootPath(path)) {
      return true;
    }

    const key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
    if (!key) {
      return true;
    }

    try {
      await this.head(key);
      return true;
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        const directoryMarker = await this.headDirectoryMarker(path);
        if (directoryMarker) {
          return true;
        }

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
    validateMaxBytes(options.maxBytes, path, 's3');
    const key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      if (response.ContentLength !== undefined) {
        enforceMaxBytes(response.ContentLength, options.maxBytes, path, 's3');
      }
      const buffer = await this.bodyToBuffer(
        response.Body,
        path,
        options.maxBytes,
      );
      if (options.raw) {
        return buffer;
      }
      return buffer.toString(options.encoding || 'utf8');
    } catch (error: any) {
      if (error instanceof FilesystemError) {
        throw error;
      }
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
    if (
      options.overwrite === false &&
      this.options.conditionalWriteStrategy !== 'if-none-match'
    ) {
      throw new ConditionalWriteUnsupportedError(path, 's3');
    }

    const key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
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
          IfNoneMatch: options.overwrite === false ? '*' : undefined,
        }),
      );
    } catch (error: any) {
      if (
        options.overwrite === false &&
        (error?.$metadata?.httpStatusCode === 412 ||
          error?.name === 'PreconditionFailed')
      ) {
        throw new FileExistsError(path, 's3');
      }
      if (
        options.overwrite === false &&
        (error?.$metadata?.httpStatusCode === 409 ||
          error?.name === 'ConditionalRequestConflict')
      ) {
        throw new ConditionalWriteConflictError(path, 's3');
      }
      if (
        options.overwrite === false &&
        (error?.$metadata?.httpStatusCode === 400 ||
          error?.$metadata?.httpStatusCode === 501 ||
          error?.name === 'InvalidRequest' ||
          error?.name === 'NotImplemented' ||
          error?.name === 'NotSupported' ||
          error?.name === 'UnsupportedOperation')
      ) {
        throw new ConditionalWriteUnsupportedError(path, 's3');
      }
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
    let key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
    try {
      if (key) {
        try {
          const stats = await this.getStats(path);
          if (stats.isDirectory) {
            key = this.toDirectoryKey(path);
            if (key && (await this.directoryHasChildren(key))) {
              throw new DirectoryNotEmptyError(path, 's3');
            }
          }
        } catch (error) {
          if (!(error instanceof FileNotFoundError)) {
            throw error;
          }
        }
      }

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error: any) {
      if (error instanceof FilesystemError) {
        throw error;
      }
      throw new FilesystemError(
        `Failed to delete S3 object: ${error instanceof Error ? error.message : String(error)}`,
        error?.name || 'UNKNOWN',
        path,
        's3',
      );
    }
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    const sourceKey = this.normalizeS3Path(sourcePath, {
      preserveTrailingSlash: sourcePath.endsWith('/'),
    });
    const destKey = this.normalizeS3Path(destPath, {
      preserveTrailingSlash: destPath.endsWith('/'),
    });
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
    if (!this.toDirectoryKey(path)) {
      return;
    }
    const directoryPath = path.endsWith('/') ? path : `${path}/`;
    await this.write(directoryPath, Buffer.alloc(0));
  }

  async list(path: string, options: ListOptions = {}): Promise<FileInfo[]> {
    const prefix = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
    const prefixWithSlash = prefix ? `${prefix.replace(/\/+$/, '')}/` : '';

    const items: FileInfo[] = [];
    const seenDirectories = new Set<string>();
    const addDirectory = (key: string, lastModified?: Date) => {
      const directoryKey = key.endsWith('/') ? key : `${key}/`;
      const normalized = directoryKey.replace(/\/$/, '');
      if (!normalized || seenDirectories.has(normalized)) {
        return;
      }
      seenDirectories.add(normalized);
      items.push(
        this.toFileInfo(directoryKey, { LastModified: lastModified }, true),
      );
    };

    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefixWithSlash,
          Delimiter: options.recursive ? undefined : '/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const prefixEntry of response.CommonPrefixes || []) {
        if (prefixEntry.Prefix) {
          addDirectory(prefixEntry.Prefix);
        }
      }

      for (const entry of response.Contents || []) {
        if (!entry.Key || entry.Key === prefixWithSlash) continue;
        const relative = prefixWithSlash
          ? entry.Key.slice(prefixWithSlash.length)
          : entry.Key;

        if (entry.Key.endsWith('/')) {
          addDirectory(entry.Key, entry.LastModified);
          continue;
        }

        if (!options.recursive && relative.includes('/')) {
          const directory = relative.split('/')[0];
          addDirectory(`${prefixWithSlash}${directory}`, entry.LastModified);
          continue;
        }

        items.push(this.toFileInfo(entry.Key, entry));
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);

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
    if (this.isRootPath(path)) {
      return this.toDirectoryStats();
    }

    const key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
    if (!key) {
      return this.toDirectoryStats();
    }

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
        const directoryMarker = await this.headDirectoryMarker(path);
        if (directoryMarker) {
          return this.toDirectoryStats(directoryMarker.LastModified);
        }

        const listing = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: `${key.replace(/\/+$/, '')}/`,
            MaxKeys: 1,
          }),
        );
        if ((listing.Contents || []).length) {
          const [firstEntry] = listing.Contents || [];
          return this.toDirectoryStats(firstEntry?.LastModified);
        }
      }
      throw error;
    }
  }

  async getMimeType(path: string): Promise<string> {
    const key = this.normalizeS3Path(path, {
      preserveTrailingSlash: path.endsWith('/'),
    });
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
    const target = localPath || this.getDefaultDownloadTarget(remotePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
    return target;
  }

  async getCapabilities(): Promise<FilesystemCapabilities> {
    return {
      streaming: true,
      atomicOperations:
        this.options.conditionalWriteStrategy === 'if-none-match',
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
