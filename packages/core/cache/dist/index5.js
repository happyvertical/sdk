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
export {
  CacheConnectionError,
  CacheError,
  CacheKeyError,
  CacheSerializationError,
  CacheSizeError
};
//# sourceMappingURL=index5.js.map
