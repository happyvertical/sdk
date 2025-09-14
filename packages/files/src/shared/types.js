/**
 * Core types and interfaces for the Files library
 */
/**
 * Error types for filesystem operations
 */
export class FilesystemError extends Error {
    code;
    path;
    provider;
    constructor(message, code, path, provider) {
        super(message);
        this.code = code;
        this.path = path;
        this.provider = provider;
        this.name = 'FilesystemError';
    }
}
export class FileNotFoundError extends FilesystemError {
    constructor(path, provider) {
        super(`File not found: ${path}`, 'ENOENT', path, provider);
        this.name = 'FileNotFoundError';
    }
}
export class PermissionError extends FilesystemError {
    constructor(path, provider) {
        super(`Permission denied: ${path}`, 'EACCES', path, provider);
        this.name = 'PermissionError';
    }
}
export class DirectoryNotEmptyError extends FilesystemError {
    constructor(path, provider) {
        super(`Directory not empty: ${path}`, 'ENOTEMPTY', path, provider);
        this.name = 'DirectoryNotEmptyError';
    }
}
export class InvalidPathError extends FilesystemError {
    constructor(path, provider) {
        super(`Invalid path: ${path}`, 'EINVAL', path, provider);
        this.name = 'InvalidPathError';
    }
}
//# sourceMappingURL=types.js.map