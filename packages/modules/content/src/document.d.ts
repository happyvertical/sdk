import { URL } from 'node:url';
import type { FilesystemAdapter } from '@have/files';
/**
 * Configuration options for Document
 */
export interface DocumentOptions {
    /**
     * Filesystem adapter for file operations
     */
    fs?: FilesystemAdapter;
    /**
     * Directory to use for caching files
     */
    cacheDir?: string;
    /**
     * URL or path to the document
     */
    url?: string;
    /**
     * Local file path override
     */
    localPath?: string;
    /**
     * Document MIME type
     */
    type?: string | undefined | null;
}
/**
 * Handler for document files with text extraction capabilities
 *
 * Document provides functionality for working with document files (like PDFs)
 * including downloading, caching, and extracting text content.
 */
export declare class Document {
    /**
     * Flag indicating if document is from a remote source
     */
    protected isRemote: boolean;
    /**
     * Configuration options
     */
    protected options: DocumentOptions;
    /**
     * Local file path where document is stored
     */
    private _localPath;
    /**
     * Directory used for caching files
     */
    private _cacheDir;
    /**
     * Document URL
     */
    url?: URL;
    /**
     * Document MIME type
     */
    type: string | undefined | null;
    /**
     * Get the local file path where document is stored
     */
    get localPath(): string;
    /**
     * Get the directory used for caching files
     */
    get cacheDir(): string;
    /**
     * Creates a new Document instance
     *
     * @param options - Document configuration options
     */
    constructor(options?: DocumentOptions);
    /**
     * Creates and initializes a Document instance
     *
     * @param options - Document configuration options
     * @returns Promise resolving to the initialized Document
     */
    static create(options: DocumentOptions): Promise<Document>;
    /**
     * Initializes the document, downloading it if it's remote
     *
     * @returns Promise that resolves when initialization is complete
     */
    initialize(): Promise<void>;
    /**
     * Checks if the document is a text-based file that can be read directly
     *
     * @returns Boolean indicating if the file is text-based
     */
    isTextFile(): boolean;
    /**
     * Extracts text content from the document
     *
     * Currently supports PDF documents and text-based files.
     * Uses caching to avoid repeatedly processing the same document.
     *
     * @returns Promise resolving to the extracted text content
     * @throws Error if the document type is not supported
     */
    getText(): Promise<string | null>;
}
declare const _default: {
    Document: typeof Document;
};
export default _default;
