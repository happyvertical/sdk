/**
 * @have/pdf - PDF.js provider for browser PDF processing
 */

import { BasePDFReader } from '../shared/base.js';
import type {
  PDFSource,
  ExtractTextOptions,
  PDFMetadata,
  PDFImage,
  PDFCapabilities,
  DependencyCheckResult,
} from '../shared/types.js';
import { PDFDependencyError, PDFUnsupportedError } from '../shared/types.js';

/**
 * PDF reader implementation using PDF.js for browser environments
 *
 * This provider handles:
 * - Text extraction from PDF files in the browser
 * - Basic metadata extraction
 * - Limited image extraction capabilities
 */
export class PDFJSProvider extends BasePDFReader {
  protected name = 'pdfjs';
  private pdfjs: any = null;

  constructor() {
    super();
  }

  // The browser base class already provides normalizeSource, so we don't need to override it

  /**
   * Lazy load PDF.js dependencies
   */
  private async loadPDFJS() {
    if (this.pdfjs) {
      return this.pdfjs;
    }

    try {
      // Try to load PDF.js from CDN or local installation
      // This is a placeholder - actual implementation would depend on how PDF.js is loaded
      if (
        typeof globalThis !== 'undefined' &&
        (globalThis as any).window &&
        (globalThis as any).window.pdfjsLib
      ) {
        this.pdfjs = (globalThis as any).window.pdfjsLib;
      } else {
        throw new Error(
          'PDF.js library not found. Please include PDF.js in your project.',
        );
      }

      return this.pdfjs;
    } catch (error) {
      throw new PDFDependencyError('PDF.js', (error as Error).message);
    }
  }

  /**
   * Extract text content from a PDF using PDF.js
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions,
  ): Promise<string | null> {
    try {
      const pdfjs = await this.loadPDFJS();
      const typedArray = await this.normalizeSource(source);

      if (!this.validatePDFData(typedArray)) {
        throw new Error('Invalid PDF data');
      }

      // Load the PDF document
      const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
      const totalPages = pdf.numPages;

      // Normalize pages to extract
      const pagesToExtract = this.normalizePages(options?.pages, totalPages);

      if (pagesToExtract.length === 0) {
        return null;
      }

      // Extract text from specified pages
      const pageTexts: string[] = [];

      for (const pageNum of pagesToExtract) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();

          // Combine text items into a single string
          const pageText = textContent.items
            .map((item: any) => item.str || '')
            .join(' ')
            .trim();

          pageTexts.push(pageText);
        } catch (pageError) {
          console.warn(
            `Failed to extract text from page ${pageNum}:`,
            pageError,
          );
          pageTexts.push(''); // Add empty string to maintain page order
        }
      }

      // Merge page texts according to options
      const mergedText = this.mergePageTexts(pageTexts, options?.mergePages);

      return mergedText || null;
    } catch (error) {
      console.error('PDF.js text extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract metadata from a PDF using PDF.js
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    try {
      const pdfjs = await this.loadPDFJS();
      const typedArray = await this.normalizeSource(source);

      if (!this.validatePDFData(typedArray)) {
        throw new Error('Invalid PDF data');
      }
      const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
      const metadata = await pdf.getMetadata();

      return {
        pageCount: pdf.numPages,
        title: metadata?.info?.Title || undefined,
        author: metadata?.info?.Author || undefined,
        subject: metadata?.info?.Subject || undefined,
        keywords: metadata?.info?.Keywords || undefined,
        creationDate: metadata?.info?.CreationDate
          ? new Date(metadata.info.CreationDate)
          : undefined,
        modificationDate: metadata?.info?.ModDate
          ? new Date(metadata.info.ModDate)
          : undefined,
        version: metadata?.info?.PDFFormatVersion || undefined,
        creator: metadata?.info?.Creator || undefined,
        producer: metadata?.info?.Producer || undefined,
        encrypted: metadata?.info?.Encrypted === 'Yes',
      };
    } catch (error) {
      console.error('PDF.js metadata extraction failed:', error);
      // Return default metadata with at least page count if possible
      try {
        const pdfjs = await this.loadPDFJS();
        const typedArray = await this.normalizeSource(source);
        const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
        return this.createDefaultMetadata(pdf.numPages);
      } catch {
        return this.createDefaultMetadata(0);
      }
    }
  }

  /**
   * Extract images from a PDF using PDF.js
   * Note: PDF.js has limited image extraction capabilities compared to unpdf
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    try {
      const pdfjs = await this.loadPDFJS();
      const typedArray = await this.normalizeSource(source);

      if (!this.validatePDFData(typedArray)) {
        throw new Error('Invalid PDF data');
      }

      const pdf = await pdfjs.getDocument({ data: typedArray }).promise;
      const allImages: PDFImage[] = [];

      // Extract from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const operators = await page.getOperatorList();

          // This is a simplified implementation - PDF.js doesn't have
          // a direct equivalent to unpdf's extractImages function
          // In a real implementation, you'd need to parse the operator list
          // to find image operations and extract the image data

          // PDF.js has limited image extraction capabilities in browsers
          // For browser environments, users should rely on OCR fallback
          throw new PDFUnsupportedError(
            'extractImages (PDF.js browser image extraction has limited capabilities - use OCR fallback)',
          );
        } catch (pageError) {
          console.warn(
            `Failed to extract images from page ${pageNum}:`,
            pageError,
          );
        }
      }

      return allImages;
    } catch (error) {
      console.error('PDF.js image extraction failed:', error);
      return [];
    }
  }

  /**
   * Check the capabilities of the PDF.js provider
   */
  async checkCapabilities(): Promise<PDFCapabilities> {
    const deps = await this.checkDependencies();

    return {
      canExtractText: deps.available,
      canExtractMetadata: deps.available,
      canExtractImages: false, // Limited image extraction in browser
      canPerformOCR: false, // PDF.js doesn't do OCR
      supportedFormats: ['pdf'],
      maxFileSize: undefined, // Depends on browser memory
      ocrLanguages: undefined,
    };
  }

  /**
   * Check if PDF.js dependencies are available
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    try {
      await this.loadPDFJS();
      return {
        available: true,
        details: {
          pdfjs: true,
        },
      };
    } catch (error) {
      return {
        available: false,
        error: `PDF.js dependency not available: ${(error as Error).message}`,
        details: {
          pdfjs: false,
        },
      };
    }
  }

  /**
   * Get quick information about a PDF document
   */
  async getInfo(
    source: PDFSource,
  ): Promise<import('../shared/types.js').PDFInfo> {
    try {
      const metadata = await this.extractMetadata(source);

      return {
        pageCount: metadata.pageCount || 0,
        encrypted: false, // If we can extract metadata, it's likely not encrypted
        hasEmbeddedText: true, // Assume text is extractable - will be verified when extracting
        hasImages: false, // PDF.js has limited image detection in browser
        recommendedStrategy: 'text' as const, // PDF.js focuses on text extraction
        ocrRequired: false, // Try text first
        estimatedTextLength: undefined, // Not available without extraction
        estimatedProcessingTime: {
          textExtraction: 'fast' as const, // PDF.js text extraction is typically fast
          ocrProcessing: undefined, // OCR would be handled by separate provider
        },
        title: metadata.title,
        author: metadata.author,
      };
    } catch (error) {
      console.error('PDF.js getInfo failed:', error);

      // Return minimal info even if metadata extraction fails
      return {
        pageCount: 0,
        encrypted: true, // If metadata extraction fails, it might be encrypted
        hasEmbeddedText: false,
        hasImages: false,
        recommendedStrategy: 'ocr' as const, // Fall back to OCR if we can't read it
        ocrRequired: true,
        estimatedTextLength: undefined,
        estimatedProcessingTime: {
          textExtraction: 'slow' as const, // If we can't read metadata, extraction will be slow
          ocrProcessing: 'medium' as const, // OCR fallback typically takes medium time
        },
        title: undefined,
        author: undefined,
      };
    }
  }
}
