import { 
  FilesystemCapabilities, 
  BrowserStorageOptions, 
  ReadOptions, 
  WriteOptions,
  CreateDirOptions,
  ListOptions,
  FileInfo,
  FileStats,
  FilesystemError,
  FileNotFoundError,
  ListFilesOptions,
  CacheOptions,
  UploadOptions,
  DownloadOptions
} from '../shared/types.js';
import { BaseFilesystemProvider } from '../shared/base.js';

// Buffer polyfill for browser environments
const BufferPolyfill = {
  from(data: ArrayBuffer | Uint8Array | string, encoding?: string): Uint8Array {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      return data;
    } else if (typeof data === 'string') {
      return new TextEncoder().encode(data);
    }
    return new Uint8Array(data as any);
  },
  concat(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
};

// Use global Buffer if available, otherwise use polyfill
const Buffer = (typeof globalThis !== 'undefined' && globalThis.Buffer) || BufferPolyfill;

/**
 * Browser storage provider using OPFS (Origin Private File System) for app file management
 * Falls back to IndexedDB if OPFS is not available
 * This provides a true file-like API using browser native storage
 */
export class BrowserStorageProvider extends BaseFilesystemProvider {
  private rootDirectory: FileSystemDirectoryHandle | null = null;
  private cacheDirectory: FileSystemDirectoryHandle | null = null;
  private readonly fallbackDb: IDBDatabase | null = null;
  private readonly useIndexedDBFallback: boolean = false;
  private readonly storageQuota: number;
  private readonly databaseName: string;

  constructor(options: BrowserStorageOptions = { type: 'browser-storage' }) {
    super(options);
    this.storageQuota = options.storageQuota || 50 * 1024 * 1024; // 50MB default
    this.databaseName = options.databaseName || 'have-files';
  }

  /**
   * Initialize OPFS or fall back to IndexedDB
   */
  private async initialize(): Promise<void> {
    if (this.rootDirectory || this.fallbackDb) return;

    // Try to use OPFS first
    if ('storage' in navigator && navigator.storage && 'getDirectory' in navigator.storage) {
      try {
        this.rootDirectory = await navigator.storage.getDirectory();
        // Create cache subdirectory
        this.cacheDirectory = await this.rootDirectory.getDirectoryHandle('cache', { create: true });
        return;
      } catch (error) {
        console.warn('OPFS initialization failed, falling back to IndexedDB:', error);
      }
    }

    // Fall back to IndexedDB
    (this as any).useIndexedDBFallback = true;
    return this.initializeIndexedDB();
  }

  /**
   * Initialize IndexedDB as fallback
   */
  private async initializeIndexedDB(): Promise<void> {
    if ((this as any).fallbackDb) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      
      request.onerror = () => {
        reject(new FilesystemError(
          'Failed to open IndexedDB database',
          'ENOTFOUND',
          undefined,
          'browser-storage'
        ));
      };

      request.onsuccess = () => {
        (this as any).fallbackDb = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Files store
        if (!db.objectStoreNames.contains('files')) {
          const filesStore = db.createObjectStore('files', { keyPath: 'path' });
          filesStore.createIndex('directory', 'directory');
        }
        
        // Cache store
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
          cacheStore.createIndex('expiry', 'expiry');
        }
      };
    });
  }

  /**
   * Get transaction for database operations
   */
  private async getTransaction(stores: string[], mode: IDBTransactionMode = 'readonly'): Promise<IDBTransaction> {
    if (!this.useIndexedDBFallback) {
      throw new FilesystemError('IndexedDB transaction called without fallback mode', 'ENOTFOUND');
    }
    await this.initializeIndexedDB();
    if (!(this as any).fallbackDb) {
      throw new FilesystemError('Database not initialized', 'ENOTFOUND');
    }
    return (this as any).fallbackDb.transaction(stores, mode);
  }

  /**
   * Normalize path for storage (remove leading slash, handle directories)
   */
  private normalizeStoragePath(path: string): string {
    let normalized = this.normalizePath(path);
    // Ensure no leading slash for storage keys
    return normalized.startsWith('/') ? normalized.slice(1) : normalized;
  }

  /**
   * Get directory path from file path
   */
  private getDirectoryPath(path: string): string {
    const parts = path.split('/');
    return parts.slice(0, -1).join('/');
  }

  /**
   * Get file or directory handle from path using OPFS
   */
  private async getHandleFromPath(path: string, options: { create?: boolean; directory?: boolean } = {}): Promise<FileSystemHandle> {
    await this.initialize();
    if (!this.rootDirectory) {
      throw new FilesystemError('OPFS not available', 'ENOTSUP');
    }

    const normalizedPath = this.normalizeStoragePath(path);
    if (!normalizedPath) {
      return this.rootDirectory;
    }

    const parts = normalizedPath.split('/').filter(part => part.length > 0);
    let currentDir = this.rootDirectory;

    // Navigate to parent directory
    for (let i = 0; i < parts.length - 1; i++) {
      try {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: options.create });
      } catch (error) {
        if (options.create) {
          throw new FilesystemError(`Failed to create directory: ${parts[i]}`, 'ENOENT', path, 'browser-storage');
        }
        throw new FileNotFoundError(path, 'browser-storage');
      }
    }

    // Get final file or directory handle
    const finalName = parts[parts.length - 1];
    if (!finalName) {
      return currentDir;
    }

    try {
      if (options.directory) {
        return await currentDir.getDirectoryHandle(finalName, { create: options.create });
      } else {
        return await currentDir.getFileHandle(finalName, { create: options.create });
      }
    } catch (error) {
      if (options.create) {
        throw new FilesystemError(`Failed to create ${options.directory ? 'directory' : 'file'}: ${finalName}`, 'ENOENT', path, 'browser-storage');
      }
      throw new FileNotFoundError(path, 'browser-storage');
    }
  }

  /**
   * Check if file or directory exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      const transaction = await this.getTransaction(['files']);
      const store = transaction.objectStore('files');
      const normalizedPath = this.normalizeStoragePath(path);
      
      return new Promise((resolve, reject) => {
        const request = store.get(normalizedPath);
        request.onsuccess = () => resolve(!!request.result);
        request.onerror = () => reject(new FilesystemError('Failed to check existence', 'UNKNOWN', path, 'browser-storage'));
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Read file contents
   */
  async read(path: string, options: ReadOptions = {}): Promise<string | Buffer> {
    const transaction = await this.getTransaction(['files']);
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    
    return new Promise((resolve, reject) => {
      const request = store.get(normalizedPath);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          reject(new FileNotFoundError(path, 'browser-storage'));
          return;
        }
        
        if (result.isDirectory) {
          reject(new FilesystemError('Path is a directory', 'EISDIR', path, 'browser-storage'));
          return;
        }
        
        if (options.raw) {
          // Convert ArrayBuffer back to Buffer for interface compatibility
          resolve(Buffer.from(result.content) as any);
        } else {
          // Convert ArrayBuffer to string
          const encoding = (options.encoding || 'utf-8') as string;
          const decoder = new TextDecoder(encoding);
          resolve(decoder.decode(result.content));
        }
      };
      request.onerror = () => reject(new FilesystemError('Failed to read file', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * Write content to file
   */
  async write(path: string, content: string | Buffer, options: WriteOptions = {}): Promise<void> {
    const transaction = await this.getTransaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    const directory = this.getDirectoryPath(normalizedPath);
    
    // Convert content to ArrayBuffer for storage
    let arrayBuffer: ArrayBuffer;
    if (typeof content === 'string') {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(content);
      arrayBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
    } else {
      // Handle Buffer/Uint8Array - create a fresh copy to ensure proper ArrayBuffer
      const bytes = content instanceof Uint8Array ? content : new Uint8Array(content as any);
      const copy = new Uint8Array(bytes);
      arrayBuffer = copy.buffer as ArrayBuffer;
    }
    
    const fileRecord = {
      path: normalizedPath,
      directory,
      content: arrayBuffer,
      size: arrayBuffer.byteLength,
      isDirectory: false,
      lastModified: new Date(),
      mimeType: await this.getMimeType(path)
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(fileRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new FilesystemError('Failed to write file', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * Delete file or directory
   */
  async delete(path: string): Promise<void> {
    const transaction = await this.getTransaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(normalizedPath);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new FilesystemError('Failed to delete', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * Copy file from source to destination
   */
  async copy(sourcePath: string, destPath: string): Promise<void> {
    const content = await this.read(sourcePath, { raw: true });
    await this.write(destPath, content as Buffer);
  }

  /**
   * Move file from source to destination
   */
  async move(sourcePath: string, destPath: string): Promise<void> {
    await this.copy(sourcePath, destPath);
    await this.delete(sourcePath);
  }

  /**
   * Create directory (in IndexedDB, directories are implicit)
   */
  async createDirectory(path: string, options: CreateDirOptions = {}): Promise<void> {
    const transaction = await this.getTransaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    
    const dirRecord = {
      path: normalizedPath,
      directory: this.getDirectoryPath(normalizedPath),
      content: new ArrayBuffer(0),
      size: 0,
      isDirectory: true,
      lastModified: new Date(),
      mimeType: 'inode/directory'
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(dirRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new FilesystemError('Failed to create directory', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * List directory contents
   */
  async list(path: string, options: ListOptions = {}): Promise<FileInfo[]> {
    const transaction = await this.getTransaction(['files']);
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    
    return new Promise((resolve, reject) => {
      const results: FileInfo[] = [];
      const request = store.openCursor();
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value;
          
          // Check if this file is in the requested directory
          if (record.directory === normalizedPath || 
              (normalizedPath === '' && !record.directory.includes('/'))) {
            
            const name = record.path.split('/').pop() || record.path;
            
            // Apply filter if provided
            if (options.filter) {
              const filterPattern = typeof options.filter === 'string' 
                ? new RegExp(options.filter) 
                : options.filter;
              
              if (!filterPattern.test(name)) {
                cursor.continue();
                return;
              }
            }
            
            const fileInfo: FileInfo = {
              name,
              path: record.path,
              size: record.size,
              isDirectory: record.isDirectory,
              lastModified: record.lastModified,
              extension: record.isDirectory ? undefined : name.split('.').pop()
            };
            
            if (options.detailed) {
              fileInfo.mimeType = record.mimeType;
            }
            
            results.push(fileInfo);
          }
          
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => reject(new FilesystemError('Failed to list directory', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * Get file statistics
   */
  async getStats(path: string): Promise<FileStats> {
    const transaction = await this.getTransaction(['files']);
    const store = transaction.objectStore('files');
    const normalizedPath = this.normalizeStoragePath(path);
    
    return new Promise((resolve, reject) => {
      const request = store.get(normalizedPath);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          reject(new FileNotFoundError(path, 'browser-storage'));
          return;
        }
        
        const stats: FileStats = {
          size: result.size,
          isDirectory: result.isDirectory,
          isFile: !result.isDirectory,
          birthtime: result.lastModified,
          atime: result.lastModified,
          mtime: result.lastModified,
          ctime: result.lastModified,
          mode: result.isDirectory ? 0o755 : 0o644,
          uid: 0,
          gid: 0
        };
        
        resolve(stats);
      };
      request.onerror = () => reject(new FilesystemError('Failed to get stats', 'UNKNOWN', path, 'browser-storage'));
    });
  }

  /**
   * Get MIME type for a file
   */
  async getMimeType(path: string): Promise<string> {
    const extension = path.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: { [key: string]: string } = {
      'txt': 'text/plain',
      'json': 'application/json',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
      'zip': 'application/zip'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Cache implementation using OPFS or IndexedDB
   */
  cache = {
    get: async (key: string, expiry?: number): Promise<string | undefined> => {
      if (this.useIndexedDBFallback) {
        return this.cacheGetIndexedDB(key, expiry);
      }

      try {
        await this.initialize();
        if (!this.cacheDirectory) return undefined;

        const cacheFile = await this.cacheDirectory.getFileHandle(`${key}.json`);
        const file = await cacheFile.getFile();
        const content = await file.text();
        const cacheData = JSON.parse(content);

        // Check expiry
        if (expiry && cacheData.expiry && Date.now() > cacheData.expiry) {
          // Clean up expired cache
          await this.cacheDirectory.removeEntry(`${key}.json`);
          return undefined;
        }

        return cacheData.data;
      } catch {
        return undefined;
      }
    },

    set: async (key: string, data: string): Promise<void> => {
      if (this.useIndexedDBFallback) {
        return this.cacheSetIndexedDB(key, data);
      }

      try {
        await this.initialize();
        if (!this.cacheDirectory) {
          throw new FilesystemError('Cache directory not available', 'ENOTSUP');
        }

        const cacheFile = await this.cacheDirectory.getFileHandle(`${key}.json`, { create: true });
        const writable = await cacheFile.createWritable();
        
        const cacheData = {
          key,
          data,
          created: Date.now(),
          expiry: null
        };
        
        await writable.write(JSON.stringify(cacheData));
        await writable.close();
      } catch (error) {
        throw new FilesystemError('Failed to set cache', 'UNKNOWN');
      }
    },

    clear: async (key?: string): Promise<void> => {
      if (this.useIndexedDBFallback) {
        return this.cacheClearIndexedDB(key);
      }

      try {
        await this.initialize();
        if (!this.cacheDirectory) return;

        if (key) {
          await this.cacheDirectory.removeEntry(`${key}.json`);
        } else {
          // Clear all cache files
          for await (const [name] of this.cacheDirectory.entries()) {
            await this.cacheDirectory.removeEntry(name);
          }
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
  };

  /**
   * Cache get using IndexedDB fallback
   */
  private async cacheGetIndexedDB(key: string, expiry?: number): Promise<string | undefined> {
    const transaction = await this.getTransaction(['cache']);
    const store = transaction.objectStore('cache');
    
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(undefined);
          return;
        }
        
        // Check expiry
        if (expiry && result.expiry && Date.now() > result.expiry) {
          resolve(undefined);
          return;
        }
        
        resolve(result.data);
      };
      request.onerror = () => resolve(undefined);
    });
  }

  /**
   * Cache set using IndexedDB fallback
   */
  private async cacheSetIndexedDB(key: string, data: string): Promise<void> {
    const transaction = await this.getTransaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    
    const cacheRecord = {
      key,
      data,
      created: Date.now(),
      expiry: null
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(cacheRecord);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new FilesystemError('Failed to set cache', 'UNKNOWN'));
    });
  }

  /**
   * Cache clear using IndexedDB fallback
   */
  private async cacheClearIndexedDB(key?: string): Promise<void> {
    const transaction = await this.getTransaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    
    return new Promise((resolve, reject) => {
      const request = key ? store.delete(key) : store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new FilesystemError('Failed to clear cache', 'UNKNOWN'));
    });
  }

  /**
   * Get temp directory path for browser context
   */
  async getTempDirectory(subfolder?: string): Promise<string> {
    await this.initialize();
    
    if (!this.useIndexedDBFallback && this.rootDirectory) {
      // Use OPFS temp directory
      const tempPath = subfolder ? `/temp/${subfolder}` : '/temp';
      
      // Ensure temp directory exists
      try {
        await this.getHandleFromPath(tempPath, { create: true, directory: true });
      } catch (error) {
        throw new FilesystemError('Failed to create temp directory', 'ENOENT', tempPath, 'browser-storage');
      }
      
      return tempPath;
    } else {
      // Use memory-based temp for IndexedDB fallback
      const tempPath = subfolder ? `temp/${subfolder}` : 'temp';
      
      // Create temp directory entry
      try {
        await this.createDirectory(tempPath);
      } catch {
        // Directory might already exist
      }
      
      return tempPath;
    }
  }

  /**
   * Get context-aware cache directory
   */
  getContextCacheDirectory(): string {
    if (typeof process !== 'undefined' && process.versions?.node) {
      // This shouldn't happen in browser context, but fallback gracefully
      return './tmp/have-sdk/files-cache';
    }
    
    // Browser context - return virtual cache path
    return '/cache';
  }

  /**
   * HTTP operations are not supported in browser storage
   */
  async uploadToUrl(url: string, data: string | Buffer): Promise<Response> {
    // Browser can do HTTP uploads, but not to arbitrary URLs due to CORS
    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: data,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      throw new FilesystemError(
        `Upload failed (CORS or network error): ${error}`,
        'ENOTSUP',
        url,
        'browser-storage'
      );
    }
  }

  async downloadFromUrl(url: string, filepath: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      await this.write(filepath, Buffer.from(arrayBuffer) as any);
    } catch (error) {
      throw new FilesystemError(
        `Download failed (CORS or network error): ${error}`,
        'ENOTSUP',
        url,
        'browser-storage'
      );
    }
  }

  async downloadFileWithCache(url: string, targetPath?: string | null): Promise<string> {
    const parsedUrl = new URL(url);
    const downloadPath = targetPath || `downloads/${parsedUrl.hostname}${parsedUrl.pathname}`;
    
    if (!(await this.exists(downloadPath))) {
      await this.downloadFromUrl(url, downloadPath);
    }
    return downloadPath;
  }

  /**
   * Get provider capabilities
   */
  async getCapabilities(): Promise<FilesystemCapabilities> {
    await this.initialize();
    
    return {
      streaming: !this.useIndexedDBFallback, // OPFS supports streaming
      atomicOperations: true,
      versioning: false,
      sharing: false,
      realTimeSync: false,
      offlineCapable: true,
      maxFileSize: this.storageQuota,
      supportedOperations: [
        'exists', 'read', 'write', 'delete', 'copy', 'move',
        'createDirectory', 'list', 'getStats', 'getMimeType',
        'isFile', 'isDirectory', 'ensureDirectoryExists',
        'uploadToUrl', 'downloadFromUrl', 'downloadFileWithCache',
        'listFiles', 'getCached', 'setCached'
      ]
    };
  }
}

// TypeScript declarations for OPFS API
declare global {
  interface Navigator {
    storage?: {
      getDirectory(): Promise<FileSystemDirectoryHandle>;
    };
  }
  
  interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
  }
  
  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file';
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
  }
  
  interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: 'directory';
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    keys(): AsyncIterableIterator<string>;
    values(): AsyncIterableIterator<FileSystemHandle>;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  
  interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | ArrayBuffer | ArrayBufferView): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
    close(): Promise<void>;
  }
}