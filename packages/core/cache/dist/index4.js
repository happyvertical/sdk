import { createClient } from "redis";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import { CacheConnectionError, CacheKeyError, CacheError, CacheSerializationError } from "./index5.js";
import { isValidKey, formatKey, deserialize, serialize } from "./index6.js";
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
class RedisProvider {
  constructor(options) {
    this.options = options;
    this.namespace = options.namespace || options.keyPrefix;
    this.defaultTTL = options.defaultTTL;
    this.enableCompression = options.enableCompression ?? false;
    this.compressionThreshold = options.compressionThreshold || 1024;
    this.stats = {
      hits: 0,
      misses: 0
    };
    this.client = createClient({
      socket: {
        host: options.host || "localhost",
        port: options.port || 6379,
        connectTimeout: options.connectTimeout || 5e3
      },
      password: options.password,
      database: options.db || 0,
      commandsQueueMaxLength: 1e3
    });
    this.client.on("error", (error) => {
      console.error("Redis connection error:", error);
    });
    this.client.on("connect", () => {
      this.connected = true;
    });
    this.client.on("end", () => {
      this.connected = false;
    });
  }
  client;
  namespace;
  defaultTTL;
  enableCompression;
  compressionThreshold;
  stats;
  connected = false;
  /**
   * Ensures the client is connected
   */
  async ensureConnected() {
    if (!this.connected) {
      try {
        await this.client.connect();
        this.connected = true;
      } catch (error) {
        throw new CacheConnectionError(
          `Failed to connect to Redis: ${error.message}`,
          "redis"
        );
      }
    }
  }
  async get(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "redis");
    }
    await this.ensureConnected();
    const fullKey = formatKey(this.namespace, key);
    try {
      const value = await this.client.get(fullKey);
      if (value === null) {
        this.stats.misses++;
        return void 0;
      }
      this.stats.hits++;
      let data = value;
      if (this.enableCompression && value.startsWith("gzip:")) {
        const compressed = Buffer.from(value.slice(5), "base64");
        const decompressed = await gunzipAsync(compressed);
        data = decompressed.toString("utf-8");
      }
      return deserialize(data);
    } catch (error) {
      throw new CacheError(
        `Failed to get cache entry: ${error.message}`,
        "GET_ERROR",
        "redis"
      );
    }
  }
  async set(key, value, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "redis");
    }
    await this.ensureConnected();
    const fullKey = formatKey(this.namespace, key);
    try {
      let data = serialize(value);
      if (this.enableCompression && data.length > this.compressionThreshold) {
        const compressed = await gzipAsync(Buffer.from(data, "utf-8"));
        data = "gzip:" + compressed.toString("base64");
      }
      const effectiveTTL = ttl ?? this.defaultTTL;
      if (effectiveTTL !== void 0 && effectiveTTL > 0) {
        await this.client.setEx(fullKey, effectiveTTL, data);
      } else {
        await this.client.set(fullKey, data);
      }
    } catch (error) {
      if (error.message?.includes("serialize")) {
        throw new CacheSerializationError(
          `Failed to serialize value: ${error.message}`,
          "redis"
        );
      }
      throw new CacheError(
        `Failed to set cache entry: ${error.message}`,
        "SET_ERROR",
        "redis"
      );
    }
  }
  async has(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "redis");
    }
    await this.ensureConnected();
    const fullKey = formatKey(this.namespace, key);
    try {
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error) {
      throw new CacheError(
        `Failed to check cache entry: ${error.message}`,
        "EXISTS_ERROR",
        "redis"
      );
    }
  }
  async delete(key) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "redis");
    }
    await this.ensureConnected();
    const fullKey = formatKey(this.namespace, key);
    try {
      const deleted = await this.client.del(fullKey);
      return deleted === 1;
    } catch (error) {
      throw new CacheError(
        `Failed to delete cache entry: ${error.message}`,
        "DELETE_ERROR",
        "redis"
      );
    }
  }
  async clear(namespace) {
    await this.ensureConnected();
    try {
      if (namespace) {
        const pattern = `${namespace}:*`;
        let cursor = "0";
        do {
          const reply = await this.client.scan(cursor, {
            MATCH: pattern,
            COUNT: 100
          });
          cursor = reply.cursor;
          if (reply.keys.length > 0) {
            await this.client.del(reply.keys);
          }
        } while (cursor !== "0");
      } else {
        await this.client.flushDb();
        this.stats.hits = 0;
        this.stats.misses = 0;
      }
    } catch (error) {
      throw new CacheError(
        `Failed to clear cache: ${error.message}`,
        "CLEAR_ERROR",
        "redis"
      );
    }
  }
  async keys(pattern) {
    await this.ensureConnected();
    try {
      const searchPattern = pattern ? formatKey(this.namespace, pattern) : formatKey(this.namespace, "*");
      const keys = [];
      let cursor = "0";
      do {
        const reply = await this.client.scan(cursor, {
          MATCH: searchPattern,
          COUNT: 100
        });
        cursor = reply.cursor;
        keys.push(...reply.keys);
      } while (cursor !== "0");
      if (this.namespace) {
        const prefix = `${this.namespace}:`;
        return keys.map(
          (key) => key.startsWith(prefix) ? key.slice(prefix.length) : key
        );
      }
      return keys;
    } catch (error) {
      throw new CacheError(
        `Failed to get cache keys: ${error.message}`,
        "KEYS_ERROR",
        "redis"
      );
    }
  }
  async getMany(keys) {
    if (keys.length === 0) {
      return /* @__PURE__ */ new Map();
    }
    await this.ensureConnected();
    const fullKeys = keys.map((key) => formatKey(this.namespace, key));
    try {
      const values = await this.client.mGet(fullKeys);
      const result = /* @__PURE__ */ new Map();
      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        if (value !== null) {
          let data = value;
          if (this.enableCompression && value.startsWith("gzip:")) {
            const compressed = Buffer.from(value.slice(5), "base64");
            const decompressed = await gunzipAsync(compressed);
            data = decompressed.toString("utf-8");
          }
          result.set(keys[i], deserialize(data));
          this.stats.hits++;
        } else {
          this.stats.misses++;
        }
      }
      return result;
    } catch (error) {
      throw new CacheError(
        `Failed to get multiple cache entries: ${error.message}`,
        "MGET_ERROR",
        "redis"
      );
    }
  }
  async setMany(entries) {
    if (entries.length === 0) {
      return;
    }
    await this.ensureConnected();
    try {
      const pipeline = this.client.multi();
      for (const entry of entries) {
        const fullKey = formatKey(this.namespace, entry.key);
        let data = serialize(entry.value);
        if (this.enableCompression && data.length > this.compressionThreshold) {
          const compressed = await gzipAsync(Buffer.from(data, "utf-8"));
          data = "gzip:" + compressed.toString("base64");
        }
        const effectiveTTL = entry.ttl ?? this.defaultTTL;
        if (effectiveTTL !== void 0 && effectiveTTL > 0) {
          pipeline.setEx(fullKey, effectiveTTL, data);
        } else {
          pipeline.set(fullKey, data);
        }
      }
      await pipeline.exec();
    } catch (error) {
      throw new CacheError(
        `Failed to set multiple cache entries: ${error.message}`,
        "MSET_ERROR",
        "redis"
      );
    }
  }
  async deleteMany(keys) {
    if (keys.length === 0) {
      return 0;
    }
    await this.ensureConnected();
    const fullKeys = keys.map((key) => formatKey(this.namespace, key));
    try {
      const deleted = await this.client.del(fullKeys);
      return deleted;
    } catch (error) {
      throw new CacheError(
        `Failed to delete multiple cache entries: ${error.message}`,
        "MDEL_ERROR",
        "redis"
      );
    }
  }
  async getStats() {
    await this.ensureConnected();
    try {
      const info = await this.client.info("stats");
      const dbInfo = await this.client.info("keyspace");
      const dbMatch = dbInfo.match(/db\d+:keys=(\d+)/);
      const entries = dbMatch ? parseInt(dbMatch[1], 10) : 0;
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      const redisHits = hitsMatch ? parseInt(hitsMatch[1], 10) : 0;
      const redisMisses = missesMatch ? parseInt(missesMatch[1], 10) : 0;
      const totalHits = this.stats.hits + redisHits;
      const totalMisses = this.stats.misses + redisMisses;
      const totalAccesses = totalHits + totalMisses;
      const hitRate = totalAccesses > 0 ? totalHits / totalAccesses : 0;
      return {
        entries,
        totalSize: 0,
        // Redis doesn't easily expose total memory per keyspace
        hits: totalHits,
        misses: totalMisses,
        hitRate,
        evictions: 0,
        // Would need to parse evicted_keys from stats
        backend: {
          type: "redis",
          host: this.options.host || "localhost",
          port: this.options.port || 6379,
          db: this.options.db || 0,
          compression: this.enableCompression
        }
      };
    } catch (error) {
      throw new CacheError(
        `Failed to get cache stats: ${error.message}`,
        "STATS_ERROR",
        "redis"
      );
    }
  }
  async touch(key, ttl) {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, "redis");
    }
    await this.ensureConnected();
    const fullKey = formatKey(this.namespace, key);
    try {
      const result = await this.client.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      throw new CacheError(
        `Failed to touch cache entry: ${error.message}`,
        "TOUCH_ERROR",
        "redis"
      );
    }
  }
  async close() {
    if (this.connected) {
      try {
        await this.client.quit();
        this.connected = false;
      } catch (error) {
        await this.client.disconnect();
        this.connected = false;
      }
    }
  }
}
export {
  RedisProvider
};
//# sourceMappingURL=index4.js.map
