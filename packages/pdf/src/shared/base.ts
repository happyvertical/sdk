/**
 * @have/pdf - Base PDF reader provider with ENOTSUP error handling
 */

import type {
  PDFReader,
  PDFSource,
  ExtractTextOptions,
  OCROptions,
  PDFMetadata,
  PDFImage,
  OCRResult,
  PDFCapabilities,
  DependencyCheckResult,
  PDFInfo,
} from './types.js';
import { PDFUnsupportedError } from './types.js';

/**
 * Base PDF reader class that provides ENOTSUP (not supported) implementations
 * for all methods. Concrete providers should extend this class and override
 * the methods they support.
 * 
 * This follows the same pattern as BaseFilesystemProvider in the files package.
 */
export abstract class BasePDFReader implements PDFReader {
  protected abstract name: string;

  /**
   * Extract text content from a PDF
   * Default implementation throws ENOTSUP error
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions
  ): Promise<string | null> {
    throw new PDFUnsupportedError(`extractText (provider: ${this.name})`);
  }

  /**
   * Extract metadata from a PDF
   * Default implementation throws ENOTSUP error
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    throw new PDFUnsupportedError(`extractMetadata (provider: ${this.name})`);
  }

  /**
   * Extract images from a PDF
   * Default implementation throws ENOTSUP error
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    throw new PDFUnsupportedError(`extractImages (provider: ${this.name})`);
  }

  /**
   * Perform OCR on image data
   * Default implementation throws ENOTSUP error
   */
  async performOCR(images: PDFImage[], options?: OCROptions): Promise<OCRResult> {
    throw new PDFUnsupportedError(`performOCR (provider: ${this.name})`);
  }

  /**
   * Check the capabilities of this PDF reader
   * Default implementation returns all capabilities as false
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
   * Check if dependencies for this reader are available
   * Default implementation returns not available
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    return {
      available: false,
      error: `Dependencies for ${this.name} provider are not available`,
      details: {},
    };
  }

  /**
   * Get quick information about a PDF document
   * Default implementation throws ENOTSUP error
   */
  async getInfo(source: PDFSource): Promise<PDFInfo> {
    throw new PDFUnsupportedError(`getInfo (provider: ${this.name})`);
  }

  /**
   * Utility method to normalize PDF source to Uint8Array (cross-platform)
   * @param source - PDF source (file path, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to Uint8Array containing PDF data
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
      throw new Error('Invalid PDF source: must be file path, ArrayBuffer, or Uint8Array');
    }
  }

  /**
   * Utility method to validate PDF data
   * @param data - Uint8Array containing potential PDF data
   * @returns Boolean indicating if the data appears to be valid PDF data
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
   * Utility method to check if a page number is valid
   * @param pageNumber - Page number to validate (1-based)
   * @param totalPages - Total number of pages in the document
   * @returns Boolean indicating if the page number is valid
   */
  protected isValidPageNumber(pageNumber: number, totalPages: number): boolean {
    return pageNumber >= 1 && pageNumber <= totalPages && Number.isInteger(pageNumber);
  }

  /**
   * Utility method to normalize page ranges
   * @param pages - Array of page numbers or undefined for all pages
   * @param totalPages - Total number of pages in the document
   * @returns Array of valid page numbers
   */
  protected normalizePages(pages: number[] | undefined, totalPages: number): number[] {
    if (!pages) {
      // Return all pages
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    // Filter and validate page numbers
    return pages.filter(page => this.isValidPageNumber(page, totalPages));
  }

  /**
   * Utility method to merge text from multiple pages
   * @param pageTexts - Array of text strings from different pages
   * @param mergePages - Whether to merge pages into a single string
   * @returns String containing merged or joined text
   */
  protected mergePageTexts(pageTexts: string[], mergePages?: boolean): string {
    if (mergePages) {
      return pageTexts.join(' ');
    } else {
      return pageTexts.join('\n\n');
    }
  }

  /**
   * Utility method to create default metadata for cases where extraction fails
   * @param pageCount - Number of pages in the document
   * @returns Basic PDFMetadata object
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