import { __require as requireCache } from "./index94.js";
import { __require as requireWebidl } from "./index91.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireSymbols } from "./index53.js";
var cachestorage;
var hasRequiredCachestorage;
function requireCachestorage() {
  if (hasRequiredCachestorage) return cachestorage;
  hasRequiredCachestorage = 1;
  const { Cache } = requireCache();
  const { webidl } = requireWebidl();
  const { kEnumerableProperty } = requireUtil();
  const { kConstruct } = requireSymbols();
  class CacheStorage {
    /**
     * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-name-to-cache-map
     * @type {Map<string, import('./cache').requestResponseList}
     */
    #caches = /* @__PURE__ */ new Map();
    constructor() {
      if (arguments[0] !== kConstruct) {
        webidl.illegalConstructor();
      }
      webidl.util.markAsUncloneable(this);
    }
    async match(request, options = {}) {
      webidl.brandCheck(this, CacheStorage);
      webidl.argumentLengthCheck(arguments, 1, "CacheStorage.match");
      request = webidl.converters.RequestInfo(request);
      options = webidl.converters.MultiCacheQueryOptions(options);
      if (options.cacheName != null) {
        if (this.#caches.has(options.cacheName)) {
          const cacheList = this.#caches.get(options.cacheName);
          const cache = new Cache(kConstruct, cacheList);
          return await cache.match(request, options);
        }
      } else {
        for (const cacheList of this.#caches.values()) {
          const cache = new Cache(kConstruct, cacheList);
          const response = await cache.match(request, options);
          if (response !== void 0) {
            return response;
          }
        }
      }
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#cache-storage-has
     * @param {string} cacheName
     * @returns {Promise<boolean>}
     */
    async has(cacheName) {
      webidl.brandCheck(this, CacheStorage);
      const prefix = "CacheStorage.has";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
      return this.#caches.has(cacheName);
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
     * @param {string} cacheName
     * @returns {Promise<Cache>}
     */
    async open(cacheName) {
      webidl.brandCheck(this, CacheStorage);
      const prefix = "CacheStorage.open";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
      if (this.#caches.has(cacheName)) {
        const cache2 = this.#caches.get(cacheName);
        return new Cache(kConstruct, cache2);
      }
      const cache = [];
      this.#caches.set(cacheName, cache);
      return new Cache(kConstruct, cache);
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
     * @param {string} cacheName
     * @returns {Promise<boolean>}
     */
    async delete(cacheName) {
      webidl.brandCheck(this, CacheStorage);
      const prefix = "CacheStorage.delete";
      webidl.argumentLengthCheck(arguments, 1, prefix);
      cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
      return this.#caches.delete(cacheName);
    }
    /**
     * @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
     * @returns {Promise<string[]>}
     */
    async keys() {
      webidl.brandCheck(this, CacheStorage);
      const keys = this.#caches.keys();
      return [...keys];
    }
  }
  Object.defineProperties(CacheStorage.prototype, {
    [Symbol.toStringTag]: {
      value: "CacheStorage",
      configurable: true
    },
    match: kEnumerableProperty,
    has: kEnumerableProperty,
    open: kEnumerableProperty,
    delete: kEnumerableProperty,
    keys: kEnumerableProperty
  });
  cachestorage = {
    CacheStorage
  };
  return cachestorage;
}
export {
  requireCachestorage as __require
};
//# sourceMappingURL=index52.js.map
