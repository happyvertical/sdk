import { PDFUnsupportedError } from "./index4.js";
class BasePDFReader {
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
  async extractText(_source, _options) {
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
  async extractMetadata(_source) {
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
  async extractImages(_source) {
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
  async performOCR(_images, _options) {
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
  async checkCapabilities() {
    return {
      canExtractText: false,
      canExtractMetadata: false,
      canExtractImages: false,
      canPerformOCR: false,
      supportedFormats: [],
      maxFileSize: void 0,
      ocrLanguages: void 0
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
  async checkDependencies() {
    return {
      available: false,
      error: `Dependencies for ${this.name} provider are not available`,
      details: {}
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
  async getInfo(_source) {
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
  async normalizeSource(source) {
    if (typeof source === "string") {
      throw new PDFUnsupportedError(`file reading (provider: ${this.name})`);
    }
    if (source instanceof ArrayBuffer) {
      return new Uint8Array(source);
    }
    if (source instanceof Uint8Array) {
      return source;
    }
    throw new Error(
      "Invalid PDF source: must be file path, ArrayBuffer, or Uint8Array"
    );
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
  validatePDFData(data) {
    if (data.length < 5) {
      return false;
    }
    const header = new TextDecoder().decode(data.subarray(0, 5));
    return header === "%PDF-";
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
  isValidPageNumber(pageNumber, totalPages) {
    return pageNumber >= 1 && pageNumber <= totalPages && Number.isInteger(pageNumber);
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
  normalizePages(pages, totalPages) {
    if (!pages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
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
  mergePageTexts(pageTexts, mergePages) {
    if (mergePages) {
      return pageTexts.join(" ");
    }
    return pageTexts.join("\n\n");
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
  createDefaultMetadata(pageCount = 0) {
    return {
      pageCount,
      title: void 0,
      author: void 0,
      subject: void 0,
      keywords: void 0,
      creationDate: void 0,
      modificationDate: void 0,
      version: void 0,
      creator: void 0,
      producer: void 0,
      encrypted: false
    };
  }
}
export {
  BasePDFReader
};
//# sourceMappingURL=index3.js.map
