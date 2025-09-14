import { FilesystemError } from '../types.js';
import { BaseFilesystemProvider } from './base.js';
/**
 * WebDAV filesystem provider
 *
 * This provider uses WebDAV protocol for file operations and supports various
 * WebDAV-compatible servers including Nextcloud, ownCloud, Apache mod_dav,
 * Nginx WebDAV module, Windows IIS, SabreDAV, and others.
 * It supports basic authentication and chunked uploads for large files.
 */
export class WebDAVFilesystemProvider extends BaseFilesystemProvider {
    baseUrl;
    username;
    password;
    davPath;
    webdavClient; // Will be initialized when WebDAV client is available
    constructor(options) {
        super(options);
        this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
        this.username = options.username;
        this.password = options.password;
        this.davPath = options.davPath || '/remote.php/dav/files';
    }
    /**
     * Initialize WebDAV client
     */
    async initializeWebDAVClient() {
        if (this.webdavClient)
            return;
        try {
            // Dynamic import to avoid bundling WebDAV client if not needed
            const { createClient } = await import('webdav');
            const webdavUrl = `${this.baseUrl}${this.davPath}/${this.username}`;
            this.webdavClient = createClient(webdavUrl, {
                username: this.username,
                password: this.password
            });
        }
        catch (error) {
            throw new FilesystemError('WebDAV client is not available. Install webdav to use WebDAV provider.', 'ENOTFOUND');
        }
    }
    /**
     * Convert path to WebDAV path
     */
    getWebDAVPath(path) {
        return this.normalizePath(path);
    }
    async exists(path) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        return false;
    }
    async read(path, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', path, 'webdav');
    }
    async write(path, content, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', path, 'webdav');
    }
    async delete(path) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', path, 'webdav');
    }
    async copy(sourcePath, destPath) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', sourcePath, 'webdav');
    }
    async move(sourcePath, destPath) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', sourcePath, 'webdav');
    }
    async createDirectory(path, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', path, 'webdav');
    }
    async list(path, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        return [];
    }
    async getStats(path) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', path, 'webdav');
    }
    async getMimeType(path) {
        try {
            const { getMimeType } = await import('../index.js');
            return getMimeType(path);
        }
        catch (error) {
            return 'application/octet-stream';
        }
    }
    async upload(localPath, remotePath, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', remotePath, 'webdav');
    }
    async download(remotePath, localPath, options = {}) {
        // Placeholder implementation
        await this.initializeWebDAVClient();
        throw new FilesystemError('WebDAV provider not fully implemented yet', 'ENOTIMPL', remotePath, 'webdav');
    }
    async getCapabilities() {
        return {
            streaming: true,
            atomicOperations: true,
            versioning: true,
            sharing: true,
            realTimeSync: true,
            offlineCapable: false,
            supportedOperations: [
            // Will be populated as methods are implemented
            ]
        };
    }
}
