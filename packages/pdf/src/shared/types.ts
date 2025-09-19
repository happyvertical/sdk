/**
 * @have/pdf - Shared type definitions for PDF processing
 */

// Import OCR types from the dedicated OCR package
import type { 
  OCROptions, 
  OCRResult, 
  OCRImage as BaseOCRImage,
  DependencyCheckResult
} from '@have/ocr';

/**
 * Configuration options for extracting text content from PDF documents
 *
 * @example
 * ```typescript
 * // Extract text from specific pages
 * const options: ExtractTextOptions = {
 *   pages: [1, 2, 3],
 *   mergePages: true,
 *   preserveFormatting: true
 * };
 *
 * const text = await reader.extractText('/path/to/doc.pdf', options);
 * ```
 */
export interface ExtractTextOptions {
  /** Specific pages to extract (1-based indexing). If not provided, extracts all pages */
  pages?: number[];
  /** Whether to merge all pages into a single string */
  mergePages?: boolean;
  /** Whether to preserve original formatting */
  preserveFormatting?: boolean;
  /** Whether to include metadata in the extraction */
  includeMetadata?: boolean;
  /** Whether to skip OCR fallback when direct text extraction fails */
  skipOCRFallback?: boolean;
}

// Re-export OCR options from the OCR package for backward compatibility
export type { OCROptions } from '@have/ocr';

/**
 * Comprehensive metadata information extracted from PDF documents
 *
 * Contains both standard PDF metadata fields (title, author, etc.) and
 * technical document properties (page count, version, encryption status).
 *
 * @example
 * ```typescript
 * const metadata = await reader.extractMetadata('/path/to/doc.pdf');
 * console.log(`Title: ${metadata.title}`);
 * console.log(`Pages: ${metadata.pageCount}`);
 * console.log(`Encrypted: ${metadata.encrypted}`);
 * ```
 */
export interface PDFMetadata {
  /** Document title */
  title?: string;
  /** Document author */
  author?: string;
  /** Document subject */
  subject?: string;
  /** Document keywords */
  keywords?: string;
  /** Creation date */
  creationDate?: Date;
  /** Modification date */
  modificationDate?: Date;
  /** PDF version */
  version?: string;
  /** Number of pages */
  pageCount: number;
  /** Document creator application */
  creator?: string;
  /** Document producer */
  producer?: string;
  /** Whether the document is encrypted */
  encrypted?: boolean;
}

/**
 * PDF image data that can be used for OCR processing
 */
export interface PDFImage extends BaseOCRImage {
  /** Page number where the image was found (1-based) */
  pageNumber?: number;
}

// Re-export OCR result type from the OCR package for backward compatibility
export type { OCRResult } from '@have/ocr';

/**
 * Describes the processing capabilities and limitations of a PDF provider
 *
 * Different providers (unpdf, PDF.js) have varying capabilities based on their
 * target environment and underlying implementation. Use this interface to
 * determine what operations are supported before attempting them.
 *
 * @example
 * ```typescript
 * const capabilities = await reader.checkCapabilities();
 *
 * if (capabilities.canPerformOCR) {
 *   console.log(`OCR supported with languages: ${capabilities.ocrLanguages}`);
 * }
 *
 * if (capabilities.maxFileSize) {
 *   console.log(`Max file size: ${capabilities.maxFileSize / 1024 / 1024} MB`);
 * }
 * ```
 */
export interface PDFCapabilities {
  /** Whether the provider can extract text */
  canExtractText: boolean;
  /** Whether the provider can extract metadata */
  canExtractMetadata: boolean;
  /** Whether the provider can extract images */
  canExtractImages: boolean;
  /** Whether the provider supports OCR */
  canPerformOCR: boolean;
  /** Supported input formats */
  supportedFormats: string[];
  /** Maximum file size supported (in bytes) */
  maxFileSize?: number;
  /** Available OCR languages */
  ocrLanguages?: string[];
}

/**
 * Configuration options for creating and customizing a PDF reader instance
 *
 * Controls provider selection, OCR behavior, and processing limits. The 'auto'
 * provider setting automatically selects the best available provider for the
 * current environment (unpdf for Node.js, PDF.js for browsers).
 *
 * @example
 * ```typescript
 * // Auto-detect best provider with OCR enabled
 * const reader = await getPDFReader({
 *   provider: 'auto',
 *   enableOCR: true,
 *   timeout: 30000,
 *   maxFileSize: 50 * 1024 * 1024 // 50MB
 * });
 *
 * // Force specific provider
 * const unpdfReader = await getPDFReader({ provider: 'unpdf' });
 * ```
 */
export interface PDFReaderOptions {
  /** Preferred provider type */
  provider?: 'unpdf' | 'pdfjs' | 'auto';
  /** Whether to enable OCR fallback for image-based PDFs */
  enableOCR?: boolean;
  /** Default OCR options */
  defaultOCROptions?: OCROptions;
  /** Maximum file size to process (in bytes) */
  maxFileSize?: number;
  /** Timeout for processing operations (in milliseconds) */
  timeout?: number;
}

// Re-export DependencyCheckResult for backward compatibility within PDF package
export type { DependencyCheckResult } from '@have/ocr';

// Re-export OCR provider interfaces from the OCR package for backward compatibility
export type { OCRProvider } from '@have/ocr';
export type { OCRFactoryOptions } from '@have/ocr';

/**
 * Main PDF reader interface providing comprehensive PDF processing capabilities
 *
 * This interface defines the standard contract that all PDF providers must implement,
 * ensuring consistent behavior across different environments and underlying libraries.
 * Providers may throw PDFUnsupportedError for operations they cannot perform.
 *
 * @example
 * ```typescript
 * // Create reader and process document
 * const reader = await getPDFReader();
 *
 * // Get quick document analysis
 * const info = await reader.getInfo('/path/to/doc.pdf');
 * console.log(`Strategy: ${info.recommendedStrategy}`);
 *
 * // Extract text with fallback handling
 * try {
 *   const text = await reader.extractText('/path/to/doc.pdf');
 *   if (!text && info.hasImages) {
 *     // No text found, try OCR
 *     const images = await reader.extractImages('/path/to/doc.pdf');
 *     const ocrResult = await reader.performOCR(images);
 *     console.log('OCR text:', ocrResult.text);
 *   }
 * } catch (error) {
 *   if (error instanceof PDFUnsupportedError) {
 *     console.warn('Operation not supported:', error.message);
 *   } else {
 *     console.error('Processing failed:', error);
 *   }
 * }
 * ```
 */
export interface PDFReader {
  /**
   * Extract text content from a PDF document with intelligent fallback strategies
   *
   * Attempts direct text extraction first, then falls back to OCR for image-based
   * content if enabled. Returns null if no text can be extracted through any method.
   *
   * @param source - PDF source: file path (Node.js only), Buffer, or Uint8Array
   * @param options - Text extraction configuration options
   * @returns Promise resolving to extracted text string or null if extraction fails
   *
   * @throws {PDFError} When PDF data is invalid or corrupted
   * @throws {PDFDependencyError} When required dependencies are missing
   *
   * @example
   * ```typescript
   * // Basic text extraction
   * const text = await reader.extractText('/path/to/doc.pdf');
   *
   * // Extract specific pages without OCR fallback
   * const text = await reader.extractText('/path/to/doc.pdf', {
   *   pages: [1, 2, 3],
   *   skipOCRFallback: true,
   *   mergePages: true
   * });
   *
   * // Handle extraction failures
   * const text = await reader.extractText(buffer);
   * if (!text) {
   *   console.log('No text found - may be image-based PDF');
   * }
   * ```
   */
  extractText(
    source: string | ArrayBuffer | Uint8Array,
    options?: ExtractTextOptions
  ): Promise<string | null>;

  /**
   * Extract comprehensive metadata and document properties from a PDF
   *
   * Retrieves both standard PDF metadata (title, author, subject) and technical
   * properties (page count, version, encryption status). Always returns a metadata
   * object, with default values if extraction fails.
   *
   * @param source - PDF source: file path (Node.js only), ArrayBuffer, or Uint8Array
   * @returns Promise resolving to comprehensive PDF metadata object
   *
   * @throws {PDFError} When PDF data is invalid or corrupted
   * @throws {PDFDependencyError} When required dependencies are missing
   *
   * @example
   * ```typescript
   * const metadata = await reader.extractMetadata('/path/to/doc.pdf');
   *
   * console.log(`Title: ${metadata.title || 'Unknown'}`);
   * console.log(`Author: ${metadata.author || 'Unknown'}`);
   * console.log(`Pages: ${metadata.pageCount}`);
   * console.log(`Created: ${metadata.creationDate?.toLocaleDateString()}`);
   * console.log(`Encrypted: ${metadata.encrypted ? 'Yes' : 'No'}`);
   * ```
   */
  extractMetadata(source: string | ArrayBuffer | Uint8Array): Promise<PDFMetadata>;

  /**
   * Extract all images from a PDF document for further processing or OCR
   *
   * Retrieves image data in a format suitable for OCR processing or display.
   * Images include page number information for context. Returns empty array
   * if no images are found or extraction fails.
   *
   * @param source - PDF source: file path (Node.js only), ArrayBuffer, or Uint8Array
   * @returns Promise resolving to array of extracted PDFImage objects with raw data
   *
   * @throws {PDFUnsupportedError} When provider doesn't support image extraction
   * @throws {PDFError} When PDF data is invalid or corrupted
   * @throws {PDFDependencyError} When required dependencies are missing
   *
   * @example
   * ```typescript
   * const images = await reader.extractImages('/path/to/scan.pdf');
   *
   * if (images.length > 0) {
   *   console.log(`Found ${images.length} images`);
   *   for (const image of images) {
   *     console.log(`Page ${image.pageNumber}: ${image.width}x${image.height}`);
   *   }
   *
   *   // Process with OCR
   *   const ocrResult = await reader.performOCR(images);
   *   console.log('Extracted text:', ocrResult.text);
   * } else {
   *   console.log('No images found in PDF');
   * }
   * ```
   */
  extractImages(source: string | ArrayBuffer | Uint8Array): Promise<PDFImage[]>;

  /**
   * Perform Optical Character Recognition (OCR) on extracted image data
   *
   * Processes image data to extract text content using advanced OCR engines.
   * Supports multiple languages, confidence filtering, and various output formats.
   * Quality and accuracy depend on image resolution and text clarity.
   *
   * @param images - Array of PDFImage objects containing raw image data
   * @param options - OCR configuration options including language and confidence settings
   * @returns Promise resolving to OCR result with extracted text and confidence metrics
   *
   * @throws {PDFUnsupportedError} When provider doesn't support OCR operations
   * @throws {PDFDependencyError} When OCR dependencies are missing
   * @throws {PDFError} When image data is invalid or processing fails
   *
   * @example
   * ```typescript
   * // Basic OCR with English language
   * const images = await reader.extractImages('/path/to/scan.pdf');
   * const result = await reader.performOCR(images);
   * console.log('Text:', result.text);
   * console.log('Confidence:', result.confidence);
   *
   * // Advanced OCR with multiple languages and filtering
   * const result = await reader.performOCR(images, {
   *   language: 'eng+chi_sim+deu',
   *   confidenceThreshold: 70,
   *   outputFormat: 'text',
   *   improveResolution: true
   * });
   *
   * if (result.confidence < 60) {
   *   console.warn('Low confidence OCR result');
   * }
   * ```
   */
  performOCR(images: PDFImage[], options?: OCROptions): Promise<OCRResult>;

  /**
   * Check the processing capabilities and limitations of this PDF reader
   *
   * Returns detailed information about what operations are supported by the current
   * provider, including OCR availability, supported formats, and size limits.
   * Use this to determine what operations are possible before attempting them.
   *
   * @returns Promise resolving to comprehensive capability information
   *
   * @example
   * ```typescript
   * const capabilities = await reader.checkCapabilities();
   *
   * console.log('Text extraction:', capabilities.canExtractText ? '✅' : '❌');
   * console.log('Image extraction:', capabilities.canExtractImages ? '✅' : '❌');
   * console.log('OCR support:', capabilities.canPerformOCR ? '✅' : '❌');
   *
   * if (capabilities.canPerformOCR) {
   *   console.log('OCR languages:', capabilities.ocrLanguages?.join(', '));
   * }
   *
   * if (capabilities.maxFileSize) {
   *   const maxMB = capabilities.maxFileSize / 1024 / 1024;
   *   console.log(`Maximum file size: ${maxMB.toFixed(1)} MB`);
   * }
   * ```
   */
  checkCapabilities(): Promise<PDFCapabilities>;

  /**
   * Verify that all required dependencies and libraries are properly installed
   *
   * Performs comprehensive dependency checking to ensure the reader can function
   * correctly. Returns detailed information about what's available and what's missing,
   * allowing for graceful degradation or user guidance.
   *
   * @returns Promise resolving to detailed dependency status information
   *
   * @example
   * ```typescript
   * const deps = await reader.checkDependencies();
   *
   * if (deps.available) {
   *   console.log('✅ All dependencies available');
   *   console.log('Details:', deps.details);
   * } else {
   *   console.error('❌ Missing dependencies:', deps.error);
   *   console.log('Available:', deps.details);
   *
   *   // Handle graceful degradation
   *   if (deps.details.unpdf) {
   *     console.log('Text extraction available, OCR not available');
   *   }
   * }
   * ```
   */
  checkDependencies(): Promise<DependencyCheckResult>;

  /**
   * Analyze PDF document structure and recommend optimal processing strategy
   *
   * Performs lightweight analysis to determine document characteristics and suggest
   * the most efficient processing approach. This is much faster than full extraction
   * and helps optimize processing workflows for large document collections.
   *
   * @param source - PDF source: file path (Node.js only), ArrayBuffer, or Uint8Array
   * @returns Promise resolving to comprehensive document analysis and recommendations
   *
   * @throws {PDFError} When PDF data is invalid or corrupted
   * @throws {PDFDependencyError} When required dependencies are missing
   *
   * @example
   * ```typescript
   * // Analyze document before processing
   * const info = await reader.getInfo('/path/to/doc.pdf');
   *
   * console.log(`Document: ${info.pageCount} pages`);
   * console.log(`Strategy: ${info.recommendedStrategy}`);
   * console.log(`Text available: ${info.hasEmbeddedText}`);
   * console.log(`Images present: ${info.hasImages}`);
   *
   * // Optimize processing based on analysis
   * if (info.recommendedStrategy === 'text') {
   *   // Fast text extraction without OCR
   *   const text = await reader.extractText(source, { skipOCRFallback: true });
   * } else if (info.recommendedStrategy === 'ocr') {
   *   // OCR required - prepare for longer processing
   *   console.log(`Expected time: ${info.estimatedProcessingTime?.ocrProcessing}`);
   *   const text = await reader.extractText(source);
   * }
   * ```
   */
  getInfo(source: string | ArrayBuffer | Uint8Array): Promise<PDFInfo>;
}

/**
 * Input source type for PDF operations
 */
export type PDFSource = string | ArrayBuffer | Uint8Array;

/**
 * Error types specific to PDF processing
 */
export class PDFError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'PDFError';
  }
}

export class PDFUnsupportedError extends PDFError {
  constructor(operation: string) {
    super(`Operation '${operation}' is not supported by this PDF reader`);
    this.code = 'ENOTSUP';
    this.name = 'PDFUnsupportedError';
  }
}

export class PDFDependencyError extends PDFError {
  constructor(dependency: string, details?: string) {
    super(`PDF dependency '${dependency}' is not available${details ? ': ' + details : ''}`);
    this.code = 'EDEP';
    this.name = 'PDFDependencyError';
  }
}

/**
 * Lightweight PDF document analysis providing processing strategy recommendations
 *
 * This interface provides essential document information and intelligent processing
 * recommendations without performing expensive full-text extraction or OCR. Use this
 * to make informed decisions about how to process a document efficiently.
 *
 * @example
 * ```typescript
 * const info = await reader.getInfo('/path/to/doc.pdf');
 *
 * // Make processing decision based on analysis
 * if (info.recommendedStrategy === 'text') {
 *   console.log('✅ Text-based PDF - fast extraction available');
 *   const text = await reader.extractText('/path/to/doc.pdf', { skipOCRFallback: true });
 * } else if (info.recommendedStrategy === 'ocr') {
 *   console.log('🔍 Image-based PDF - OCR required');
 *   console.log(`Estimated time: ${info.estimatedProcessingTime?.ocrProcessing}`);
 *   const text = await reader.extractText('/path/to/doc.pdf'); // Will use OCR
 * } else {
 *   console.log('🔄 Hybrid PDF - contains both text and images');
 *   const text = await reader.extractText('/path/to/doc.pdf');
 * }
 * ```
 */
export interface PDFInfo {
  /** Number of pages in the document */
  pageCount: number;
  /** File size in bytes (if available) */
  fileSize?: number;
  /** PDF version string */
  version?: string;
  /** Whether the document is encrypted/password protected */
  encrypted: boolean;
  
  /** Whether the PDF contains extractable text content (can use fast text extraction) */
  hasEmbeddedText: boolean;
  /** Whether the PDF contains images (may benefit from OCR processing) */
  hasImages: boolean;
  /** Rough estimate of text content length (without full extraction) */
  estimatedTextLength?: number;
  
  /** Recommended processing strategy: 'text' for direct extraction, 'ocr' for image-based, 'hybrid' for mixed content */
  recommendedStrategy: 'text' | 'ocr' | 'hybrid';
  /** True if OCR processing will definitely be required to extract meaningful text content */
  ocrRequired: boolean;
  
  /** Performance estimates to help plan processing workflows and user experience */
  estimatedProcessingTime?: {
    /** Expected time category for direct text extraction (fast: <1s, medium: 1-5s, slow: >5s) */
    textExtraction: 'fast' | 'medium' | 'slow';
    /** Expected time category for OCR processing if needed (fast: <10s, medium: 10-60s, slow: >60s) */
    ocrProcessing?: 'fast' | 'medium' | 'slow';
  };
  
  /** Basic metadata (lightweight extraction) */
  title?: string;
  /** Document author */
  author?: string;
  /** Document creation date */
  creationDate?: Date;
  /** Document creator application */
  creator?: string;
  /** Document producer */
  producer?: string;
}