import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { downloadFileWithCache, getMimeType } from '@happyvertical/files';
import { makeSlug } from '@happyvertical/utils';
import type {
  DocumentPart,
  Document as DocumentType,
  FetchDocumentOptions,
} from './types';

/**
 * Base document handler with multi-part support
 *
 * Provides functionality for downloading, caching, and structuring documents
 * into hierarchical parts. Specific format processing (PDF, HTML, Markdown)
 * is handled by specialized processors.
 */
export class Document {
  /**
   * Flag indicating if document is from a remote source
   */
  protected isRemote = false;

  /**
   * Configuration options
   */
  protected options: FetchDocumentOptions;

  /**
   * Local file path where document is stored
   */
  private _localPath = '';

  /**
   * Directory used for caching files
   */
  private _cacheDir = '';

  /**
   * Document URL
   */
  public url: URL;

  /**
   * Document MIME type
   */
  public type: string;

  /**
   * Document parts (hierarchical structure)
   */
  public parts: DocumentPart[] = [];

  /**
   * Document-level metadata
   */
  public metadata: Record<string, any> = {};

  /**
   * Get the local file path where document is stored
   */
  public get localPath(): string {
    return this._localPath;
  }

  /**
   * Get the directory used for caching files
   */
  public get cacheDir(): string {
    return this._cacheDir;
  }

  /**
   * Creates a new Document instance
   *
   * @param url - Document URL or file path
   * @param options - Document configuration options
   */
  constructor(url: string, options: FetchDocumentOptions = {}) {
    this.url = new URL(url);
    this.options = options;
    this.type =
      options.type || getMimeType(this.url.toString()) || 'text/plain';

    this._cacheDir =
      options.cacheDir ||
      path.resolve(os.tmpdir(), '.cache', 'have-sdk', 'documents');

    if (this.url.protocol.startsWith('file')) {
      // Decode URL-encoded characters in the pathname only (e.g., %20 -> space).
      // Note: Query parameters and hash fragments are not decoded here.
      this._localPath = decodeURIComponent(this.url.pathname);
      this.isRemote = false;
    } else if (this.url.protocol.startsWith('http')) {
      // Generate cache path from URL pathname
      // Query parameters (?) and fragments (#) are automatically excluded from url.pathname
      let pathname = this.url.pathname;

      // Remove trailing slash (directory-style URLs)
      if (pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }

      // Add file extension if missing and we know the type
      // This is crucial for URLs like /download/file/?wpdmdl=123 which have no extension
      if (!pathname.match(/\.[a-z0-9]+$/i)) {
        // Add appropriate extension based on MIME type
        if (
          this.type === 'application/pdf' ||
          options.type === 'application/pdf'
        ) {
          pathname += '.pdf';
        }
        // Future: Add other common extensions (html, json, etc.)
      }

      this._localPath = path.join(
        this._cacheDir,
        makeSlug(this.url.hostname),
        pathname,
      );
      this.isRemote = true;
    }
  }

  /**
   * Creates and initializes a Document instance
   *
   * Downloads remote files and prepares the document for processing.
   *
   * @param url - Document URL or file path
   * @param options - Document configuration options
   * @returns Promise resolving to the initialized Document
   */
  static async create(
    url: string,
    options: FetchDocumentOptions = {},
  ): Promise<Document> {
    const document = new Document(url, options);
    await document.initialize();
    return document;
  }

  /**
   * Initializes the document, downloading it if it's remote
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    if (this.isRemote) {
      if (!this.url) {
        throw new Error('Cannot initialize remote document: URL is required');
      }
      await downloadFileWithCache(this.url.toString(), this._localPath);
    }
  }

  /**
   * Checks if the document is a text-based file that can be read directly
   *
   * @returns Boolean indicating if the file is text-based
   */
  public isTextFile(): boolean {
    if (!this.type) return false;

    return (
      this.type.startsWith('text/') ||
      this.type === 'application/json' ||
      this.type === 'application/xml' ||
      this.type === 'application/javascript' ||
      this.type === 'application/typescript' ||
      [
        '.txt',
        '.md',
        '.json',
        '.xml',
        '.html',
        '.css',
        '.js',
        '.ts',
        '.yaml',
        '.yml',
      ].some((ext) => this.localPath.toLowerCase().endsWith(ext))
    );
  }

  /**
   * Converts the document to the standard Document interface
   *
   * @returns Document object with URL, type, parts, and metadata
   */
  public toDocument(): DocumentType {
    return {
      url: this.url.toString(),
      type: this.type,
      parts: this.parts,
      metadata: this.metadata,
    };
  }
}

export default Document;
