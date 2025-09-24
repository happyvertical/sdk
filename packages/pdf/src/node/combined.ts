/**
 * @have/pdf - Combined Node.js PDF reader with unpdf + OCR capabilities
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
import { UnpdfProvider } from './unpdf.js';

/**
 * Combined PDF reader for Node.js that integrates unpdf and OCR capabilities
 *
 * This provider:
 * - Uses unpdf for text, metadata, and image extraction
 * - Falls back to OCR when direct text extraction yields no results
 * - Combines capabilities of both underlying providers
 */
export class CombinedNodeProvider extends BasePDFReader {
  protected name = 'combined-node';
  private unpdfProvider: UnpdfProvider;
  private ocrFactory = getOCR({ provider: 'auto' });

  constructor() {
    super();
    this.unpdfProvider = new UnpdfProvider();
  }

  /**
   * Extract text content from a PDF with OCR fallback
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions,
  ): Promise<string | null> {
    try {
      // First try direct text extraction using unpdf
      const text = await this.unpdfProvider.extractText(source, options);

      // If no text was found and OCR fallback is not disabled, try OCR
      if (!text?.trim() && !options?.skipOCRFallback) {
        console.log('No direct text found, attempting OCR fallback...');

        try {
          const images = await this.unpdfProvider.extractImages(source);
          if (images && images.length > 0) {
            const ocrResult = await this.ocrFactory.performOCR(images);
            return ocrResult.text || null;
          }
        } catch (ocrError) {
          console.warn('OCR fallback failed:', ocrError);
        }
      }

      return text;
    } catch (error) {
      console.error('Combined text extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract metadata from a PDF using unpdf
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    return this.unpdfProvider.extractMetadata(source);
  }

  /**
   * Extract images from a PDF using unpdf
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    return this.unpdfProvider.extractImages(source);
  }

  /**
   * Perform OCR on image data
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
    const [unpdfCaps, ocrAvailable] = await Promise.all([
      this.unpdfProvider.checkCapabilities(),
      this.ocrFactory.isOCRAvailable(),
    ]);

    // Get OCR languages if OCR is available
    let ocrLanguages: string[] = [];
    if (ocrAvailable) {
      ocrLanguages = await this.ocrFactory.getSupportedLanguages();
    }

    return {
      canExtractText: unpdfCaps.canExtractText || ocrAvailable, // Can extract text directly or via OCR
      canExtractMetadata: unpdfCaps.canExtractMetadata,
      canExtractImages: unpdfCaps.canExtractImages,
      canPerformOCR: ocrAvailable,
      supportedFormats: unpdfCaps.supportedFormats,
      maxFileSize: unpdfCaps.maxFileSize,
      ocrLanguages: ocrLanguages.length > 0 ? ocrLanguages : undefined,
    };
  }

  /**
   * Check dependencies for both providers
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    const [unpdfDeps, ocrAvailable] = await Promise.all([
      this.unpdfProvider.checkDependencies(),
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
      ...unpdfDeps.details,
      ...ocrDetails,
    };

    // At least one provider should be available for this to be considered available
    const available = unpdfDeps.available || ocrAvailable;

    let error: string | undefined;
    if (!available) {
      const errors = [unpdfDeps.error];
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
   * Get quick information about a PDF document combining both unpdf and OCR analysis
   */
  async getInfo(source: PDFSource): Promise<PDFInfo> {
    try {
      // First, get detailed analysis from unpdf provider (primary)
      const unpdfInfo = await this.unpdfProvider.getInfo(source);

      // Check OCR availability to enhance recommendations
      const ocrAvailable = await this.ocrFactory.isOCRAvailable();

      // Enhance the analysis with OCR-aware recommendations
      let enhancedStrategy = unpdfInfo.recommendedStrategy;
      let enhancedOcrRequired = unpdfInfo.ocrRequired;
      const enhancedProcessingTime = { ...unpdfInfo.estimatedProcessingTime };

      // If unpdf recommends OCR but OCR is not available, adjust strategy
      if (unpdfInfo.recommendedStrategy === 'ocr' && !ocrAvailable) {
        enhancedStrategy = 'text'; // Fall back to text-only
        enhancedOcrRequired = false;
        // Remove OCR processing time estimate
        enhancedProcessingTime.ocrProcessing = undefined;
      }

      // If unpdf recommends hybrid and OCR is not available, go text-only
      if (unpdfInfo.recommendedStrategy === 'hybrid' && !ocrAvailable) {
        enhancedStrategy = 'text';
        enhancedOcrRequired = false;
        enhancedProcessingTime.ocrProcessing = undefined;
      }

      // If OCR is available and document has images but little text, suggest hybrid
      if (
        ocrAvailable &&
        unpdfInfo.hasImages &&
        unpdfInfo.hasEmbeddedText &&
        unpdfInfo.estimatedTextLength &&
        unpdfInfo.estimatedTextLength < 1000
      ) {
        enhancedStrategy = 'hybrid';
        enhancedProcessingTime.ocrProcessing =
          unpdfInfo.pageCount > 10
            ? 'slow'
            : unpdfInfo.pageCount > 3
              ? 'medium'
              : 'fast';
      }

      return {
        ...unpdfInfo,
        recommendedStrategy: enhancedStrategy,
        ocrRequired: enhancedOcrRequired,
        estimatedProcessingTime: {
          textExtraction: enhancedProcessingTime.textExtraction || 'fast',
          ocrProcessing: enhancedProcessingTime.ocrProcessing,
        },
      };
    } catch (error) {
      console.error('Combined getInfo failed:', error);

      // Return minimal default info if unpdf fails
      return {
        pageCount: 0,
        encrypted: false,
        hasEmbeddedText: false,
        hasImages: false,
        recommendedStrategy: (await this.ocrFactory.isOCRAvailable())
          ? 'hybrid'
          : 'text',
        ocrRequired: false,
        estimatedProcessingTime: {
          textExtraction: 'fast',
        },
      };
    }
  }
}
