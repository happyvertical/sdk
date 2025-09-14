import { stat, readFile, writeFile, unlink, mkdir, readdir, copyFile, rename, rmdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { FileNotFoundError, PermissionError, DirectoryNotEmptyError, FilesystemError } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * Local filesystem provider using Node.js fs module
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
        try {
            const { getMimeType } = await import('../index.js');
            return getMimeType(path);
        }
        catch (error) {
            return 'application/octet-stream';
        }
    }
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
                'createDirectory', 'list', 'getStats', 'getMimeType'
            ]
        };
    }
}
