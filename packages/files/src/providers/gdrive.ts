import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { BaseFilesystemProvider } from '../shared/base';
import {
  type CreateDirOptions,
  type DownloadOptions,
  type DriveAcquisition,
  DriveAcquisitionLimitError,
  type DriveAcquisitionOptions,
  type DriveFileMetadata,
  type DriveMetadataPage,
  type DriveMetadataPageOptions,
  DriveRevisionChangedError,
  DriveScopeError,
  type FileInfo,
  FileNotFoundError,
  type FileStats,
  type FilesystemCapabilities,
  FilesystemError,
  type GoogleDriveOptions,
  type ListOptions,
  PermissionError,
  type ReadOptions,
  type UploadOptions,
  type WriteOptions,
} from '../shared/types';

/**
 * MIME type mapping for extension-based detection
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

/**
 * Google Docs MIME types and their default export formats
 */
const GOOGLE_EXPORT_MIMES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'image/png',
};

const GOOGLE_NATIVE_MIME_PREFIX = 'application/vnd.google-apps.';
const DRIVE_METADATA_FIELDS =
  'id,name,mimeType,size,createdTime,modifiedTime,headRevisionId,md5Checksum,parents,driveId,shortcutDetails(targetId,targetMimeType,targetResourceKey)';

/** Lightweight type for Drive API responses */
interface DriveResponse<T = any> {
  data: T;
}

/** Cache entry with value and insertion timestamp */
interface CacheEntry {
  id: string;
  ts: number;
}

/**
 * Google Drive filesystem provider using the Drive API v3
 *
 * Supports three authentication modes:
 * - OAuth2: clientId + clientSecret + refreshToken (auto-refreshes)
 * - Service account: serviceAccountKey JSON string
 * - Access token: short-lived token (no auto-refresh)
 *
 * Maps hierarchical paths to Google Drive file IDs via folder traversal
 * with an in-memory TTL cache for performance.
 *
 * @example
 * ```typescript
 * const fs = new GoogleDriveProvider({
 *   type: 'gdrive',
 *   clientId: 'xxx',
 *   clientSecret: 'yyy',
 *   refreshToken: 'zzz',
 * });
 *
 * await fs.write('documents/readme.txt', 'Hello');
 * const content = await fs.read('documents/readme.txt');
 * ```
 */
export class GoogleDriveProvider extends BaseFilesystemProvider {
  private drive: any;
  private rootFolderId: string;
  private pathCache = new Map<string, CacheEntry>();
  private pathCacheTTL: number;
  private pageSize: number;
  private allowedFolderIds: Set<string>;

  constructor(private options: GoogleDriveOptions) {
    super(options);
    this.rootFolderId = options.folderId || 'root';
    this.pathCacheTTL = options.pathCacheTTL ?? 300_000;
    this.pageSize = options.pageSize ?? 100;
    this.allowedFolderIds = new Set(
      options.allowedFolderIds?.length
        ? options.allowedFolderIds
        : [this.rootFolderId],
    );
  }

  /** Shared-drive flags accepted by files.list. */
  private get driveListOptions(): Record<string, unknown> {
    if (!this.options.sharedDriveId) return {};
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'drive',
      driveId: this.options.sharedDriveId,
    };
  }

  /** Shared-drive flag accepted by files.get and files.export. */
  private get driveFileOptions(): Record<string, unknown> {
    return this.options.sharedDriveId ? { supportsAllDrives: true } : {};
  }

  private toMetadata(file: any): DriveFileMetadata {
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size === undefined ? undefined : Number(file.size),
      createdTime: file.createdTime ? new Date(file.createdTime) : undefined,
      modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      revisionId: file.headRevisionId,
      md5Checksum: file.md5Checksum,
      parents: file.parents ?? [],
      driveId: file.driveId,
      shortcutDetails: file.shortcutDetails
        ? {
            targetId: file.shortcutDetails.targetId,
            targetMimeType: file.shortcutDetails.targetMimeType,
            targetResourceKey: file.shortcutDetails.targetResourceKey,
          }
        : undefined,
    };
  }

  /**
   * Lazily initialize the Google Drive client on first use
   */
  private async getDrive(): Promise<any> {
    if (this.drive) return this.drive;

    const { google } = await import('googleapis');

    let auth: any;

    if (this.options.serviceAccountKey) {
      const { GoogleAuth } = await import('google-auth-library');
      const key = JSON.parse(this.options.serviceAccountKey);
      auth = new GoogleAuth({
        credentials: key,
        scopes: this.options.scopes || [
          'https://www.googleapis.com/auth/drive',
        ],
      });
    } else if (
      this.options.clientId &&
      this.options.clientSecret &&
      this.options.refreshToken
    ) {
      const oauth2 = new google.auth.OAuth2(
        this.options.clientId,
        this.options.clientSecret,
      );
      oauth2.setCredentials({
        refresh_token: this.options.refreshToken,
        access_token: this.options.accessToken,
      });
      auth = oauth2;
    } else if (this.options.accessToken) {
      const oauth2 = new google.auth.OAuth2();
      oauth2.setCredentials({ access_token: this.options.accessToken });
      auth = oauth2;
    } else {
      throw new FilesystemError(
        'Google Drive provider requires OAuth2 credentials, a serviceAccountKey, or an accessToken',
        'EINVAL',
        undefined,
        'gdrive',
      );
    }

    this.drive = google.drive({ version: 'v3', auth });
    return this.drive;
  }

  // ---------------------------------------------------------------------------
  // Path ↔ File-ID resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a hierarchical path like "folder/sub/file.txt" to a Drive file ID
   * by walking each segment. Results are cached with a configurable TTL.
   */
  private async resolvePathToId(path: string): Promise<string | null> {
    const normalized = this.normalizePath(path);
    if (!normalized || normalized === '.') return this.rootFolderId;

    // Check cache
    const cached = this.pathCache.get(normalized);
    if (cached && Date.now() - cached.ts < this.pathCacheTTL) {
      return cached.id;
    }

    const segments = normalized.split('/').filter(Boolean);
    let parentId = this.rootFolderId;

    for (const segment of segments) {
      const drive = await this.getDrive();
      const q = `'${parentId}' in parents and name = '${segment.replace(/'/g, "\\'")}' and trashed = false`;
      const res = await this.wrapApiCall(
        () =>
          drive.files.list({
            q,
            fields: 'files(id, name)',
            pageSize: 1,
            ...this.driveListOptions,
          }),
        path,
      );

      if (!res.data.files || res.data.files.length === 0) {
        return null;
      }
      parentId = res.data.files[0].id!;
    }

    this.pathCache.set(normalized, { id: parentId, ts: Date.now() });
    return parentId;
  }

  /**
   * Resolve a path to an ID, throwing FileNotFoundError if it doesn't exist
   */
  private async requireId(path: string): Promise<string> {
    const id = await this.resolvePathToId(path);
    if (!id) throw new FileNotFoundError(path, 'gdrive');
    return id;
  }

  /**
   * Ensure all parent folders exist for a given path, creating them if needed.
   * Returns the parent folder ID and the final segment name.
   */
  private async ensureParents(
    path: string,
  ): Promise<{ parentId: string; name: string }> {
    const normalized = this.normalizePath(path);
    const segments = normalized.split('/').filter(Boolean);
    const name = segments.pop()!;
    let parentId = this.rootFolderId;
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existingId = await this.resolvePathToId(currentPath);
      if (existingId) {
        parentId = existingId;
        continue;
      }

      // Create the folder
      const drive = await this.getDrive();
      const res = await this.wrapApiCall(
        () =>
          drive.files.create({
            requestBody: {
              name: segment,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentId],
            },
            fields: 'id',
          }),
        path,
      );
      parentId = res.data.id!;
      this.pathCache.set(currentPath, { id: parentId, ts: Date.now() });
    }

    return { parentId, name };
  }

  /**
   * Invalidate cache entries that are prefixed by the given path
   */
  private invalidateCache(path: string): void {
    const normalized = this.normalizePath(path);
    for (const key of this.pathCache.keys()) {
      if (key === normalized || key.startsWith(normalized + '/')) {
        this.pathCache.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API error mapping
  // ---------------------------------------------------------------------------

  /**
   * Wrap a Drive API call and map HTTP errors to typed filesystem errors
   */
  private async wrapApiCall(
    fn: () => Promise<any>,
    path: string,
  ): Promise<DriveResponse> {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status;
      if (status === 404) {
        throw new FileNotFoundError(path, 'gdrive');
      }
      if (status === 403) {
        throw new PermissionError(path, 'gdrive');
      }
      if (status === 401) {
        throw new FilesystemError(
          `Authentication failed: ${error.message}`,
          'EACCES',
          path,
          'gdrive',
        );
      }
      if (status === 429) {
        throw new FilesystemError(
          `Rate limited: ${error.message}`,
          'EAGAIN',
          path,
          'gdrive',
        );
      }
      throw new FilesystemError(
        `Google Drive API error: ${error.message}`,
        error.code?.toString() || 'UNKNOWN',
        path,
        'gdrive',
      );
    }
  }

  /**
   * Returns one metadata-only page. Callers persist `nextPageToken` as their
   * checkpoint and schedule recursive folder traversal themselves.
   */
  async listMetadataPage(
    options: DriveMetadataPageOptions = {},
  ): Promise<DriveMetadataPage> {
    const folderId = options.folderId ?? this.rootFolderId;
    await this.assertAllowedId(folderId);
    const drive = await this.getDrive();
    const res = await this.wrapApiCall(
      () =>
        drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields: `nextPageToken,files(${DRIVE_METADATA_FIELDS})`,
          pageSize: options.pageSize ?? this.pageSize,
          pageToken: options.pageToken,
          ...this.driveListOptions,
        }),
      folderId,
    );
    return {
      entries: (res.data.files ?? []).map((file: any) => this.toMetadata(file)),
      nextPageToken: res.data.nextPageToken ?? undefined,
    };
  }

  /** Gets stable metadata by ID after validating its configured source scope. */
  async getMetadataById(fileId: string): Promise<DriveFileMetadata> {
    const metadata = await this.getMetadataUnchecked(fileId);
    await this.assertAllowedMetadata(metadata);
    return metadata;
  }

  /**
   * Acquires a stable ID with an explicit byte bound. Native Google files must
   * name an export MIME type so callers choose fidelity deliberately.
   */
  async acquireById(
    fileId: string,
    options: DriveAcquisitionOptions,
  ): Promise<DriveAcquisition> {
    if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 0) {
      throw new FilesystemError(
        'Google Drive acquisition maxBytes must be a non-negative safe integer',
        'EINVAL',
        fileId,
        'gdrive',
      );
    }

    const requested = await this.getMetadataById(fileId);
    const target = await this.resolveAcquisitionTarget(requested);
    if (
      options.expectedRevision !== undefined &&
      target.revisionId !== options.expectedRevision
    ) {
      throw new DriveRevisionChangedError(fileId);
    }
    if (target.size !== undefined && target.size > options.maxBytes) {
      throw new DriveAcquisitionLimitError(target.id, options.maxBytes);
    }

    const isNative = target.mimeType.startsWith(GOOGLE_NATIVE_MIME_PREFIX);
    if (isNative && !options.exportMimeType) {
      throw new FilesystemError(
        'Google Drive native files require an explicit exportMimeType for acquisition',
        'EINVAL',
        target.id,
        'gdrive',
      );
    }

    const drive = await this.getDrive();
    const response = isNative
      ? await this.wrapApiCall(
          () =>
            drive.files.export(
              {
                fileId: target.id,
                mimeType: options.exportMimeType,
                ...this.driveFileOptions,
              },
              { responseType: 'stream' },
            ),
          target.id,
        )
      : await this.wrapApiCall(
          () =>
            drive.files.get(
              { fileId: target.id, alt: 'media', ...this.driveFileOptions },
              { responseType: 'stream' },
            ),
          target.id,
        );
    const bytes = await this.readBoundedResponse(
      response.data,
      target.id,
      options.maxBytes,
    );

    // Re-read metadata after bytes are streamed: a changed head revision makes
    // an otherwise successful response unsuitable as a pinned source snapshot.
    const after = await this.getMetadataById(target.id);
    if (after.revisionId !== target.revisionId) {
      throw new DriveRevisionChangedError(target.id);
    }

    return {
      bytes,
      metadata: after,
      contentHash: createHash('sha256').update(bytes).digest('hex'),
      exportMimeType: isNative ? options.exportMimeType : undefined,
    };
  }

  private async getMetadataUnchecked(
    fileId: string,
  ): Promise<DriveFileMetadata> {
    const drive = await this.getDrive();
    const res = await this.wrapApiCall(
      () =>
        drive.files.get({
          fileId,
          fields: DRIVE_METADATA_FIELDS,
          ...this.driveFileOptions,
        }),
      fileId,
    );
    return this.toMetadata(res.data);
  }

  private async assertAllowedId(fileId: string): Promise<void> {
    if (this.allowedFolderIds.has(fileId)) return;
    await this.assertAllowedMetadata(await this.getMetadataUnchecked(fileId));
  }

  private async assertAllowedMetadata(
    metadata: DriveFileMetadata,
  ): Promise<void> {
    if (this.allowedFolderIds.has(metadata.id)) return;
    const visited = new Set<string>();
    const pending = [...metadata.parents];
    while (pending.length > 0) {
      const parentId = pending.pop();
      if (!parentId) continue;
      if (this.allowedFolderIds.has(parentId)) return;
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      const parent = await this.getMetadataUnchecked(parentId);
      pending.push(...parent.parents);
    }
    throw new DriveScopeError(metadata.id);
  }

  private async resolveAcquisitionTarget(
    metadata: DriveFileMetadata,
  ): Promise<DriveFileMetadata> {
    const visited = new Set<string>();
    let target = metadata;
    while (target.shortcutDetails) {
      if (visited.has(target.id)) throw new DriveScopeError(target.id);
      visited.add(target.id);
      target = await this.getMetadataById(target.shortcutDetails.targetId);
    }
    return target;
  }

  private async readBoundedResponse(
    body: unknown,
    fileId: string,
    maxBytes: number,
  ): Promise<Buffer> {
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      if (body.byteLength > maxBytes) {
        throw new DriveAcquisitionLimitError(fileId, maxBytes);
      }
      return Buffer.from(body);
    }
    if (
      !body ||
      typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !==
        'function'
    ) {
      throw new FilesystemError(
        'Google Drive acquisition did not return a readable stream',
        'EIO',
        fileId,
        'gdrive',
      );
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) {
        if (typeof (body as { destroy?: () => void }).destroy === 'function') {
          (body as { destroy: () => void }).destroy();
        }
        throw new DriveAcquisitionLimitError(fileId, maxBytes);
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks, total);
  }

  // ---------------------------------------------------------------------------
  // FilesystemInterface implementation
  // ---------------------------------------------------------------------------

  /** Checks whether a non-trashed file or folder exists at the given path. */
  async exists(path: string): Promise<boolean> {
    const id = await this.resolvePathToId(path);
    return id !== null;
  }

  /**
   * Read a file from Google Drive. Google Docs native types (Document,
   * Spreadsheet, Presentation, Drawing) are automatically exported to a
   * portable format (plain text, CSV, PDF, PNG respectively).
   */
  async read(
    path: string,
    options: ReadOptions = {},
  ): Promise<string | Buffer> {
    const fileId = await this.requireId(path);
    const drive = await this.getDrive();

    // Get file metadata to check if it's a Google Docs type
    const meta = await this.wrapApiCall(
      () =>
        drive.files.get({
          fileId,
          fields: 'mimeType',
          ...this.driveFileOptions,
        }),
      path,
    );

    const mimeType: string = meta.data.mimeType;
    const exportMime = GOOGLE_EXPORT_MIMES[mimeType];

    let data: any;
    if (exportMime) {
      // Export Google Docs native format
      const res = await this.wrapApiCall(
        () =>
          drive.files.export(
            { fileId, mimeType: exportMime, ...this.driveFileOptions },
            { responseType: 'arraybuffer' },
          ),
        path,
      );
      data = Buffer.from(res.data);
    } else {
      // Download binary file
      const res = await this.wrapApiCall(
        () =>
          drive.files.get(
            { fileId, alt: 'media', ...this.driveFileOptions },
            { responseType: 'arraybuffer' },
          ),
        path,
      );
      data = Buffer.from(res.data);
    }

    if (options.raw) {
      return data;
    }
    return data.toString(options.encoding || 'utf8');
  }

  /** Write content to Drive. Updates the file in-place if it already exists, otherwise creates it. */
  async write(
    path: string,
    content: string | Buffer,
    options: WriteOptions = {},
  ): Promise<void> {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const ext = extname(path).toLowerCase();
    const contentMime = MIME_TYPES[ext] || 'application/octet-stream';

    const existingId = await this.resolvePathToId(path);

    const drive = await this.getDrive();

    if (existingId && existingId !== this.rootFolderId) {
      // Update existing file
      await this.wrapApiCall(
        () =>
          drive.files.update({
            fileId: existingId,
            media: { mimeType: contentMime, body },
          }),
        path,
      );
    } else {
      // Create new file — ensure parent folders exist
      if (options.createParents ?? this.createMissing) {
        const { parentId, name } = await this.ensureParents(path);
        await this.wrapApiCall(
          () =>
            drive.files.create({
              requestBody: {
                name,
                parents: [parentId],
              },
              media: { mimeType: contentMime, body },
              fields: 'id',
            }),
          path,
        );
      } else {
        // Parent must already exist
        const parentPath = dirname(this.normalizePath(path));
        const parentId =
          parentPath === '.' || parentPath === ''
            ? this.rootFolderId
            : await this.requireId(parentPath);
        const name = basename(path);
        await this.wrapApiCall(
          () =>
            drive.files.create({
              requestBody: {
                name,
                parents: [parentId],
              },
              media: { mimeType: contentMime, body },
              fields: 'id',
            }),
          path,
        );
      }
    }

    this.invalidateCache(path);
  }

  /** Moves the file to the Drive trash rather than permanently deleting it. */
  async delete(path: string): Promise<void> {
    const fileId = await this.requireId(path);
    const drive = await this.getDrive();

    // Trash the file rather than permanently deleting
    await this.wrapApiCall(
      () =>
        drive.files.update({
          fileId,
          requestBody: { trashed: true },
        }),
      path,
    );

    this.invalidateCache(path);
  }

  async copy(sourcePath: string, destPath: string): Promise<void> {
    const sourceId = await this.requireId(sourcePath);
    const drive = await this.getDrive();

    const { parentId, name } = await this.ensureParents(destPath);

    await this.wrapApiCall(
      () =>
        drive.files.copy({
          fileId: sourceId,
          requestBody: {
            name,
            parents: [parentId],
          },
          fields: 'id',
        }),
      sourcePath,
    );

    this.invalidateCache(destPath);
  }

  /** Moves a file by updating its parent references (single API call, not copy+delete). */
  async move(sourcePath: string, destPath: string): Promise<void> {
    const sourceId = await this.requireId(sourcePath);
    const drive = await this.getDrive();

    // Get current parents to remove
    const fileMeta = await this.wrapApiCall(
      () => drive.files.get({ fileId: sourceId, fields: 'parents' }),
      sourcePath,
    );
    const previousParents = (fileMeta.data.parents || []).join(',');

    const { parentId, name } = await this.ensureParents(destPath);

    await this.wrapApiCall(
      () =>
        drive.files.update({
          fileId: sourceId,
          addParents: parentId,
          removeParents: previousParents,
          requestBody: { name },
          fields: 'id, parents',
        }),
      sourcePath,
    );

    this.invalidateCache(sourcePath);
    this.invalidateCache(destPath);
  }

  async createDirectory(
    path: string,
    options: CreateDirOptions = {},
  ): Promise<void> {
    const normalized = this.normalizePath(path);
    const segments = normalized.split('/').filter(Boolean);

    if (options.recursive ?? true) {
      // Create each segment if it doesn't exist
      let currentPath = '';
      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const existingId = await this.resolvePathToId(currentPath);
        if (!existingId) {
          const parentPath = dirname(currentPath);
          const parentId =
            parentPath === '.' || parentPath === ''
              ? this.rootFolderId
              : await this.requireId(parentPath);

          const drive = await this.getDrive();
          const res = await this.wrapApiCall(
            () =>
              drive.files.create({
                requestBody: {
                  name: segment,
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [parentId],
                },
                fields: 'id',
              }),
            path,
          );
          this.pathCache.set(currentPath, {
            id: res.data.id!,
            ts: Date.now(),
          });
        }
      }
    } else {
      // Non-recursive: parent must exist
      const parentPath = dirname(normalized);
      const parentId =
        parentPath === '.' || parentPath === ''
          ? this.rootFolderId
          : await this.requireId(parentPath);
      const name = segments[segments.length - 1];

      const drive = await this.getDrive();
      const res = await this.wrapApiCall(
        () =>
          drive.files.create({
            requestBody: {
              name,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentId],
            },
            fields: 'id',
          }),
        path,
      );
      this.pathCache.set(normalized, { id: res.data.id!, ts: Date.now() });
    }
  }

  /** Lists non-trashed children of a folder, with optional pagination via {@link GoogleDriveOptions.pageSize}. */
  async list(path: string, options: ListOptions = {}): Promise<FileInfo[]> {
    const folderId =
      !path || path === '.' || path === '/'
        ? this.rootFolderId
        : await this.requireId(path);

    const drive = await this.getDrive();
    const results: FileInfo[] = [];

    let pageToken: string | undefined;

    do {
      const res = await this.wrapApiCall(
        () =>
          drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields:
              'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
            pageSize: this.pageSize,
            pageToken,
            ...this.driveListOptions,
          }),
        path,
      );

      const files = res.data.files || [];
      for (const file of files) {
        const isDir = file.mimeType === 'application/vnd.google-apps.folder';
        const name: string = file.name!;
        const filePath =
          path && path !== '.' && path !== '/'
            ? `${this.normalizePath(path)}/${name}`
            : name;

        // Apply filter
        if (options.filter) {
          const filterPattern =
            typeof options.filter === 'string'
              ? new RegExp(options.filter)
              : options.filter;
          if (!filterPattern.test(name)) continue;
        }

        const ext = isDir ? undefined : extname(name).slice(1) || undefined;

        const fileInfo: FileInfo = {
          name,
          path: filePath,
          size: Number(file.size || 0),
          isDirectory: isDir,
          lastModified: new Date(file.modifiedTime!),
          extension: ext,
        };

        if (options.detailed) {
          fileInfo.mimeType = file.mimeType!;
        }

        results.push(fileInfo);

        // Warm path cache
        this.pathCache.set(filePath, { id: file.id!, ts: Date.now() });

        // Recurse into subdirectories
        if (options.recursive && isDir) {
          const subResults = await this.list(filePath, options);
          results.push(...subResults);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return results;
  }

  /** Returns file metadata. Mode is synthetic (0o755 for folders, 0o644 for files); uid/gid are always 0. */
  async getStats(path: string): Promise<FileStats> {
    const fileId = await this.requireId(path);
    const drive = await this.getDrive();

    const res = await this.wrapApiCall(
      () =>
        drive.files.get({
          fileId,
          fields: 'id, name, mimeType, size, createdTime, modifiedTime',
          ...this.driveFileOptions,
        }),
      path,
    );

    const file = res.data;
    const isDir = file.mimeType === 'application/vnd.google-apps.folder';
    const modifiedTime = new Date(file.modifiedTime!);
    const createdTime = new Date(file.createdTime!);

    return {
      size: Number(file.size || 0),
      isDirectory: isDir,
      isFile: !isDir,
      birthtime: createdTime,
      atime: modifiedTime,
      mtime: modifiedTime,
      ctime: modifiedTime,
      mode: isDir ? 0o755 : 0o644,
      uid: 0,
      gid: 0,
    };
  }

  async getMimeType(path: string): Promise<string> {
    const ext = extname(path).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  async upload(
    localPath: string,
    remotePath: string,
    _options: UploadOptions = {},
  ): Promise<void> {
    const content = await readFile(localPath);
    await this.write(remotePath, content);
  }

  /** Downloads a file from Drive to the local filesystem, defaulting to the provider's cache directory. */
  async download(
    remotePath: string,
    localPath?: string,
    _options: DownloadOptions = {},
  ): Promise<string> {
    const content = await this.read(remotePath, { raw: true });
    const target =
      localPath || join(this.cacheDir, this.normalizePath(remotePath));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content as Buffer);
    return target;
  }

  async getCapabilities(): Promise<FilesystemCapabilities> {
    return {
      streaming: false,
      atomicOperations: false,
      versioning: true,
      sharing: true,
      realTimeSync: true,
      offlineCapable: false,
      maxFileSize: 5 * 1024 * 1024 * 1024 * 1024, // 5 TB
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
