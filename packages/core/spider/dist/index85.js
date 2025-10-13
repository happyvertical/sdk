import { __require as requireUtil } from "./index24.js";
import { __require as requireCache } from "./index87.js";
import { __require as requireDate } from "./index113.js";
var cacheHandler;
var hasRequiredCacheHandler;
function requireCacheHandler() {
  if (hasRequiredCacheHandler) return cacheHandler;
  hasRequiredCacheHandler = 1;
  const util = requireUtil();
  const {
    parseCacheControlHeader,
    parseVaryHeader,
    isEtagUsable
  } = requireCache();
  const { parseHttpDate } = requireDate();
  function noop() {
  }
  const HEURISTICALLY_CACHEABLE_STATUS_CODES = [
    200,
    203,
    204,
    206,
    300,
    301,
    308,
    404,
    405,
    410,
    414,
    501
  ];
  const NOT_UNDERSTOOD_STATUS_CODES = [
    206,
    304
  ];
  const MAX_RESPONSE_AGE = 2147483647e3;
  class CacheHandler {
    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
     */
    #cacheKey;
    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions['type']}
     */
    #cacheType;
    /**
     * @type {number | undefined}
     */
    #cacheByDefault;
    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
     */
    #store;
    /**
     * @type {import('../../types/dispatcher.d.ts').default.DispatchHandler}
     */
    #handler;
    /**
     * @type {import('node:stream').Writable | undefined}
     */
    #writeStream;
    /**
     * @param {import('../../types/cache-interceptor.d.ts').default.CacheHandlerOptions} opts
     * @param {import('../../types/cache-interceptor.d.ts').default.CacheKey} cacheKey
     * @param {import('../../types/dispatcher.d.ts').default.DispatchHandler} handler
     */
    constructor({ store, type, cacheByDefault }, cacheKey, handler) {
      this.#store = store;
      this.#cacheType = type;
      this.#cacheByDefault = cacheByDefault;
      this.#cacheKey = cacheKey;
      this.#handler = handler;
    }
    onRequestStart(controller, context) {
      this.#writeStream?.destroy();
      this.#writeStream = void 0;
      this.#handler.onRequestStart?.(controller, context);
    }
    onRequestUpgrade(controller, statusCode, headers, socket) {
      this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
    }
    /**
     * @param {import('../../types/dispatcher.d.ts').default.DispatchController} controller
     * @param {number} statusCode
     * @param {import('../../types/header.d.ts').IncomingHttpHeaders} resHeaders
     * @param {string} statusMessage
     */
    onResponseStart(controller, statusCode, resHeaders, statusMessage) {
      const downstreamOnHeaders = () => this.#handler.onResponseStart?.(
        controller,
        statusCode,
        resHeaders,
        statusMessage
      );
      if (!util.safeHTTPMethods.includes(this.#cacheKey.method) && statusCode >= 200 && statusCode <= 399) {
        try {
          this.#store.delete(this.#cacheKey)?.catch?.(noop);
        } catch {
        }
        return downstreamOnHeaders();
      }
      const cacheControlHeader = resHeaders["cache-control"];
      const heuristicallyCacheable = resHeaders["last-modified"] && HEURISTICALLY_CACHEABLE_STATUS_CODES.includes(statusCode);
      if (!cacheControlHeader && !resHeaders["expires"] && !heuristicallyCacheable && !this.#cacheByDefault) {
        return downstreamOnHeaders();
      }
      const cacheControlDirectives = cacheControlHeader ? parseCacheControlHeader(cacheControlHeader) : {};
      if (!canCacheResponse(this.#cacheType, statusCode, resHeaders, cacheControlDirectives)) {
        return downstreamOnHeaders();
      }
      const now = Date.now();
      const resAge = resHeaders.age ? getAge(resHeaders.age) : void 0;
      if (resAge && resAge >= MAX_RESPONSE_AGE) {
        return downstreamOnHeaders();
      }
      const resDate = typeof resHeaders.date === "string" ? parseHttpDate(resHeaders.date) : void 0;
      const staleAt = determineStaleAt(this.#cacheType, now, resAge, resHeaders, resDate, cacheControlDirectives) ?? this.#cacheByDefault;
      if (staleAt === void 0 || resAge && resAge > staleAt) {
        return downstreamOnHeaders();
      }
      const baseTime = resDate ? resDate.getTime() : now;
      const absoluteStaleAt = staleAt + baseTime;
      if (now >= absoluteStaleAt) {
        return downstreamOnHeaders();
      }
      let varyDirectives;
      if (this.#cacheKey.headers && resHeaders.vary) {
        varyDirectives = parseVaryHeader(resHeaders.vary, this.#cacheKey.headers);
        if (!varyDirectives) {
          return downstreamOnHeaders();
        }
      }
      const deleteAt = determineDeleteAt(baseTime, cacheControlDirectives, absoluteStaleAt);
      const strippedHeaders = stripNecessaryHeaders(resHeaders, cacheControlDirectives);
      const value = {
        statusCode,
        statusMessage,
        headers: strippedHeaders,
        vary: varyDirectives,
        cacheControlDirectives,
        cachedAt: resAge ? now - resAge : now,
        staleAt: absoluteStaleAt,
        deleteAt
      };
      if (typeof resHeaders.etag === "string" && isEtagUsable(resHeaders.etag)) {
        value.etag = resHeaders.etag;
      }
      this.#writeStream = this.#store.createWriteStream(this.#cacheKey, value);
      if (!this.#writeStream) {
        return downstreamOnHeaders();
      }
      const handler = this;
      this.#writeStream.on("drain", () => controller.resume()).on("error", function() {
        handler.#writeStream = void 0;
        handler.#store.delete(handler.#cacheKey);
      }).on("close", function() {
        if (handler.#writeStream === this) {
          handler.#writeStream = void 0;
        }
        controller.resume();
      });
      return downstreamOnHeaders();
    }
    onResponseData(controller, chunk) {
      if (this.#writeStream?.write(chunk) === false) {
        controller.pause();
      }
      this.#handler.onResponseData?.(controller, chunk);
    }
    onResponseEnd(controller, trailers) {
      this.#writeStream?.end();
      this.#handler.onResponseEnd?.(controller, trailers);
    }
    onResponseError(controller, err) {
      this.#writeStream?.destroy(err);
      this.#writeStream = void 0;
      this.#handler.onResponseError?.(controller, err);
    }
  }
  function canCacheResponse(cacheType, statusCode, resHeaders, cacheControlDirectives) {
    if (statusCode < 200 || NOT_UNDERSTOOD_STATUS_CODES.includes(statusCode)) {
      return false;
    }
    if (!HEURISTICALLY_CACHEABLE_STATUS_CODES.includes(statusCode) && !resHeaders["expires"] && !cacheControlDirectives.public && cacheControlDirectives["max-age"] === void 0 && // RFC 9111: a private response directive, if the cache is not shared
    !(cacheControlDirectives.private && cacheType === "private") && !(cacheControlDirectives["s-maxage"] !== void 0 && cacheType === "shared")) {
      return false;
    }
    if (cacheControlDirectives["no-store"]) {
      return false;
    }
    if (cacheType === "shared" && cacheControlDirectives.private === true) {
      return false;
    }
    if (resHeaders.vary?.includes("*")) {
      return false;
    }
    if (resHeaders.authorization) {
      if (!cacheControlDirectives.public || typeof resHeaders.authorization !== "string") {
        return false;
      }
      if (Array.isArray(cacheControlDirectives["no-cache"]) && cacheControlDirectives["no-cache"].includes("authorization")) {
        return false;
      }
      if (Array.isArray(cacheControlDirectives["private"]) && cacheControlDirectives["private"].includes("authorization")) {
        return false;
      }
    }
    return true;
  }
  function getAge(ageHeader) {
    const age = parseInt(Array.isArray(ageHeader) ? ageHeader[0] : ageHeader);
    return isNaN(age) ? void 0 : age * 1e3;
  }
  function determineStaleAt(cacheType, now, age, resHeaders, responseDate, cacheControlDirectives) {
    if (cacheType === "shared") {
      const sMaxAge = cacheControlDirectives["s-maxage"];
      if (sMaxAge !== void 0) {
        return sMaxAge > 0 ? sMaxAge * 1e3 : void 0;
      }
    }
    const maxAge = cacheControlDirectives["max-age"];
    if (maxAge !== void 0) {
      return maxAge > 0 ? maxAge * 1e3 : void 0;
    }
    if (typeof resHeaders.expires === "string") {
      const expiresDate = parseHttpDate(resHeaders.expires);
      if (expiresDate) {
        if (now >= expiresDate.getTime()) {
          return void 0;
        }
        if (responseDate) {
          if (responseDate >= expiresDate) {
            return void 0;
          }
          if (age !== void 0 && age > expiresDate - responseDate) {
            return void 0;
          }
        }
        return expiresDate.getTime() - now;
      }
    }
    if (typeof resHeaders["last-modified"] === "string") {
      const lastModified = new Date(resHeaders["last-modified"]);
      if (isValidDate(lastModified)) {
        if (lastModified.getTime() >= now) {
          return void 0;
        }
        const responseAge = now - lastModified.getTime();
        return responseAge * 0.1;
      }
    }
    if (cacheControlDirectives.immutable) {
      return 31536e3;
    }
    return void 0;
  }
  function determineDeleteAt(now, cacheControlDirectives, staleAt) {
    let staleWhileRevalidate = -Infinity;
    let staleIfError = -Infinity;
    let immutable = -Infinity;
    if (cacheControlDirectives["stale-while-revalidate"]) {
      staleWhileRevalidate = staleAt + cacheControlDirectives["stale-while-revalidate"] * 1e3;
    }
    if (cacheControlDirectives["stale-if-error"]) {
      staleIfError = staleAt + cacheControlDirectives["stale-if-error"] * 1e3;
    }
    if (staleWhileRevalidate === -Infinity && staleIfError === -Infinity) {
      immutable = now + 31536e6;
    }
    return Math.max(staleAt, staleWhileRevalidate, staleIfError, immutable);
  }
  function stripNecessaryHeaders(resHeaders, cacheControlDirectives) {
    const headersToRemove = [
      "connection",
      "proxy-authenticate",
      "proxy-authentication-info",
      "proxy-authorization",
      "proxy-connection",
      "te",
      "transfer-encoding",
      "upgrade",
      // We'll add age back when serving it
      "age"
    ];
    if (resHeaders["connection"]) {
      if (Array.isArray(resHeaders["connection"])) {
        headersToRemove.push(...resHeaders["connection"].map((header) => header.trim()));
      } else {
        headersToRemove.push(...resHeaders["connection"].split(",").map((header) => header.trim()));
      }
    }
    if (Array.isArray(cacheControlDirectives["no-cache"])) {
      headersToRemove.push(...cacheControlDirectives["no-cache"]);
    }
    if (Array.isArray(cacheControlDirectives["private"])) {
      headersToRemove.push(...cacheControlDirectives["private"]);
    }
    let strippedHeaders;
    for (const headerName of headersToRemove) {
      if (resHeaders[headerName]) {
        strippedHeaders ??= { ...resHeaders };
        delete strippedHeaders[headerName];
      }
    }
    return strippedHeaders ?? resHeaders;
  }
  function isValidDate(date) {
    return date instanceof Date && Number.isFinite(date.valueOf());
  }
  cacheHandler = CacheHandler;
  return cacheHandler;
}
export {
  requireCacheHandler as __require
};
//# sourceMappingURL=index85.js.map
