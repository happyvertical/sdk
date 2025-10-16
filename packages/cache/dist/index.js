class CacheError extends Error {
  constructor(message, code, provider) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = "CacheError";
  }
}
class CacheKeyError extends CacheError {
  constructor(key, provider) {
    super(`Invalid cache key: ${key}`, "INVALID_KEY", provider);
    this.key = key;
    this.name = "CacheKeyError";
  }
}
class CacheConnectionError extends CacheError {
  constructor(message, provider) {
    super(message, "CONNECTION_ERROR", provider);
    this.name = "CacheConnectionError";
  }
}
class CacheSizeError extends CacheError {
  constructor(message, provider) {
    super(message, "SIZE_EXCEEDED", provider);
    this.name = "CacheSizeError";
  }
}
class CacheSerializationError extends CacheError {
  constructor(message, provider) {
    super(message, "SERIALIZATION_ERROR", provider);
    this.name = "CacheSerializationError";
  }
}
function isValidKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 250;
}
function calculateSize(value) {
  try {
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  } catch {
    return 0;
  }
}
function matchesPattern(pattern, str) {
  const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}
function formatKey(namespace, key) {
  return namespace ? `${namespace}:${key}` : key;
}
function extractKey(namespace, fullKey) {
  if (!namespace) {
    return fullKey;
  }
  const prefix = `${namespace}:`;
  return fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : fullKey;
}
function isExpired(expiresAt) {
  if (expiresAt === void 0) {
    return false;
  }
  return Date.now() >= expiresAt;
}
function calculateExpiration(ttl) {
  if (ttl === void 0 || ttl <= 0) {
    return void 0;
  }
  return Date.now() + ttl * 1e3;
}
function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(
      `Failed to serialize value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
function deserialize(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to deserialize value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
function isMemoryOptions(options) {
  return options.provider === "memory";
}
function isFileOptions(options) {
  return options.provider === "file";
}
function isRedisOptions(options) {
  return options.provider === "redis";
}
async function getCache(options) {
  if (isMemoryOptions(options)) {
    const { MemoryProvider } = await import("./chunks/memory-C6vfNZYg.js");
    return new MemoryProvider(options);
  }
  if (isFileOptions(options)) {
    const { FileProvider } = await import("./chunks/file-DyC_7WDS.js");
    return new FileProvider(options);
  }
  if (isRedisOptions(options)) {
    const { RedisProvider } = await import("./chunks/redis-D-SNLXE_.js");
    return new RedisProvider(options);
  }
  throw new Error(`Unsupported provider: ${options.provider}`);
}
export {
  CacheConnectionError,
  CacheError,
  CacheKeyError,
  CacheSerializationError,
  CacheSizeError,
  calculateExpiration,
  calculateSize,
  deserialize,
  extractKey,
  formatKey,
  getCache,
  isExpired,
  isValidKey,
  matchesPattern,
  serialize
};
//# sourceMappingURL=index.js.map
