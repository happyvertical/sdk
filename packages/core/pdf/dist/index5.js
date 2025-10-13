import { getOCR } from "@have/ocr";
import { BasePDFReader } from "./index3.js";
import { UnpdfProvider } from "./index6.js";
class CombinedNodeProvider extends BasePDFReader {
  name = "combined-node";
  unpdfProvider;
  ocrFactory = getOCR({ provider: "auto" });
  constructor() {
    super();
    this.unpdfProvider = new UnpdfProvider();
  }
  /**
   * Extract text content from a PDF with OCR fallback
   */
  async extractText(source, options) {
    try {
      const text = await this.unpdfProvider.extractText(source, options);
      if (!text?.trim() && !options?.skipOCRFallback) {
        console.log("No direct text found, attempting OCR fallback...");
        try {
          const images = await this.unpdfProvider.extractImages(source);
          if (images && images.length > 0) {
            const ocrResult = await this.ocrFactory.performOCR(images);
            return ocrResult.text || null;
          }
        } catch (ocrError) {
          console.warn("OCR fallback failed:", ocrError);
        }
      }
      return text;
    } catch (error) {
      console.error("Combined text extraction failed:", error);
      return null;
    }
  }
  /**
   * Extract metadata from a PDF using unpdf
   */
  async extractMetadata(source) {
    return this.unpdfProvider.extractMetadata(source);
  }
  /**
   * Extract images from a PDF using unpdf
   */
  async extractImages(source) {
    return this.unpdfProvider.extractImages(source);
  }
  /**
   * Perform OCR on image data
   */
  async performOCR(images, options) {
    return this.ocrFactory.performOCR(images, options);
  }
  /**
   * Check the combined capabilities of both providers
   */
  async checkCapabilities() {
    const [unpdfCaps, ocrAvailable] = await Promise.all([
      this.unpdfProvider.checkCapabilities(),
      this.ocrFactory.isOCRAvailable()
    ]);
    let ocrLanguages = [];
    if (ocrAvailable) {
      ocrLanguages = await this.ocrFactory.getSupportedLanguages();
    }
    return {
      canExtractText: unpdfCaps.canExtractText || ocrAvailable,
      // Can extract text directly or via OCR
      canExtractMetadata: unpdfCaps.canExtractMetadata,
      canExtractImages: unpdfCaps.canExtractImages,
      canPerformOCR: ocrAvailable,
      supportedFormats: unpdfCaps.supportedFormats,
      maxFileSize: unpdfCaps.maxFileSize,
      ocrLanguages: ocrLanguages.length > 0 ? ocrLanguages : void 0
    };
  }
  /**
   * Check dependencies for both providers
   */
  async checkDependencies() {
    const [unpdfDeps, ocrAvailable] = await Promise.all([
      this.unpdfProvider.checkDependencies(),
      this.ocrFactory.isOCRAvailable()
    ]);
    let ocrDetails = {};
    if (ocrAvailable) {
      const ocrProviders = await this.ocrFactory.getProvidersInfo();
      ocrDetails = { ocr: ocrAvailable, ocrProviders: ocrProviders.length };
    } else {
      ocrDetails = { ocr: false, ocrProviders: 0 };
    }
    const combinedDetails = {
      ...unpdfDeps.details,
      ...ocrDetails
    };
    const available = unpdfDeps.available || ocrAvailable;
    let error;
    if (!available) {
      const errors = [unpdfDeps.error];
      if (!ocrAvailable) {
        errors.push("OCR not available");
      }
      error = errors.filter(Boolean).join("; ");
    }
    return {
      available,
      error,
      details: combinedDetails
    };
  }
  /**
   * Get quick information about a PDF document combining both unpdf and OCR analysis
   */
  async getInfo(source) {
    try {
      const unpdfInfo = await this.unpdfProvider.getInfo(source);
      const ocrAvailable = await this.ocrFactory.isOCRAvailable();
      let enhancedStrategy = unpdfInfo.recommendedStrategy;
      let enhancedOcrRequired = unpdfInfo.ocrRequired;
      const enhancedProcessingTime = { ...unpdfInfo.estimatedProcessingTime };
      if (unpdfInfo.recommendedStrategy === "ocr" && !ocrAvailable) {
        enhancedStrategy = "text";
        enhancedOcrRequired = false;
        enhancedProcessingTime.ocrProcessing = void 0;
      }
      if (unpdfInfo.recommendedStrategy === "hybrid" && !ocrAvailable) {
        enhancedStrategy = "text";
        enhancedOcrRequired = false;
        enhancedProcessingTime.ocrProcessing = void 0;
      }
      if (ocrAvailable && unpdfInfo.hasImages && unpdfInfo.hasEmbeddedText && unpdfInfo.estimatedTextLength && unpdfInfo.estimatedTextLength < 1e3) {
        enhancedStrategy = "hybrid";
        enhancedProcessingTime.ocrProcessing = unpdfInfo.pageCount > 10 ? "slow" : unpdfInfo.pageCount > 3 ? "medium" : "fast";
      }
      return {
        ...unpdfInfo,
        recommendedStrategy: enhancedStrategy,
        ocrRequired: enhancedOcrRequired,
        estimatedProcessingTime: {
          textExtraction: enhancedProcessingTime.textExtraction || "fast",
          ocrProcessing: enhancedProcessingTime.ocrProcessing
        }
      };
    } catch (error) {
      console.error("Combined getInfo failed:", error);
      return {
        pageCount: 0,
        encrypted: false,
        hasEmbeddedText: false,
        hasImages: false,
        recommendedStrategy: await this.ocrFactory.isOCRAvailable() ? "hybrid" : "text",
        ocrRequired: false,
        estimatedProcessingTime: {
          textExtraction: "fast"
        }
      };
    }
  }
}
export {
  CombinedNodeProvider
};
//# sourceMappingURL=index5.js.map
