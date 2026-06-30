/**
 * Type definitions for the @happyvertical/documents package
 */

/**
 * Image extracted from a document
 *
 * Represents an image found in a document (PDF, HTML, etc.)
 * with optional OCR text extraction for scanned images.
 */
export interface DocumentImage {
  /**
   * Unique identifier for the image
   */
  id: string;

  /**
   * URL or reference to the image
   */
  url: string;

  /**
   * Local filesystem path if image has been downloaded
   */
  localPath?: string;

  /**
   * Alt text from HTML or PDF metadata
   */
  altText?: string;

  /**
   * Text extracted from image via OCR
   * Useful for scanned documents or images with text
   */
  ocrText?: string;

  /**
   * Position/order of image in the document
   */
  position?: number;

  /**
   * Image metadata (dimensions, format, etc.)
   */
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
    [key: string]: any;
  };
}

/**
 * A part or section of a document
 *
 * Documents can be hierarchical with nested parts (e.g., sections, chapters).
 * Each part contains content, optional images, and can have child parts.
 */
export interface DocumentPart {
  /**
   * Unique identifier for this part
   */
  id: string;

  /**
   * Title or heading for this part
   */
  title: string;

  /**
   * Text content of this part
   */
  content: string;

  /**
   * Content type for this part
   */
  type: 'text' | 'html' | 'markdown';

  /**
   * Images contained in this part
   */
  images?: DocumentImage[];

  /**
   * Additional metadata for this part
   */
  metadata?: Record<string, any>;

  /**
   * Nested child parts (for hierarchical documents)
   */
  parts?: DocumentPart[];
}

/**
 * Complete document with all parts and metadata
 */
export interface Document {
  /**
   * Source URL of the document
   */
  url: string;

  /**
   * MIME type or document type
   */
  type: string;

  /**
   * Document parts (can be hierarchical)
   */
  parts: DocumentPart[];

  /**
   * Document-level metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Options for fetching a document
 */
export interface FetchDocumentOptions {
  /**
   * Directory for caching downloaded files
   * @default os.tmpdir()/.cache/have-sdk/documents
   */
  cacheDir?: string;

  /**
   * Whether to extract images from the document
   * @default true
   */
  extractImages?: boolean;

  /**
   * Whether to run OCR on images (PDF scans, etc.)
   * @default true for PDFs, false for HTML/Markdown
   */
  runOcr?: boolean;

  /**
   * Scraper type to use for content extraction
   * - 'basic': Fast, static HTML scraping (default)
   * - 'tree': Browser-backed expansion of trees and accordions
   * - 'crawlee': Deprecated alias for spider: 'crawlee' with basic scraping
   * @default 'basic'
   */
  scraper?: 'basic' | 'tree' | 'crawlee';

  /**
   * Spider adapter to use for fetching web pages
   * - 'simple': Basic HTTP fetch
   * - 'dom': HTML parsing with happy-dom
   * - 'crawlee': Headless browser through Crawlee
   * - 'crawl4ai': Remote crawl4ai server
   * @default 'dom'
   */
  spider?: 'simple' | 'dom' | 'crawlee' | 'crawl4ai';

  /**
   * Spider adapter to use for HTML fetching (deprecated, use 'spider' instead)
   * @default 'simple'
   * @deprecated Use 'spider' instead
   */
  spiderAdapter?: 'simple' | 'dom' | 'crawlee' | 'crawl4ai';

  /**
   * Whether to use cache for spider fetching
   * @default true
   */
  cache?: boolean;

  /**
   * Cache expiry time in milliseconds for spider fetching
   * @default 300000 (5 minutes)
   */
  cacheExpiry?: number;

  /**
   * Custom HTTP headers for spider requests
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds for spider fetching
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Maximum time to spend scraping in milliseconds
   * Used by advanced scrapers (tree, pagination, etc.)
   */
  maxDuration?: number;

  /**
   * Maximum number of interactions to perform
   * Used by advanced scrapers (clicking, scrolling, etc.)
   */
  maxInteractions?: number;

  /**
   * Override MIME type detection
   */
  type?: string;
}

/**
 * Interface for document processors
 *
 * Each processor handles a specific document format (PDF, HTML, Markdown, etc.)
 */
export interface DocumentProcessor {
  /**
   * Process a document and return structured parts
   *
   * @param url - Source URL or file path
   * @param options - Processing options
   * @returns Promise resolving to Document with parts
   */
  process(url: string, options?: FetchDocumentOptions): Promise<Document>;

  /**
   * Check if this processor can handle the given type
   *
   * @param type - MIME type or file extension
   * @returns True if processor supports this type
   */
  supports(type: string): boolean;
}
