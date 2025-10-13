import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import { getMimeType, downloadFileWithCache } from "@have/files";
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
    this.url = new URL(url);
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
export {
  Document,
  Document as default
};
//# sourceMappingURL=index3.js.map
