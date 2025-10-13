import { promises } from "node:fs";
import { BasePDFReader } from "./index3.js";
import { PDFDependencyError } from "./index4.js";
class UnpdfProvider extends BasePDFReader {
  name = "unpdf";
  unpdf = null;
  /**
   * Lazy load unpdf dependencies
   */
  async loadUnpdf() {
    if (this.unpdf) {
      return this.unpdf;
    }
    try {
      this.unpdf = await import("./index7.js");
      return this.unpdf;
    } catch (error) {
      throw new PDFDependencyError("unpdf", error.message);
    }
  }
  /**
   * Override normalizeSource to handle file reading in Node.js
   */
  async normalizeSource(source) {
    if (typeof source === "string") {
      try {
        const buffer = await promises.readFile(source);
        return buffer;
      } catch (error) {
        throw new Error(`Failed to read PDF file: ${error.message}`);
      }
    } else if (source instanceof Buffer) {
      return source;
    } else if (source instanceof Uint8Array) {
      return Buffer.from(source);
    } else {
      throw new Error(
        "Invalid PDF source: must be file path, Buffer, or Uint8Array"
      );
    }
  }
  /**
   * Extract text content from a PDF using unpdf
   */
  async extractText(source, options) {
    if (!source || typeof source === "string" && source.trim() === "" || typeof source === "object" && Object.keys(source).length === 0 && !(source instanceof Buffer) && !(source instanceof Uint8Array)) {
      return null;
    }
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);
      if (!this.validatePDFData(buffer)) {
        throw new Error("Invalid PDF data");
      }
      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const totalPages = pdf.numPages;
      const pagesToExtract = this.normalizePages(options?.pages, totalPages);
      if (pagesToExtract.length === 0) {
        return null;
      }
      const pageTexts = [];
      for (const pageNum of pagesToExtract) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str || "").join(" ").trim();
          pageTexts.push(pageText);
        } catch (pageError) {
          console.warn(
            `Failed to extract text from page ${pageNum}:`,
            pageError
          );
          pageTexts.push("");
        }
      }
      const mergedText = this.mergePageTexts(pageTexts, options?.mergePages);
      return mergedText || null;
    } catch (error) {
      console.error("unpdf text extraction failed:", error);
      return null;
    }
  }
  /**
   * Extract metadata from a PDF using unpdf
   */
  async extractMetadata(source) {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);
      if (!this.validatePDFData(buffer)) {
        throw new Error("Invalid PDF data");
      }
      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const metadata = await pdf.getMetadata();
      return {
        pageCount: pdf.numPages,
        title: metadata?.info?.Title || void 0,
        author: metadata?.info?.Author || void 0,
        subject: metadata?.info?.Subject || void 0,
        keywords: metadata?.info?.Keywords || void 0,
        creationDate: metadata?.info?.CreationDate ? new Date(metadata.info.CreationDate) : void 0,
        modificationDate: metadata?.info?.ModDate ? new Date(metadata.info.ModDate) : void 0,
        version: metadata?.info?.PDFFormatVersion || void 0,
        creator: metadata?.info?.Creator || void 0,
        producer: metadata?.info?.Producer || void 0,
        encrypted: metadata?.info?.Encrypted === "Yes"
      };
    } catch (error) {
      console.error("unpdf metadata extraction failed:", error);
      try {
        const unpdf = await this.loadUnpdf();
        const buffer = await this.normalizeSource(source);
        const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
        return this.createDefaultMetadata(pdf.numPages);
      } catch {
        return this.createDefaultMetadata(0);
      }
    }
  }
  /**
   * No conversion needed! Direct RGB data is now supported by the new ONNX provider.
   * This is the optimal path for OCR processing from unpdf.
   */
  processRawRGBData(rgbData, _width, _height) {
    return rgbData;
  }
  /**
   * Extract images from a PDF using unpdf
   */
  async extractImages(source) {
    if (!source || typeof source === "string" && source.trim() === "" || typeof source === "object" && Object.keys(source).length === 0 && !(source instanceof Buffer) && !(source instanceof Uint8Array)) {
      return [];
    }
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);
      if (!this.validatePDFData(buffer)) {
        throw new Error("Invalid PDF data");
      }
      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const allImages = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const images = await unpdf.extractImages(pdf, pageNum);
          for (const image of images) {
            const rawData = image.data instanceof Buffer ? image.data : Buffer.from(image.data);
            let processedData = rawData;
            let format = image.format || "unknown";
            if (image.channels === 3 && image.width && image.height) {
              const expectedSize = image.width * image.height * 3;
              if (rawData.length === expectedSize) {
                processedData = this.processRawRGBData(
                  rawData,
                  image.width,
                  image.height
                );
                format = "rgb";
              }
            }
            allImages.push({
              data: processedData,
              width: image.width,
              height: image.height,
              channels: image.channels,
              format,
              pageNumber: pageNum
            });
          }
        } catch (pageError) {
          console.warn(
            `Failed to extract images from page ${pageNum}:`,
            pageError
          );
        }
      }
      return allImages;
    } catch (error) {
      console.error("unpdf image extraction failed:", error);
      return [];
    }
  }
  /**
   * Check the capabilities of the unpdf provider
   */
  async checkCapabilities() {
    const deps = await this.checkDependencies();
    return {
      canExtractText: deps.available,
      canExtractMetadata: deps.available,
      canExtractImages: deps.available,
      canPerformOCR: false,
      // unpdf doesn't do OCR
      supportedFormats: ["pdf"],
      maxFileSize: void 0,
      // No explicit limit
      ocrLanguages: void 0
    };
  }
  /**
   * Check if unpdf dependencies are available
   */
  async checkDependencies() {
    try {
      await this.loadUnpdf();
      return {
        available: true,
        details: {
          unpdf: true
        }
      };
    } catch (error) {
      return {
        available: false,
        error: `unpdf dependency not available: ${error.message}`,
        details: {
          unpdf: false
        }
      };
    }
  }
  /**
   * Get quick information about a PDF document
   */
  async getInfo(source) {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);
      if (!this.validatePDFData(buffer)) {
        throw new Error("Invalid PDF data");
      }
      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const metadata = await pdf.getMetadata();
      const pageCount = pdf.numPages;
      let hasEmbeddedText = false;
      let hasImages = false;
      let estimatedTextLength = 0;
      const pagesToSample = Math.min(3, pageCount);
      for (let i = 1; i <= pagesToSample; i++) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          if (content.items && content.items.length > 0) {
            hasEmbeddedText = true;
            const pageTextLength = content.items.reduce(
              (len, item) => {
                return len + (item.str ? item.str.length : 0);
              },
              0
            );
            estimatedTextLength += pageTextLength;
          }
          const ops = await page.getOperatorList();
          if (ops.fnArray?.some((op) => op === 82 || op === 85)) {
            hasImages = true;
          }
        } catch (pageError) {
          console.warn(`Failed to analyze page ${i}:`, pageError);
        }
      }
      if (estimatedTextLength > 0 && pageCount > pagesToSample) {
        estimatedTextLength = Math.round(
          estimatedTextLength / pagesToSample * pageCount
        );
      }
      let recommendedStrategy;
      let ocrRequired = false;
      if (hasEmbeddedText) {
        if (hasImages && estimatedTextLength < 500) {
          recommendedStrategy = "hybrid";
          ocrRequired = false;
        } else {
          recommendedStrategy = "text";
          ocrRequired = false;
        }
      } else {
        recommendedStrategy = "ocr";
        ocrRequired = true;
      }
      const estimatedProcessingTime = {
        textExtraction: hasEmbeddedText ? estimatedTextLength > 5e4 ? "medium" : "fast" : "fast",
        ocrProcessing: hasImages || ocrRequired ? pageCount > 10 ? "slow" : pageCount > 3 ? "medium" : "fast" : void 0
      };
      return {
        pageCount,
        fileSize: buffer.length,
        version: metadata?.info?.PDFFormatVersion || void 0,
        encrypted: metadata?.info?.Encrypted === "Yes",
        hasEmbeddedText,
        hasImages,
        estimatedTextLength: estimatedTextLength > 0 ? estimatedTextLength : void 0,
        recommendedStrategy,
        ocrRequired,
        estimatedProcessingTime,
        title: metadata?.info?.Title || void 0,
        author: metadata?.info?.Author || void 0,
        creationDate: metadata?.info?.CreationDate ? new Date(metadata.info.CreationDate) : void 0,
        creator: metadata?.info?.Creator || void 0,
        producer: metadata?.info?.Producer || void 0
      };
    } catch (error) {
      console.error("unpdf getInfo failed:", error);
      return {
        pageCount: 0,
        encrypted: false,
        hasEmbeddedText: false,
        hasImages: false,
        recommendedStrategy: "hybrid",
        ocrRequired: false,
        estimatedProcessingTime: {
          textExtraction: "fast"
        }
      };
    }
  }
}
export {
  UnpdfProvider
};
//# sourceMappingURL=index6.js.map
