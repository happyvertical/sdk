import { stat, readFile, writeFile, unlink, mkdir, readdir, copyFile, rename, rmdir, access } from 'node:fs/promises';
import { statSync, existsSync, constants, createWriteStream } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { URL } from 'node:url';
import { FileNotFoundError, PermissionError, DirectoryNotEmptyError, FilesystemError } from '../shared/types.js';
import { BaseFilesystemProvider } from '../shared/base.js';
/**
 * Local filesystem provider using Node.js fs module with full feature support
 */
export class LocalFilesystemProvider extends BaseFilesystemProvider {
    rootPath;
    constructor(options = {}) {
        super(options);
        this.rootPath = options.basePath ? resolve(options.basePath) : process.cwd();
    }
    /**
     * Resolve path relative to root path
     */
    resolvePath(path) {
        this.validatePath(path);
        const normalized = this.normalizePath(path);
        return join(this.rootPath, normalized);
    }
    /**
     * Check if file or directory exists
     */
    async exists(path) {
        try {
            const resolvedPath = this.resolvePath(path);
            await access(resolvedPath, constants.F_OK);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Read file contents
     */
    async read(path, options = {}) {
        try {
            const resolvedPath = this.resolvePath(path);
            if (options.raw) {
                // Return raw buffer
                return await readFile(resolvedPath);
            }
            else {
                // Return string with specified encoding (default utf8)
                return await readFile(resolvedPath, options.encoding || 'utf8');
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(path, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            throw new FilesystemError(`Failed to read file: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * Write content to file
     */
    async write(path, content, options = {}) {
        try {
            const resolvedPath = this.resolvePath(path);
            // Create parent directories if needed
            if (options.createParents ?? this.createMissing) {
                await mkdir(dirname(resolvedPath), { recursive: true });
            }
            await writeFile(resolvedPath, content, {
                encoding: options.encoding,
                mode: options.mode
            });
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(dirname(path), 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            throw new FilesystemError(`Failed to write file: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * Delete file or directory
     */
    async delete(path) {
        try {
            const resolvedPath = this.resolvePath(path);
            const stats = await stat(resolvedPath);
            if (stats.isDirectory()) {
                await rmdir(resolvedPath);
            }
            else {
                await unlink(resolvedPath);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(path, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            if (error.code === 'ENOTEMPTY') {
                throw new DirectoryNotEmptyError(path, 'local');
            }
            throw new FilesystemError(`Failed to delete: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * Copy file from source to destination
     */
    async copy(sourcePath, destPath) {
        try {
            const resolvedSource = this.resolvePath(sourcePath);
            const resolvedDest = this.resolvePath(destPath);
            // Create parent directories if needed
            if (this.createMissing) {
                await mkdir(dirname(resolvedDest), { recursive: true });
            }
            await copyFile(resolvedSource, resolvedDest);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(sourcePath, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(sourcePath, 'local');
            }
            throw new FilesystemError(`Failed to copy: ${error.message}`, error.code || 'UNKNOWN', sourcePath, 'local');
        }
    }
    /**
     * Move file from source to destination
     */
    async move(sourcePath, destPath) {
        try {
            const resolvedSource = this.resolvePath(sourcePath);
            const resolvedDest = this.resolvePath(destPath);
            // Create parent directories if needed
            if (this.createMissing) {
                await mkdir(dirname(resolvedDest), { recursive: true });
            }
            await rename(resolvedSource, resolvedDest);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(sourcePath, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(sourcePath, 'local');
            }
            throw new FilesystemError(`Failed to move: ${error.message}`, error.code || 'UNKNOWN', sourcePath, 'local');
        }
    }
    /**
     * Create directory
     */
    async createDirectory(path, options = {}) {
        try {
            const resolvedPath = this.resolvePath(path);
            await mkdir(resolvedPath, {
                recursive: options.recursive ?? true,
                mode: options.mode
            });
        }
        catch (error) {
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            throw new FilesystemError(`Failed to create directory: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * List directory contents
     */
    async list(path, options = {}) {
        try {
            const resolvedPath = this.resolvePath(path);
            const entries = await readdir(resolvedPath, { withFileTypes: true });
            const results = [];
            for (const entry of entries) {
                const fullPath = join(resolvedPath, entry.name);
                const relativePath = join(path, entry.name);
                // Apply filter if provided
                if (options.filter) {
                    const filterPattern = typeof options.filter === 'string'
                        ? new RegExp(options.filter)
                        : options.filter;
                    if (!filterPattern.test(entry.name)) {
                        continue;
                    }
                }
                const stats = await stat(fullPath);
                const fileInfo = {
                    name: entry.name,
                    path: relativePath,
                    size: stats.size,
                    isDirectory: entry.isDirectory(),
                    lastModified: stats.mtime,
                    extension: entry.isFile() ? extname(entry.name).slice(1) : undefined
                };
                if (options.detailed) {
                    fileInfo.mimeType = await this.getMimeType(relativePath);
                }
                results.push(fileInfo);
                // Recursively list subdirectories if requested
                if (options.recursive && entry.isDirectory()) {
                    const subResults = await this.list(relativePath, options);
                    results.push(...subResults);
                }
            }
            return results;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(path, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            throw new FilesystemError(`Failed to list directory: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * Get file statistics
     */
    async getStats(path) {
        try {
            const resolvedPath = this.resolvePath(path);
            const stats = await stat(resolvedPath);
            return {
                size: stats.size,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile(),
                birthtime: stats.birthtime,
                atime: stats.atime,
                mtime: stats.mtime,
                ctime: stats.ctime,
                mode: stats.mode,
                uid: stats.uid,
                gid: stats.gid
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new FileNotFoundError(path, 'local');
            }
            if (error.code === 'EACCES') {
                throw new PermissionError(path, 'local');
            }
            throw new FilesystemError(`Failed to get stats: ${error.message}`, error.code || 'UNKNOWN', path, 'local');
        }
    }
    /**
     * Get MIME type for a file
     */
    async getMimeType(path) {
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.txt': 'text/plain',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.pdf': 'application/pdf',
            '.xml': 'application/xml',
            '.zip': 'application/zip',
            '.rar': 'application/x-rar-compressed',
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime'
        };
        const extension = extname(path).toLowerCase();
        return mimeTypes[extension] || 'application/octet-stream';
    }
    /**
     * Upload data to a URL using PUT method (legacy)
     */
    async uploadToUrl(url, data) {
        try {
            const response = await fetch(url, {
                method: 'PUT',
                body: data,
                headers: { 'Content-Type': 'application/octet-stream' },
            });
            if (!response.ok) {
                throw new Error(`unexpected response ${response.statusText}`);
            }
            return response;
        }
        catch (error) {
            const err = error;
            console.error(`Error uploading data to ${url}\nError: ${err.message}`);
            throw error;
        }
    }
    /**
     * Download a file from a URL and save it to a local file (legacy)
     */
    async downloadFromUrl(url, filepath) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Unexpected response ${response.statusText}`);
            }
            const fileStream = createWriteStream(this.resolvePath(filepath));
            return new Promise((resolve, reject) => {
                fileStream.on('error', reject);
                fileStream.on('finish', resolve);
                response.body?.pipeTo(new WritableStream({
                    write(chunk) {
                        fileStream.write(Buffer.from(chunk));
                    },
                    close() {
                        fileStream.end();
                    },
                    abort(reason) {
                        fileStream.destroy();
                        reject(reason);
                    },
                })).catch(reject);
            });
        }
        catch (error) {
            const err = error;
            console.error('Error downloading file:', err);
            throw error;
        }
    }
    /**
     * Download a file with caching support (legacy)
     */
    async downloadFileWithCache(url, targetPath = null) {
        const parsedUrl = new URL(url);
        const downloadPath = targetPath || join(tmpdir(), 'have-sdk', 'downloads', parsedUrl.hostname + parsedUrl.pathname);
        if (!existsSync(downloadPath)) {
            await mkdir(dirname(downloadPath), { recursive: true });
            await this.downloadFromUrl(url, downloadPath);
        }
        return downloadPath;
    }
    /**
     * Get data from cache if available and not expired (legacy)
     */
    async getCached(file, expiry = 300000) {
        const cacheFile = resolve(tmpdir(), 'have-sdk', 'cache', file);
        const cached = existsSync(cacheFile);
        if (cached) {
            const stats = statSync(cacheFile);
            const modTime = new Date(stats.mtime);
            const now = new Date();
            const isExpired = expiry && now.getTime() - modTime.getTime() > expiry;
            if (!isExpired) {
                return await readFile(cacheFile, 'utf8');
            }
        }
        return undefined;
    }
    /**
     * Set data in cache (legacy)
     */
    async setCached(file, data) {
        const cacheFile = resolve(tmpdir(), 'have-sdk', 'cache', file);
        await mkdir(dirname(cacheFile), { recursive: true });
        await writeFile(cacheFile, data);
    }
    /**
     * Cache implementation using file system
     */
    cache = {
        get: async (key, expiry) => {
            return await this.getCached(key, expiry);
        },
        set: async (key, data) => {
            await this.setCached(key, data);
        },
        clear: async (key) => {
            if (key) {
                const cacheFile = resolve(tmpdir(), 'have-sdk', 'cache', key);
                try {
                    await unlink(cacheFile);
                }
                catch {
                    // Ignore errors if file doesn't exist
                }
            }
            else {
                // Clear entire cache directory
                try {
                    const cacheDir = resolve(tmpdir(), 'have-sdk', 'cache');
                    await rmdir(cacheDir, { recursive: true });
                }
                catch {
                    // Ignore errors if directory doesn't exist
                }
            }
        }
    };
    /**
     * Get provider capabilities
     */
    async getCapabilities() {
        return {
            streaming: true,
            atomicOperations: true,
            versioning: false,
            sharing: false,
            realTimeSync: false,
            offlineCapable: true,
            supportedOperations: [
                'exists', 'read', 'write', 'delete', 'copy', 'move',
                'createDirectory', 'list', 'getStats', 'getMimeType',
                'upload', 'download', 'downloadWithCache',
                'isFile', 'isDirectory', 'ensureDirectoryExists',
                'uploadToUrl', 'downloadFromUrl', 'downloadFileWithCache',
                'listFiles', 'getCached', 'setCached'
            ]
        };
    }
}
//# sourceMappingURL=local.js.map