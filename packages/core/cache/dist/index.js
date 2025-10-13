import { CacheConnectionError, CacheError, CacheKeyError, CacheSerializationError, CacheSizeError } from "./index5.js";
import { calculateExpiration, calculateSize, deserialize, extractKey, formatKey, isExpired, isValidKey, matchesPattern, serialize } from "./index6.js";
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
    const { MemoryProvider } = await import("./index2.js");
    return new MemoryProvider(options);
  }
  if (isFileOptions(options)) {
    const { FileProvider } = await import("./index3.js");
    return new FileProvider(options);
  }
  if (isRedisOptions(options)) {
    const { RedisProvider } = await import("./index4.js");
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
