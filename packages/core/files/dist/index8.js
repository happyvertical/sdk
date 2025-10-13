import { FilesystemError } from "./index4.js";
class BaseFilesystemProvider {
  basePath;
  cacheDir;
  createMissing;
  providerType;
  constructor(options = {}) {
    this.basePath = options.basePath || "";
    this.cacheDir = options.cacheDir || this.getDefaultCacheDir();
    this.createMissing = options.createMissing ?? true;
    this.providerType = this.constructor.name.toLowerCase().replace("filesystemprovider", "");
  }
  /**
   * Get default cache directory for the current context
   */
  getDefaultCacheDir() {
    try {
      const { getTempDirectory } = require("@have/utils");
      return getTempDirectory("files-cache");
    } catch {
      if (process?.versions?.node) {
        try {
          const { tmpdir } = require("node:os");
          const { join } = require("node:path");
          return join(tmpdir(), "have-sdk", "files-cache");
        } catch {
          return "./tmp/have-sdk/files-cache";
        }
      }
      return "./tmp/have-sdk/files-cache";
    }
  }
  /**
   * Throw error for unsupported operations
   */
  throwUnsupported(operation) {
    throw new FilesystemError(
      `Operation '${operation}' not supported by ${this.providerType} provider`,
      "ENOTSUP",
      void 0,
      this.providerType
    );
  }
  /**
   * Normalize path by removing leading/trailing slashes and resolving relative paths
   */
  normalizePath(path) {
    if (!path) return "";
    let normalized = path.startsWith("/") ? path.slice(1) : path;
    if (this.basePath) {
      normalized = this.joinPaths(this.basePath, normalized);
    }
    return normalized;
  }
  /**
   * Universal path joining function that works in both Node.js and browser
   */
  joinPaths(...paths) {
    return paths.filter((p) => p && p.length > 0).map((p) => p.replace(/^\/+|\/+$/g, "")).join("/");
  }
  /**
   * Validate that a path is safe (no directory traversal)
   */
  validatePath(path) {
    if (!path) {
      throw new FilesystemError("Path cannot be empty", "EINVAL", path);
    }
    if (path.includes("..") || path.includes("~")) {
      throw new FilesystemError(
        "Path contains invalid characters (directory traversal)",
        "EINVAL",
        path
      );
    }
  }
  /**
   * Get cache key for a given path
   */
  getCacheKey(path) {
    return `${this.constructor.name}-${path}`;
  }
  /**
   * Provider methods with default implementations (may be overridden)
   */
  async upload(_localPath, _remotePath, _options = {}) {
    this.throwUnsupported("upload");
  }
  async download(_remotePath, _localPath, _options = {}) {
    this.throwUnsupported("download");
  }
  async downloadWithCache(remotePath, options = {}) {
    const cacheKey = this.getCacheKey(remotePath);
    if (!options.force) {
      const cached = await this.cache.get(cacheKey, options.expiry);
      if (cached) {
        return cached;
      }
    }
    const localPath = await this.download(remotePath, void 0, options);
    await this.cache.set(cacheKey, localPath);
    return localPath;
  }
  /**
   * Cache implementation - providers can override for their specific storage
   */
  cache = {
    get: async (_key, _expiry) => {
      this.throwUnsupported("cache.get");
    },
    set: async (_key, _data) => {
      this.throwUnsupported("cache.set");
    },
    clear: async (_key) => {
      this.throwUnsupported("cache.clear");
    }
  };
  // Legacy method implementations - providers can override or use default ENOTSUP errors
  /**
   * Check if a path is a file (legacy)
   */
  async isFile(file) {
    try {
      const stats = await this.getStats(file);
      return stats.isFile ? stats : false;
    } catch {
      return false;
    }
  }
  /**
   * Check if a path is a directory (legacy)
   */
  async isDirectory(dir) {
    try {
      const stats = await this.getStats(dir);
      return stats.isDirectory;
    } catch {
      return false;
    }
  }
  /**
   * Create a directory if it doesn't exist (legacy)
   */
  async ensureDirectoryExists(dir) {
    if (!await this.isDirectory(dir)) {
      await this.createDirectory(dir, { recursive: true });
    }
  }
  /**
   * Upload data to a URL using PUT method (legacy)
   */
  async uploadToUrl(_url, _data) {
    this.throwUnsupported("uploadToUrl");
  }
  /**
   * Download a file from a URL and save it to a local file (legacy)
   */
  async downloadFromUrl(_url, _filepath) {
    this.throwUnsupported("downloadFromUrl");
  }
  /**
   * Download a file with caching support (legacy)
   */
  async downloadFileWithCache(_url, _targetPath) {
    this.throwUnsupported("downloadFileWithCache");
  }
  /**
   * List files in a directory with optional filtering (legacy)
   */
  async listFiles(dirPath, options = { match: /.*/ }) {
    const files = await this.list(dirPath);
    const fileNames = files.filter((file) => !file.isDirectory).map((file) => file.name);
    return options.match ? fileNames.filter((name) => options.match?.test(name)) : fileNames;
  }
  /**
   * Get data from cache if available and not expired (legacy)
   */
  async getCached(file, expiry = 3e5) {
    return await this.cache.get(file, expiry);
  }
  /**
   * Set data in cache (legacy)
   */
  async setCached(file, data) {
    await this.cache.set(file, data);
  }
}
export {
  BaseFilesystemProvider
};
//# sourceMappingURL=index8.js.map
