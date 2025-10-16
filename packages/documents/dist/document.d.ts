import { URL } from 'node:url';
import { DocumentPart, Document as DocumentType, FetchDocumentOptions } from './types';
/**
 * Base document handler with multi-part support
 *
 * Provides functionality for downloading, caching, and structuring documents
 * into hierarchical parts. Specific format processing (PDF, HTML, Markdown)
 * is handled by specialized processors.
 */
export declare class Document {
    /**
     * Flag indicating if document is from a remote source
     */
    protected isRemote: boolean;
    /**
     * Configuration options
     */
    protected options: FetchDocumentOptions;
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
    url: URL;
    /**
     * Document MIME type
     */
    type: string;
    /**
     * Document parts (hierarchical structure)
     */
    parts: DocumentPart[];
    /**
     * Document-level metadata
     */
    metadata: Record<string, any>;
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
     * @param url - Document URL or file path
     * @param options - Document configuration options
     */
    constructor(url: string, options?: FetchDocumentOptions);
    /**
     * Creates and initializes a Document instance
     *
     * Downloads remote files and prepares the document for processing.
     *
     * @param url - Document URL or file path
     * @param options - Document configuration options
     * @returns Promise resolving to the initialized Document
     */
    static create(url: string, options?: FetchDocumentOptions): Promise<Document>;
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
     * Converts the document to the standard Document interface
     *
     * @returns Document object with URL, type, parts, and metadata
     */
    toDocument(): DocumentType;
}
export default Document;
//# sourceMappingURL=document.d.ts.map