import { getMimeType, downloadFileWithCache, getCached, setCached } from "@have/files";
import { v4 } from "uuid";
import { getPDFReader } from "@have/pdf";
import os from "node:os";
import path from "node:path";
import { URL as URL$1 } from "node:url";
import { makeSlug } from "@have/utils";
class Document {
  /**
   * Flag indicating if document is from a remote source
   */
  isRemote = false;
  /**
   * Configuration options
   */
  options;
  /**
   * Local file path where document is stored
   */
  _localPath = "";
  /**
   * Directory used for caching files
   */
  _cacheDir = "";
  /**
   * Document URL
   */
  url;
  /**
   * Document MIME type
   */
  type;
  /**
   * Document parts (hierarchical structure)
   */
  parts = [];
  /**
   * Document-level metadata
   */
  metadata = {};
  /**
   * Get the local file path where document is stored
   */
  get localPath() {
    return this._localPath;
  }
  /**
   * Get the directory used for caching files
   */
  get cacheDir() {
    return this._cacheDir;
  }
  /**
   * Creates a new Document instance
   *
   * @param url - Document URL or file path
   * @param options - Document configuration options
   */
  constructor(url, options = {}) {
    this.url = new URL$1(url);
    this.options = options;
    this.type = options.type || getMimeType(this.url.toString()) || "text/plain";
    this._cacheDir = options.cacheDir || path.resolve(os.tmpdir(), ".cache", "have-sdk", "documents");
    if (this.url.protocol.startsWith("file")) {
      this._localPath = decodeURIComponent(this.url.pathname);
      this.isRemote = false;
    } else if (this.url.protocol.startsWith("http")) {
      let pathname = this.url.pathname;
      if (pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }
      if (!pathname.match(/\.[a-z0-9]+$/i)) {
        if (this.type === "application/pdf" || options.type === "application/pdf") {
          pathname += ".pdf";
        }
      }
      this._localPath = path.join(
        this._cacheDir,
        makeSlug(this.url.hostname),
        pathname
      );
      this.isRemote = true;
    }
  }
  /**
   * Creates and initializes a Document instance
   *
   * Downloads remote files and prepares the document for processing.
   *
   * @param url - Document URL or file path
   * @param options - Document configuration options
   * @returns Promise resolving to the initialized Document
   */
  static async create(url, options = {}) {
    const document = new Document(url, options);
    await document.initialize();
    return document;
  }
  /**
   * Initializes the document, downloading it if it's remote
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize() {
    if (this.isRemote) {
      if (!this.url) {
        throw new Error("Cannot initialize remote document: URL is required");
      }
      await downloadFileWithCache(this.url.toString(), this._localPath);
    }
  }
  /**
   * Checks if the document is a text-based file that can be read directly
   *
   * @returns Boolean indicating if the file is text-based
   */
  isTextFile() {
    if (!this.type) return false;
    return this.type.startsWith("text/") || this.type === "application/json" || this.type === "application/xml" || this.type === "application/javascript" || this.type === "application/typescript" || [
      ".txt",
      ".md",
      ".json",
      ".xml",
      ".html",
      ".css",
      ".js",
      ".ts",
      ".yaml",
      ".yml"
    ].some((ext) => this.localPath.toLowerCase().endsWith(ext));
  }
  /**
   * Converts the document to the standard Document interface
   *
   * @returns Document object with URL, type, parts, and metadata
   */
  toDocument() {
    return {
      url: this.url.toString(),
      type: this.type,
      parts: this.parts,
      metadata: this.metadata
    };
  }
}
function getTitleFromUrl(url, defaultTitle = "Document") {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split("/").pop() || defaultTitle;
    const decodedFilename = decodeURIComponent(filename);
    return decodedFilename.replace(/\.(pdf|html?|md|txt)$/i, "").replace(/[-_]/g, " ").trim();
  } catch {
    return defaultTitle;
  }
}
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
const processors = [new PDFProcessor()];
async function fetchDocument(url, options = {}) {
  let type = options.type;
  if (!type) {
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith(".pdf") || urlLower.includes(".pdf?") || urlLower.includes(".pdf#")) {
      type = "application/pdf";
    } else {
      type = getMimeType(url) || "";
    }
  }
  const processor = processors.find((p) => p.supports(type));
  if (!processor) {
    throw new Error(
      `No processor available for document type: ${type}. Supported types: PDF (.pdf, application/pdf)`
    );
  }
  return processor.process(url, options);
}
export {
  Document,
  PDFProcessor,
  fetchDocument,
  getTitleFromUrl
};
//# sourceMappingURL=index.js.map
