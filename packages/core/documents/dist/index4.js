import { v4 } from "uuid";
import { getCached, setCached } from "@have/files";
import { getPDFReader } from "@have/pdf";
import { Document } from "./index3.js";
import { getTitleFromUrl } from "./index5.js";
class PDFProcessor {
  /**
   * Check if this processor supports the given type
   */
  supports(type) {
    return type === "application/pdf" || type.endsWith(".pdf") || type.toLowerCase() === "pdf";
  }
  /**
   * Process a PDF document
   *
   * Extracts text and optionally images/OCR from the PDF, structuring
   * it into hierarchical document parts.
   *
   * @param url - PDF URL or file path
   * @param options - Processing options
   * @returns Promise resolving to structured Document
   */
  async process(url, options = {}) {
    const baseDoc = await Document.create(url, options);
    const cacheKey = `${baseDoc.localPath}.processed_pdf`;
    const cached = await getCached(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          url: baseDoc.url.toString(),
          type: baseDoc.type,
          parts: parsed.parts,
          metadata: parsed.metadata || {}
        };
      } catch (error) {
        console.warn("Cached PDF data corrupted, reprocessing", error);
      }
    }
    const reader = await getPDFReader();
    const extractedText = await reader.extractText(baseDoc.localPath);
    const mainPart = {
      id: v4(),
      title: getTitleFromUrl(url, "PDF Document"),
      content: extractedText || "",
      type: "text",
      metadata: {
        source: "pdf",
        filePath: baseDoc.localPath
      }
    };
    if (options.extractImages === true) {
      mainPart.images = await this.extractImages(
        baseDoc.localPath,
        options.runOcr !== false
      );
    }
    const document = {
      url: baseDoc.url.toString(),
      type: baseDoc.type,
      parts: [mainPart],
      metadata: {
        processor: "pdf",
        extractedAt: (/* @__PURE__ */ new Date()).toISOString(),
        hasImages: (mainPart.images?.length || 0) > 0
      }
    };
    await setCached(cacheKey, JSON.stringify(document));
    return document;
  }
  /**
   * Extract images from PDF
   *
   * This is a placeholder for future image extraction functionality.
   * Will use @have/pdf's image extraction capabilities when available.
   *
   * @param filePath - Local PDF file path
   * @param runOcr - Whether to run OCR on extracted images
   * @returns Promise resolving to array of DocumentImages
   */
  async extractImages(filePath, runOcr) {
    return [];
  }
}
export {
  PDFProcessor,
  PDFProcessor as default
};
//# sourceMappingURL=index4.js.map
