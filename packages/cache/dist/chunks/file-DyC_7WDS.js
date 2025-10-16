import { readFile, rm, stat, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { isValidKey, CacheKeyError, formatKey, deserialize, isExpired, CacheError, calculateExpiration, calculateSize, extractKey, matchesPattern, serialize, CacheSerializationError, CacheSizeError } from "../index.js";
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
class FileProvider {
  cacheDir;
  namespace;
  defaultTTL;
  maxSize;
  compression;
  fileExtension;
  checkPeriod;
  checkInterval;
  stats;
  constructor(options) {
    this.cacheDir = resolve(options.cacheDir);
    this.namespace = options.namespace;
    this.defaultTTL = options.defaultTTL;
    this.maxSize = options.maxSize || 500 * 1024 * 1024;
    this.compression = options.compression ?? false;
    this.fileExtension = options.fileExtension || ".cache";
    this.checkPeriod = options.checkPeriod || 3e5;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    this.ensureCacheDir();
    this.startCleanup();
  }
  async get(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "file");
    }
    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    try {
      const fileContent = await readFile(filePath);
      let data;
      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }
      const entry = deserialize(data.toString("utf-8"));
      if (isExpired(entry.expiresAt)) {
        await rm(filePath, { force: true });
        this.stats.misses++;
        return void 0;
      }
      entry.hits++;
      this.stats.hits++;
      await this.writeEntry(filePath, entry);
      return entry.value;
    } catch (error) {
      if (error.code === "ENOENT") {
        this.stats.misses++;
        return void 0;
      }
      throw new CacheError(
        `Failed to read cache entry: ${error.message}`,
        "READ_ERROR",
        "file"
      );
    }
  }
  async set(key, value, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "file");
    }
    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    const expiresAt = calculateExpiration(ttl ?? this.defaultTTL);
    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt,
      size: calculateSize(value),
      hits: 0,
      metadata: {
        compressed: this.compression,
        namespace: this.namespace
      }
    };
    await this.evictIfNeeded(entry.size);
    await this.writeEntry(filePath, entry);
  }
  async has(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "file");
    }
    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    try {
      const fileContent = await readFile(filePath);
      let data;
      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }
      const entry = deserialize(data.toString("utf-8"));
      if (isExpired(entry.expiresAt)) {
        await rm(filePath, { force: true });
        return false;
      }
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      throw new CacheError(
        `Failed to check cache entry: ${error.message}`,
        "CHECK_ERROR",
        "file"
      );
    }
  }
  async delete(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "file");
    }
    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    try {
      await rm(filePath);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      throw new CacheError(
        `Failed to delete cache entry: ${error.message}`,
        "DELETE_ERROR",
        "file"
      );
    }
  }
  async clear(namespace) {
    if (namespace) {
      const prefix = this.sanitizeKey(`${namespace}:`);
      const files = await this.getAllFiles();
      for (const file of files) {
        if (file.startsWith(prefix)) {
          await rm(join(this.cacheDir, file), { force: true });
        }
      }
    } else {
      try {
        await rm(this.cacheDir, { recursive: true, force: true });
        await this.ensureCacheDir();
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.evictions = 0;
      } catch (error) {
        throw new CacheError(
          `Failed to clear cache: ${error.message}`,
          "CLEAR_ERROR",
          "file"
        );
      }
    }
  }
  async keys(pattern) {
    const files = await this.getAllFiles();
    const keys = [];
    for (const file of files) {
      const key = file.replace(this.fileExtension, "");
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data;
        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }
        const entry = deserialize(data.toString("utf-8"));
        if (!isExpired(entry.expiresAt)) {
          const desanitized = this.desanitizeKey(key);
          keys.push(extractKey(this.namespace, desanitized));
        }
      } catch {
      }
    }
    if (pattern) {
      return keys.filter((key) => matchesPattern(pattern, key));
    }
    return keys;
  }
  async getMany(keys) {
    const result = /* @__PURE__ */ new Map();
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== void 0) {
        result.set(key, value);
      }
    }
    return result;
  }
  async setMany(entries) {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }
  async deleteMany(keys) {
    let deleted = 0;
    for (const key of keys) {
      const wasDeleted = await this.delete(key);
      if (wasDeleted) {
        deleted++;
      }
    }
    return deleted;
  }
  async getStats() {
    const files = await this.getAllFiles();
    let totalSize = 0;
    let entries = 0;
    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const stats = await stat(filePath);
        totalSize += stats.size;
        const fileContent = await readFile(filePath);
        let data;
        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }
        const entry = deserialize(data.toString("utf-8"));
        if (!isExpired(entry.expiresAt)) {
          entries++;
        }
      } catch {
      }
    }
    const totalAccesses = this.stats.hits + this.stats.misses;
    const hitRate = totalAccesses > 0 ? this.stats.hits / totalAccesses : 0;
    return {
      entries,
      totalSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions,
      backend: {
        type: "file",
        cacheDir: this.cacheDir,
        compression: this.compression,
        maxSize: this.maxSize
      }
    };
  }
  async touch(key, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "file");
    }
    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    try {
      const fileContent = await readFile(filePath);
      let data;
      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }
      const entry = deserialize(data.toString("utf-8"));
      if (isExpired(entry.expiresAt)) {
        return false;
      }
      entry.expiresAt = calculateExpiration(ttl);
      await this.writeEntry(filePath, entry);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      throw new CacheError(
        `Failed to touch cache entry: ${error.message}`,
        "TOUCH_ERROR",
        "file"
      );
    }
  }
  async close() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = void 0;
    }
  }
  /**
   * Ensures cache directory exists
   */
  async ensureCacheDir() {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      throw new CacheError(
        `Failed to create cache directory: ${error.message}`,
        "INIT_ERROR",
        "file"
      );
    }
  }
  /**
   * Gets the file path for a cache key
   */
  getFilePath(key) {
    const sanitizedKey = this.sanitizeKey(key);
    return join(this.cacheDir, `${sanitizedKey}${this.fileExtension}`);
  }
  /**
   * Sanitizes a key for use as a filename
   */
  sanitizeKey(key) {
    return key.replace(/[^a-zA-Z0-9_:-]/g, "_");
  }
  /**
   * Desanitizes a filename back to the original key
   */
  desanitizeKey(sanitized) {
    return sanitized;
  }
  /**
   * Gets all cache file names
   */
  async getAllFiles() {
    try {
      const files = await readdir(this.cacheDir);
      return files.filter((file) => file.endsWith(this.fileExtension));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw new CacheError(
        `Failed to list cache files: ${error.message}`,
        "LIST_ERROR",
        "file"
      );
    }
  }
  /**
   * Writes an entry to a file
   */
  async writeEntry(filePath, entry) {
    try {
      let data;
      const json = serialize(entry);
      data = Buffer.from(json, "utf-8");
      if (this.compression) {
        data = await gzipAsync(data);
      }
      await writeFile(filePath, data);
    } catch (error) {
      throw new CacheSerializationError(
        `Failed to write cache entry: ${error.message}`,
        "file"
      );
    }
  }
  /**
   * Evicts files if size limit is exceeded
   */
  async evictIfNeeded(newEntrySize) {
    const stats = await this.getStats();
    if (stats.totalSize + newEntrySize > this.maxSize) {
      await this.evict();
      const updatedStats = await this.getStats();
      if (updatedStats.totalSize + newEntrySize > this.maxSize) {
        throw new CacheSizeError(
          `Cannot cache entry: would exceed max size of ${this.maxSize} bytes`,
          "file"
        );
      }
    }
  }
  /**
   * Evicts oldest files based on creation time
   */
  async evict() {
    const files = await this.getAllFiles();
    const filesWithStats = [];
    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data;
        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }
        const entry = deserialize(data.toString("utf-8"));
        filesWithStats.push({ file, createdAt: entry.createdAt });
      } catch {
      }
    }
    filesWithStats.sort((a, b) => a.createdAt - b.createdAt);
    const toRemove = Math.max(1, Math.floor(filesWithStats.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      const filePath = join(this.cacheDir, filesWithStats[i].file);
      await rm(filePath, { force: true });
      this.stats.evictions++;
    }
  }
  /**
   * Starts background cleanup of expired files
   */
  startCleanup() {
    this.checkInterval = setInterval(() => {
      this.removeExpiredFiles();
    }, this.checkPeriod);
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }
  /**
   * Removes expired files
   */
  async removeExpiredFiles() {
    const files = await this.getAllFiles();
    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data;
        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }
        const entry = deserialize(data.toString("utf-8"));
        if (isExpired(entry.expiresAt)) {
          await rm(filePath, { force: true });
        }
      } catch {
      }
    }
  }
}
export {
  FileProvider
};
//# sourceMappingURL=file-DyC_7WDS.js.map
