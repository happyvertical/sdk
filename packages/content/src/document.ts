import type { FilesystemAdapter } from '@have/files';
import {
  downloadFileWithCache,
  getCached,
  getMimeType,
  setCached,
} from '@have/files';
import { getPDFReader } from '@have/pdf';
import { makeSlug } from '@have/utils';
import os from 'os';
import path from 'path';
import { URL } from 'url';

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
      await downloadFileWithCache(this.url.toString(), this.localPath);
    }
  }

  /**
   * Checks if the document is a text-based file that can be read directly
   *
   * @returns Boolean indicating if the file is text-based
   */
  private isTextFile(): boolean {
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
   * Extracts text content from the document
   *
   * Currently supports PDF documents and text-based files.
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
      case 'application/pdf': {
        const reader = await getPDFReader();
        extracted = await reader.extractText(this.localPath);
        break;
      }
      case 'text':
      case 'json':
      default:
        // Handle text-based files by reading them directly
        if (this.isTextFile()) {
          try {
            const fs = await import('fs/promises');
            extracted = await fs.readFile(this.localPath, 'utf-8');
          } catch (error) {
            throw new Error(
              `Failed to read text file ${this.localPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        } else {
          throw new Error(
            `Getting text from ${this.type} types not yet implemented.`,
          );
        }
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
