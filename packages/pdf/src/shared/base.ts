/**
 * @have/pdf - Base PDF reader provider with ENOTSUP error handling
 */

import type {
  DependencyCheckResult,
  ExtractTextOptions,
  OCROptions,
  OCRResult,
  PDFCapabilities,
  PDFImage,
  PDFInfo,
  PDFMetadata,
  PDFReader,
  PDFSource,
} from './types.js';
import { PDFUnsupportedError } from './types.js';

/**
 * Abstract base class providing default implementations for PDF processing operations
 *
 * All PDF providers extend this base class and override methods they support.
 * Unsupported operations throw PDFUnsupportedError by default, allowing providers
 * to implement only their specific capabilities while maintaining interface compliance.
 *
 * This follows the same pattern as BaseFilesystemProvider in the files package,
 * ensuring consistent error handling across the HAVE SDK.
 *
 * @example
 * ```typescript
 * // Custom provider implementation
 * class MyPDFProvider extends BasePDFReader {
 *   protected name = 'my-provider';
 *
 *   // Override only supported operations
 *   async extractText(source: PDFSource): Promise<string | null> {
 *     // Implementation here
 *     return 'extracted text';
 *   }
 *
 *   // Other methods will throw PDFUnsupportedError automatically
 * }
 * ```
 */
export abstract class BasePDFReader implements PDFReader {
  /** Provider name for error messages and identification */
  protected abstract name: string;

  /**
   * Extract text content from a PDF document
   *
   * Default implementation throws PDFUnsupportedError. Concrete providers
   * should override this method to provide actual text extraction functionality.
   *
   * @param source - PDF source data (file path, ArrayBuffer, or Uint8Array)
   * @param options - Optional text extraction configuration
   * @returns Promise resolving to extracted text or null if no text found
   * @throws {PDFUnsupportedError} When provider doesn't support text extraction
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions,
  ): Promise<string | null> {
    throw new PDFUnsupportedError(`extractText (provider: ${this.name})`);
  }

  /**
   * Extract metadata and document properties from a PDF
   *
   * Default implementation throws PDFUnsupportedError. Concrete providers
   * should override this method to provide metadata extraction functionality.
   *
   * @param source - PDF source data (file path, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to PDF metadata object
   * @throws {PDFUnsupportedError} When provider doesn't support metadata extraction
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    throw new PDFUnsupportedError(`extractMetadata (provider: ${this.name})`);
  }

  /**
   * Extract images from a PDF document for OCR or display
   *
   * Default implementation throws PDFUnsupportedError. Concrete providers
   * should override this method to provide image extraction functionality.
   *
   * @param source - PDF source data (file path, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to array of extracted image objects
   * @throws {PDFUnsupportedError} When provider doesn't support image extraction
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    throw new PDFUnsupportedError(`extractImages (provider: ${this.name})`);
  }

  /**
   * Perform Optical Character Recognition on image data
   *
   * Default implementation throws PDFUnsupportedError. Concrete providers
   * should override this method to provide OCR functionality.
   *
   * @param images - Array of image objects to process with OCR
   * @param options - Optional OCR configuration settings
   * @returns Promise resolving to OCR result with extracted text
   * @throws {PDFUnsupportedError} When provider doesn't support OCR operations
   */
  async performOCR(
    images: PDFImage[],
    options?: OCROptions,
  ): Promise<OCRResult> {
    throw new PDFUnsupportedError(`performOCR (provider: ${this.name})`);
  }

  /**
   * Check what operations this PDF reader can perform
   *
   * Default implementation returns all capabilities as false. Concrete providers
   * should override this method to accurately report their capabilities.
   *
   * @returns Promise resolving to capability information object
   */
  async checkCapabilities(): Promise<PDFCapabilities> {
    return {
      canExtractText: false,
      canExtractMetadata: false,
      canExtractImages: false,
      canPerformOCR: false,
      supportedFormats: [],
      maxFileSize: undefined,
      ocrLanguages: undefined,
    };
  }

  /**
   * Verify that required dependencies and libraries are installed
   *
   * Default implementation returns not available. Concrete providers should
   * override this method to check their specific dependency requirements.
   *
   * @returns Promise resolving to dependency status information
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    return {
      available: false,
      error: `Dependencies for ${this.name} provider are not available`,
      details: {},
    };
  }

  /**
   * Analyze PDF document structure and provide processing recommendations
   *
   * Default implementation throws PDFUnsupportedError. Concrete providers
   * should override this method to provide document analysis functionality.
   *
   * @param source - PDF source data (file path, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to document analysis and strategy recommendations
   * @throws {PDFUnsupportedError} When provider doesn't support document analysis
   */
  async getInfo(source: PDFSource): Promise<PDFInfo> {
    throw new PDFUnsupportedError(`getInfo (provider: ${this.name})`);
  }

  /**
   * Convert various PDF source formats to a standardized Uint8Array format
   *
   * Handles cross-platform normalization of PDF input sources. File path reading
   * is implemented by Node.js-specific providers that override this method.
   *
   * @param source - PDF source in various formats (file path, ArrayBuffer, Uint8Array)
   * @returns Promise resolving to Uint8Array containing normalized PDF data
   * @throws {PDFUnsupportedError} When file reading is not supported (base implementation)
   * @throws {Error} When source format is invalid or unsupported
   */
  protected async normalizeSource(source: PDFSource): Promise<Uint8Array> {
    if (typeof source === 'string') {
      // File path - attempt to read file
      // This will be overridden in Node.js providers to use fs
      throw new PDFUnsupportedError(`file reading (provider: ${this.name})`);
    } else if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    } else if (source instanceof Uint8Array) {
      return source;
    } else {
      throw new Error(
        'Invalid PDF source: must be file path, ArrayBuffer, or Uint8Array',
      );
    }
  }

  /**
   * Validate that binary data appears to be a valid PDF document
   *
   * Performs basic validation by checking for PDF magic bytes (%PDF-) at the
   * beginning of the data. This is a quick sanity check before processing.
   *
   * @param data - Binary data to validate as PDF content
   * @returns True if data appears to be valid PDF, false otherwise
   */
  protected validatePDFData(data: Uint8Array): boolean {
    // Check for PDF magic bytes (%PDF-)
    if (data.length < 5) {
      return false;
    }

    const header = new TextDecoder().decode(data.subarray(0, 5));
    return header === '%PDF-';
  }

  /**
   * Validate that a page number is within valid range for the document
   *
   * Checks that page numbers are positive integers within the document's page range.
   * Uses 1-based indexing following PDF conventions.
   *
   * @param pageNumber - Page number to validate (1-based indexing)
   * @param totalPages - Total number of pages in the document
   * @returns True if page number is valid, false otherwise
   */
  protected isValidPageNumber(pageNumber: number, totalPages: number): boolean {
    return (
      pageNumber >= 1 &&
      pageNumber <= totalPages &&
      Number.isInteger(pageNumber)
    );
  }

  /**
   * Convert page specifications to a normalized array of valid page numbers
   *
   * Handles both explicit page arrays and 'all pages' scenarios. Filters out
   * invalid page numbers and returns only pages that exist in the document.
   *
   * @param pages - Specific page numbers to include, or undefined for all pages
   * @param totalPages - Total number of pages available in the document
   * @returns Array of valid page numbers (1-based) ready for processing
   */
  protected normalizePages(
    pages: number[] | undefined,
    totalPages: number,
  ): number[] {
    if (!pages) {
      // Return all pages
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Filter and validate page numbers
    return pages.filter((page) => this.isValidPageNumber(page, totalPages));
  }

  /**
   * Combine text content from multiple pages using specified merge strategy
   *
   * Provides two merge strategies: space-separated for continuous reading,
   * or double-newline separated to preserve page boundaries.
   *
   * @param pageTexts - Array of text strings extracted from individual pages
   * @param mergePages - True for space-separated merge, false for page-separated
   * @returns Combined text string using the specified merge strategy
   */
  protected mergePageTexts(pageTexts: string[], mergePages?: boolean): string {
    if (mergePages) {
      return pageTexts.join(' ');
    } else {
      return pageTexts.join('\n\n');
    }
  }

  /**
   * Create a fallback metadata object when extraction fails or is unsupported
   *
   * Provides a safe default metadata structure with minimal information,
   * ensuring applications can handle extraction failures gracefully.
   *
   * @param pageCount - Number of pages in the document (if known)
   * @returns Basic PDFMetadata object with default values
   */
  protected createDefaultMetadata(pageCount: number = 0): PDFMetadata {
    return {
      pageCount,
      title: undefined,
      author: undefined,
      subject: undefined,
      keywords: undefined,
      creationDate: undefined,
      modificationDate: undefined,
      version: undefined,
      creator: undefined,
      producer: undefined,
      encrypted: false,
    };
  }
}
