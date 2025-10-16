import { isValidKey, CacheKeyError, formatKey, isExpired, calculateSize, calculateExpiration, extractKey, matchesPattern, CacheSizeError } from "../index.js";
class MemoryProvider {
  cache;
  namespace;
  defaultTTL;
  maxSize;
  maxEntries;
  evictionPolicy;
  checkPeriod;
  checkInterval;
  stats;
  constructor(options) {
    this.cache = /* @__PURE__ */ new Map();
    this.namespace = options.namespace;
    this.defaultTTL = options.defaultTTL;
    this.maxSize = options.maxSize || 100 * 1024 * 1024;
    this.maxEntries = options.maxEntries || 1e4;
    this.evictionPolicy = options.evictionPolicy || "lru";
    this.checkPeriod = options.checkPeriod || 6e4;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
    this.startExpirationCheck();
  }
  async get(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "memory");
    }
    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);
    if (!entry) {
      this.stats.misses++;
      return void 0;
    }
    if (isExpired(entry.expiresAt)) {
      this.cache.delete(fullKey);
      this.stats.misses++;
      return void 0;
    }
    entry.hits++;
    if (this.evictionPolicy === "lru") {
      this.cache.delete(fullKey);
      this.cache.set(fullKey, entry);
    }
    this.stats.hits++;
    return entry.value;
  }
  async set(key, value, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "memory");
    }
    const fullKey = formatKey(this.namespace, key);
    const size = calculateSize(value);
    const expiresAt = calculateExpiration(ttl ?? this.defaultTTL);
    const entry = {
      value,
      createdAt: Date.now(),
      expiresAt,
      size,
      hits: 0,
      metadata: {
        namespace: this.namespace
      }
    };
    await this.evictIfNeeded(size);
    this.cache.set(fullKey, entry);
  }
  async has(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "memory");
    }
    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);
    if (!entry) {
      return false;
    }
    if (isExpired(entry.expiresAt)) {
      this.cache.delete(fullKey);
      return false;
    }
    return true;
  }
  async delete(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "memory");
    }
    const fullKey = formatKey(this.namespace, key);
    return this.cache.delete(fullKey);
  }
  async clear(namespace) {
    if (namespace) {
      const prefix = `${namespace}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.evictions = 0;
    }
  }
  async keys(pattern) {
    const allKeys = Array.from(this.cache.keys());
    const validKeys = [];
    for (const key of allKeys) {
      const entry = this.cache.get(key);
      if (entry && !isExpired(entry.expiresAt)) {
        validKeys.push(extractKey(this.namespace, key));
      }
    }
    if (pattern) {
      return validKeys.filter((key) => matchesPattern(pattern, key));
    }
    return validKeys;
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
    let totalSize = 0;
    let entries = 0;
    for (const entry of this.cache.values()) {
      if (!isExpired(entry.expiresAt)) {
        totalSize += entry.size;
        entries++;
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
        type: "memory",
        evictionPolicy: this.evictionPolicy,
        maxSize: this.maxSize,
        maxEntries: this.maxEntries
      }
    };
  }
  async touch(key, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "memory");
    }
    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);
    if (!entry || isExpired(entry.expiresAt)) {
      return false;
    }
    entry.expiresAt = calculateExpiration(ttl);
    return true;
  }
  async close() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = void 0;
    }
    this.cache.clear();
  }
  /**
   * Evicts entries if size or count limits are exceeded
   */
  async evictIfNeeded(newEntrySize) {
    const stats = await this.getStats();
    if (stats.entries >= this.maxEntries) {
      await this.evict(1);
    }
    while (stats.totalSize + newEntrySize > this.maxSize && this.cache.size > 0) {
      await this.evict(1);
      const updatedStats = await this.getStats();
      if (updatedStats.totalSize + newEntrySize <= this.maxSize) {
        break;
      }
    }
    const finalStats = await this.getStats();
    if (finalStats.totalSize + newEntrySize > this.maxSize) {
      throw new CacheSizeError(
        `Cannot cache entry: would exceed max size of ${this.maxSize} bytes`,
        "memory"
      );
    }
  }
  /**
   * Evicts entries based on eviction policy
   */
  async evict(count) {
    if (this.cache.size === 0) {
      return;
    }
    const entries = Array.from(this.cache.entries());
    switch (this.evictionPolicy) {
      case "lru": {
        for (let i = 0; i < count && i < entries.length; i++) {
          this.cache.delete(entries[i][0]);
          this.stats.evictions++;
        }
        break;
      }
      case "lfu": {
        const sorted = entries.sort((a, b) => a[1].hits - b[1].hits);
        for (let i = 0; i < count && i < sorted.length; i++) {
          this.cache.delete(sorted[i][0]);
          this.stats.evictions++;
        }
        break;
      }
      case "fifo": {
        const sorted = entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
        for (let i = 0; i < count && i < sorted.length; i++) {
          this.cache.delete(sorted[i][0]);
          this.stats.evictions++;
        }
        break;
      }
    }
  }
  /**
   * Starts background task to remove expired entries
   */
  startExpirationCheck() {
    this.checkInterval = setInterval(() => {
      this.removeExpiredEntries();
    }, this.checkPeriod);
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }
  /**
   * Removes all expired entries from the cache
   */
  removeExpiredEntries() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
export {
  MemoryProvider
};
//# sourceMappingURL=memory-C6vfNZYg.js.map
