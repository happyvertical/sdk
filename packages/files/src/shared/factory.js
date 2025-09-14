import { FilesystemError } from './types.js';
/**
 * Registry of available filesystem providers
 */
const providers = new Map();
/**
 * Register a filesystem provider
 */
export function registerProvider(type, factory) {
    providers.set(type, factory);
}
/**
 * Get list of available provider types
 */
export function getAvailableProviders() {
    return Array.from(providers.keys());
}
/**
 * Validate provider options
 */
function validateOptions(options) {
    if (!options) {
        throw new FilesystemError('Provider options are required', 'EINVAL');
    }
    const type = options.type || 'local';
    switch (type) {
        case 'local':
            // Local provider has no required options
            break;
        case 's3':
            const s3Opts = options;
            if (!s3Opts.region) {
                throw new FilesystemError('S3 provider requires region', 'EINVAL');
            }
            if (!s3Opts.bucket) {
                throw new FilesystemError('S3 provider requires bucket', 'EINVAL');
            }
            break;
        case 'gdrive':
            const gdriveOpts = options;
            if (!gdriveOpts.clientId) {
                throw new FilesystemError('Google Drive provider requires clientId', 'EINVAL');
            }
            if (!gdriveOpts.clientSecret) {
                throw new FilesystemError('Google Drive provider requires clientSecret', 'EINVAL');
            }
            if (!gdriveOpts.refreshToken) {
                throw new FilesystemError('Google Drive provider requires refreshToken', 'EINVAL');
            }
            break;
        case 'webdav':
            const webdavOpts = options;
            if (!webdavOpts.baseUrl) {
                throw new FilesystemError('WebDAV provider requires baseUrl', 'EINVAL');
            }
            if (!webdavOpts.username) {
                throw new FilesystemError('WebDAV provider requires username', 'EINVAL');
            }
            if (!webdavOpts.password) {
                throw new FilesystemError('WebDAV provider requires password', 'EINVAL');
            }
            break;
        case 'browser-storage':
            // Browser storage provider has no required options
            break;
        default:
            throw new FilesystemError(`Unknown provider type: ${type}`, 'EINVAL');
    }
}
/**
 * Detect provider type from options
 */
function detectProviderType(options) {
    if (options.type) {
        return options.type;
    }
    // Auto-detect based on required fields
    if ('region' in options && 'bucket' in options) {
        return 's3';
    }
    if ('clientId' in options && 'clientSecret' in options) {
        return 'gdrive';
    }
    if ('baseUrl' in options && 'username' in options) {
        return 'webdav';
    }
    if ('databaseName' in options || 'storageQuota' in options) {
        return 'browser-storage';
    }
    // Default depends on environment
    if (typeof globalThis !== 'undefined') {
        // Check for browser environment indicators
        if (typeof globalThis.window !== 'undefined' && typeof globalThis.indexedDB !== 'undefined') {
            return 'browser-storage';
        }
        else if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
            return 'local';
        }
    }
    // Fallback detection
    return 'local';
}
/**
 * Main factory function to create filesystem instances
 */
export async function getFilesystem(options = {}) {
    // Validate options
    validateOptions(options);
    // Detect provider type
    const type = detectProviderType(options);
    // Get provider factory
    const providerFactory = providers.get(type);
    if (!providerFactory) {
        throw new FilesystemError(`Provider '${type}' is not registered. Available providers: ${getAvailableProviders().join(', ')}`, 'ENOTFOUND');
    }
    try {
        // Create provider instance
        const ProviderClass = await providerFactory();
        return new ProviderClass(options);
    }
    catch (error) {
        throw new FilesystemError(`Failed to create '${type}' provider: ${error instanceof Error ? error.message : String(error)}`, 'ENOENT', undefined, type);
    }
}
/**
 * Initialize providers by registering them
 */
export async function initializeProviders() {
    // Register local provider (always available in Node.js environment)
    registerProvider('local', async () => {
        const { LocalFilesystemProvider } = await import('../node/local.js');
        return LocalFilesystemProvider;
    });
    // In browser context, the browser entry point will register the browser-storage provider
    // For tests running in Node.js, we only register the local provider
}
/**
 * Check if a provider is available
 */
export function isProviderAvailable(type) {
    return providers.has(type);
}
/**
 * Get provider information
 */
export function getProviderInfo(type) {
    const descriptions = {
        local: 'Local filesystem provider using Node.js fs module',
        s3: 'S3-compatible provider supporting AWS S3, MinIO, and other S3-compatible services',
        gdrive: 'Google Drive provider using Google Drive API v3',
        webdav: 'WebDAV provider supporting Nextcloud, ownCloud, Apache mod_dav, and other WebDAV servers',
        'browser-storage': 'Browser storage provider using IndexedDB for app file management'
    };
    const requiredOptions = {
        local: [],
        s3: ['region', 'bucket'],
        gdrive: ['clientId', 'clientSecret', 'refreshToken'],
        webdav: ['baseUrl', 'username', 'password'],
        'browser-storage': []
    };
    return {
        available: isProviderAvailable(type),
        description: descriptions[type] || 'Unknown provider',
        requiredOptions: requiredOptions[type] || []
    };
}
//# sourceMappingURL=factory.js.map