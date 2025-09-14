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
 * Options for text extraction from PDF
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
 * PDF metadata information
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
 * PDF processing capabilities of a provider
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
 * Options for creating a PDF reader
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
 * Main PDF reader interface that all providers must implement
 */
export interface PDFReader {
  /**
   * Extract text content from a PDF
   * @param source - PDF file path, Buffer, or Uint8Array
   * @param options - Text extraction options
   * @returns Promise resolving to extracted text or null if extraction fails
   */
  extractText(
    source: string | ArrayBuffer | Uint8Array,
    options?: ExtractTextOptions
  ): Promise<string | null>;

  /**
   * Extract metadata from a PDF
   * @param source - PDF file path, ArrayBuffer, or Uint8Array
   * @returns Promise resolving to PDF metadata
   */
  extractMetadata(source: string | ArrayBuffer | Uint8Array): Promise<PDFMetadata>;

  /**
   * Extract images from a PDF
   * @param source - PDF file path, ArrayBuffer, or Uint8Array
   * @returns Promise resolving to array of extracted images
   */
  extractImages(source: string | ArrayBuffer | Uint8Array): Promise<PDFImage[]>;

  /**
   * Perform OCR on image data
   * @param images - Array of image data to process
   * @param options - OCR processing options
   * @returns Promise resolving to OCR result
   */
  performOCR(images: PDFImage[], options?: OCROptions): Promise<OCRResult>;

  /**
   * Check the capabilities of this PDF reader
   * @returns Promise resolving to capability information
   */
  checkCapabilities(): Promise<PDFCapabilities>;

  /**
   * Check if dependencies for this reader are available
   * @returns Promise resolving to dependency check result
   */
  checkDependencies(): Promise<DependencyCheckResult>;

  /**
   * Get quick information about a PDF without expensive processing
   * @param source - PDF file path, ArrayBuffer, or Uint8Array
   * @returns Promise resolving to PDF document information
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
 * Quick PDF document information without expensive processing
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
  
  /** Whether the PDF contains extractable text content */
  hasEmbeddedText: boolean;
  /** Whether the PDF contains images */
  hasImages: boolean;
  /** Rough estimate of text content length (without full extraction) */
  estimatedTextLength?: number;
  
  /** Recommended processing strategy based on document analysis */
  recommendedStrategy: 'text' | 'ocr' | 'hybrid';
  /** True if OCR will definitely be required for text extraction */
  ocrRequired: boolean;
  
  /** Performance estimates for different operations */
  estimatedProcessingTime?: {
    /** Expected time category for text extraction */
    textExtraction: 'fast' | 'medium' | 'slow';
    /** Expected time category for OCR processing (if needed) */
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