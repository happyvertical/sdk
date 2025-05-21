import os from 'os';
import path from 'path';
import { URL } from 'url';
import { FilesystemAdapter } from '@have/files';
import { downloadFileWithCache } from '@have/files';
import { extractTextFromPDF } from '@have/pdf';
import { getCached, setCached, getMimeType } from '@have/files';
import { makeSlug } from '@have/utils';

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
  url: string;
  
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
export class Document {
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
  protected localPath: string;
  
  /**
   * Directory used for caching files
   */
  protected cacheDir: string;
  
  /**
   * Document URL
   */
  public url: URL;
  
  /**
   * Document MIME type
   */
  public type: string | undefined | null;
  
  /**
   * Creates a new Document instance
   * 
   * @param options - Document configuration options
   */
  constructor(options: DocumentOptions) {
    this.options = options;
    this.url = new URL(options.url);

    this.type = options.type || getMimeType(this.url.toString());
    this.cacheDir =
      options.cacheDir || path.resolve(os.tmpdir(), '.cache', 'have-sdk');

    if (this.url.protocol.startsWith('file')) {
      this.localPath = this.url.pathname;
      this.isRemote = false;
    } else {
      this.localPath = path.join(
        this.cacheDir,
        makeSlug(this.url.hostname),
        this.url.pathname,
      );
      this.isRemote = true;
    }
  }

  /**
   * Creates and initializes a Document instance
   * 
   * @param options - Document configuration options
   * @returns Promise resolving to the initialized Document
   */
  static async create(options: DocumentOptions) {
    const document = new Document(options);
    await document.initialize();
    return document;
  }

  /**
   * Initializes the document, downloading it if it's remote
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize() {
    if (this.isRemote) {
      //todo: should be getCached?
      await downloadFileWithCache(this.url.toString(), this.localPath);
    }
  }

  /**
   * Extracts text content from the document
   * 
   * Currently supports PDF documents with planned support for other types.
   * Uses caching to avoid repeatedly processing the same document.
   * 
   * @returns Promise resolving to the extracted text content
   * @throws Error if the document type is not supported
   */
  async getText() {
    const cached = await getCached(this.localPath + '.extracted_text');
    if (cached) {
      return cached;
    }

    let extracted: string | null = '';
    switch (this.type) {
      case 'application/pdf':
        extracted = await extractTextFromPDF(this.localPath);
        break;
      case 'text':
      case 'json':
      default:
        throw new Error(
          'Getting text from ${this.type} types not yet implemented. I should check to see if its a text file here',
        );
    }
    if (extracted) {
      await setCached(this.localPath + '.extracted_text', extracted);
    }
    return extracted;
  }
}

export default {
  Document,
};
