/**
 * @have/pdf - Combined browser PDF reader with PDF.js + Web OCR capabilities
 */

import { getOCR } from '@have/ocr';
import { BasePDFReader } from '../shared/base.js';
import type {
  DependencyCheckResult,
  ExtractTextOptions,
  OCROptions,
  OCRResult,
  PDFCapabilities,
  PDFImage,
  PDFInfo,
  PDFMetadata,
  PDFSource,
} from '../shared/types.js';
import { PDFJSProvider } from './pdfjs.js';

/**
 * Combined PDF reader for browser environments that integrates PDF.js and Web OCR
 *
 * This provider:
 * - Uses PDF.js for text and metadata extraction
 * - Falls back to web OCR when direct text extraction yields no results
 * - Combines capabilities of both underlying providers
 */
export class CombinedBrowserProvider extends BasePDFReader {
  protected name = 'combined-browser';
  private pdfjsProvider: PDFJSProvider;
  private ocrFactory = getOCR({ provider: 'auto' });

  constructor() {
    super();
    this.pdfjsProvider = new PDFJSProvider();
  }

  /**
   * Extract text content from a PDF with web OCR fallback
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions,
  ): Promise<string | null> {
    try {
      // First try direct text extraction using PDF.js
      const text = await this.pdfjsProvider.extractText(source, options);

      // If no text was found, try OCR as a fallback
      if (!text?.trim()) {
        console.log('No direct text found, attempting web OCR fallback...');

        try {
          const images = await this.pdfjsProvider.extractImages(source);
          if (images && images.length > 0) {
            const ocrResult = await this.ocrFactory.performOCR(images);
            return ocrResult.text || null;
          }
        } catch (ocrError) {
          console.warn('Web OCR fallback failed:', ocrError);
        }
      }

      return text;
    } catch (error) {
      console.error(`Combined browser text extraction failed:`, error);
      return null;
    }
  }

  /**
   * Extract metadata from a PDF using PDF.js
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    return this.pdfjsProvider.extractMetadata(source);
  }

  /**
   * Extract images from a PDF using PDF.js
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    return this.pdfjsProvider.extractImages(source);
  }

  /**
   * Perform OCR on image data using web OCR
   */
  async performOCR(
    images: PDFImage[],
    options?: OCROptions,
  ): Promise<OCRResult> {
    return this.ocrFactory.performOCR(images, options);
  }

  /**
   * Check the combined capabilities of both providers
   */
  async checkCapabilities(): Promise<PDFCapabilities> {
    const [pdfjsCaps, ocrAvailable] = await Promise.all([
      this.pdfjsProvider.checkCapabilities(),
      this.ocrFactory.isOCRAvailable(),
    ]);

    // Get OCR languages if OCR is available
    let ocrLanguages: string[] = [];
    if (ocrAvailable) {
      ocrLanguages = await this.ocrFactory.getSupportedLanguages();
    }

    return {
      canExtractText: pdfjsCaps.canExtractText || ocrAvailable, // Can extract text directly or via OCR
      canExtractMetadata: pdfjsCaps.canExtractMetadata,
      canExtractImages: pdfjsCaps.canExtractImages,
      canPerformOCR: ocrAvailable,
      supportedFormats: pdfjsCaps.supportedFormats,
      maxFileSize: pdfjsCaps.maxFileSize,
      ocrLanguages: ocrLanguages.length > 0 ? ocrLanguages : undefined,
    };
  }

  /**
   * Check dependencies for both providers
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    const [pdfjsDeps, ocrAvailable] = await Promise.all([
      this.pdfjsProvider.checkDependencies(),
      this.ocrFactory.isOCRAvailable(),
    ]);

    // Get OCR provider info if available
    let ocrDetails = {};
    if (ocrAvailable) {
      const ocrProviders = await this.ocrFactory.getProvidersInfo();
      ocrDetails = { ocr: ocrAvailable, ocrProviders: ocrProviders.length };
    } else {
      ocrDetails = { ocr: false, ocrProviders: 0 };
    }

    // Combine dependency results
    const combinedDetails = {
      ...pdfjsDeps.details,
      ...ocrDetails,
    };

    // At least one provider should be available for this to be considered available
    const available = pdfjsDeps.available || ocrAvailable;

    let error: string | undefined;
    if (!available) {
      const errors = [pdfjsDeps.error];
      if (!ocrAvailable) {
        errors.push('OCR not available');
      }
      error = errors.filter(Boolean).join('; ');
    }

    return {
      available,
      error,
      details: combinedDetails,
    };
  }

  /**
   * Get quick information about a PDF document
   */
  async getInfo(source: PDFSource): Promise<PDFInfo> {
    return this.pdfjsProvider.getInfo(source);
  }
}
