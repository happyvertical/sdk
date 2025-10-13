import require$$0$1 from "node:assert";
import require$$0 from "node:stream";
import { __require as requireUtil } from "./index24.js";
import { __require as requireCacheHandler } from "./index85.js";
import { __require as requireMemoryCacheStore } from "./index44.js";
import { __require as requireCacheRevalidationHandler } from "./index86.js";
import { __require as requireCache$1 } from "./index87.js";
import { __require as requireErrors } from "./index23.js";
var cache;
var hasRequiredCache;
function requireCache() {
  if (hasRequiredCache) return cache;
  hasRequiredCache = 1;
  const assert = require$$0$1;
  const { Readable } = require$$0;
  const util = requireUtil();
  const CacheHandler = requireCacheHandler();
  const MemoryCacheStore = requireMemoryCacheStore();
  const CacheRevalidationHandler = requireCacheRevalidationHandler();
  const { assertCacheStore, assertCacheMethods, makeCacheKey, normalizeHeaders, parseCacheControlHeader } = requireCache$1();
  const { AbortError } = requireErrors();
  function needsRevalidation(result, cacheControlDirectives) {
    if (cacheControlDirectives?.["no-cache"]) {
      return true;
    }
    if (result.cacheControlDirectives?.["no-cache"] && !Array.isArray(result.cacheControlDirectives["no-cache"])) {
      return true;
    }
    const now = Date.now();
    if (now > result.staleAt) {
      if (cacheControlDirectives?.["max-stale"]) {
        const gracePeriod = result.staleAt + cacheControlDirectives["max-stale"] * 1e3;
        return now > gracePeriod;
      }
      return true;
    }
    if (cacheControlDirectives?.["min-fresh"]) {
      const timeLeftTillStale = result.staleAt - now;
      const threshold = cacheControlDirectives["min-fresh"] * 1e3;
      return timeLeftTillStale <= threshold;
    }
    return false;
  }
  function withinStaleWhileRevalidateWindow(result) {
    const staleWhileRevalidate = result.cacheControlDirectives?.["stale-while-revalidate"];
    if (!staleWhileRevalidate) {
      return false;
    }
    const now = Date.now();
    const staleWhileRevalidateExpiry = result.staleAt + staleWhileRevalidate * 1e3;
    return now <= staleWhileRevalidateExpiry;
  }
  function handleUncachedResponse(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl) {
    if (reqCacheControl?.["only-if-cached"]) {
      let aborted = false;
      try {
        if (typeof handler.onConnect === "function") {
          handler.onConnect(() => {
            aborted = true;
          });
          if (aborted) {
            return;
          }
        }
        if (typeof handler.onHeaders === "function") {
          handler.onHeaders(504, [], () => {
          }, "Gateway Timeout");
          if (aborted) {
            return;
          }
        }
        if (typeof handler.onComplete === "function") {
          handler.onComplete([]);
        }
      } catch (err) {
        if (typeof handler.onError === "function") {
          handler.onError(err);
        }
      }
      return true;
    }
    return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
  }
  function sendCachedValue(handler, opts, result, age, context, isStale) {
    const stream = util.isStream(result.body) ? result.body : Readable.from(result.body ?? []);
    assert(!stream.destroyed, "stream should not be destroyed");
    assert(!stream.readableDidRead, "stream should not be readableDidRead");
    const controller = {
      resume() {
        stream.resume();
      },
      pause() {
        stream.pause();
      },
      get paused() {
        return stream.isPaused();
      },
      get aborted() {
        return stream.destroyed;
      },
      get reason() {
        return stream.errored;
      },
      abort(reason) {
        stream.destroy(reason ?? new AbortError());
      }
    };
    stream.on("error", function(err) {
      if (!this.readableEnded) {
        if (typeof handler.onResponseError === "function") {
          handler.onResponseError(controller, err);
        } else {
          throw err;
        }
      }
    }).on("close", function() {
      if (!this.errored) {
        handler.onResponseEnd?.(controller, {});
      }
    });
    handler.onRequestStart?.(controller, context);
    if (stream.destroyed) {
      return;
    }
    const headers = { ...result.headers, age: String(age) };
    if (isStale) {
      headers.warning = '110 - "response is stale"';
    }
    handler.onResponseStart?.(controller, result.statusCode, headers, result.statusMessage);
    if (opts.method === "HEAD") {
      stream.destroy();
    } else {
      stream.on("data", function(chunk) {
        handler.onResponseData?.(controller, chunk);
      });
    }
  }
  function handleResult(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl, result) {
    if (!result) {
      return handleUncachedResponse(dispatch, globalOpts, cacheKey, handler, opts, reqCacheControl);
    }
    const now = Date.now();
    if (now > result.deleteAt) {
      return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
    }
    const age = Math.round((now - result.cachedAt) / 1e3);
    if (reqCacheControl?.["max-age"] && age >= reqCacheControl["max-age"]) {
      return dispatch(opts, handler);
    }
    if (needsRevalidation(result, reqCacheControl)) {
      if (util.isStream(opts.body) && util.bodyLength(opts.body) !== 0) {
        return dispatch(opts, new CacheHandler(globalOpts, cacheKey, handler));
      }
      if (withinStaleWhileRevalidateWindow(result)) {
        sendCachedValue(handler, opts, result, age, null, true);
        queueMicrotask(() => {
          let headers2 = {
            ...opts.headers,
            "if-modified-since": new Date(result.cachedAt).toUTCString()
          };
          if (result.etag) {
            headers2["if-none-match"] = result.etag;
          }
          if (result.vary) {
            headers2 = {
              ...headers2,
              ...result.vary
            };
          }
          dispatch(
            {
              ...opts,
              headers: headers2
            },
            new CacheHandler(globalOpts, cacheKey, {
              // Silent handler that just updates the cache
              onRequestStart() {
              },
              onRequestUpgrade() {
              },
              onResponseStart() {
              },
              onResponseData() {
              },
              onResponseEnd() {
              },
              onResponseError() {
              }
            })
          );
        });
        return true;
      }
      let withinStaleIfErrorThreshold = false;
      const staleIfErrorExpiry = result.cacheControlDirectives["stale-if-error"] ?? reqCacheControl?.["stale-if-error"];
      if (staleIfErrorExpiry) {
        withinStaleIfErrorThreshold = now < result.staleAt + staleIfErrorExpiry * 1e3;
      }
      let headers = {
        ...opts.headers,
        "if-modified-since": new Date(result.cachedAt).toUTCString()
      };
      if (result.etag) {
        headers["if-none-match"] = result.etag;
      }
      if (result.vary) {
        headers = {
          ...headers,
          ...result.vary
        };
      }
      return dispatch(
        {
          ...opts,
          headers
        },
        new CacheRevalidationHandler(
          (success, context) => {
            if (success) {
              sendCachedValue(handler, opts, result, age, context, true);
            } else if (util.isStream(result.body)) {
              result.body.on("error", () => {
              }).destroy();
            }
          },
          new CacheHandler(globalOpts, cacheKey, handler),
          withinStaleIfErrorThreshold
        )
      );
    }
    if (util.isStream(opts.body)) {
      opts.body.on("error", () => {
      }).destroy();
    }
    sendCachedValue(handler, opts, result, age, null, false);
  }
  cache = (opts = {}) => {
    const {
      store = new MemoryCacheStore(),
      methods = ["GET"],
      cacheByDefault = void 0,
      type = "shared"
    } = opts;
    if (typeof opts !== "object" || opts === null) {
      throw new TypeError(`expected type of opts to be an Object, got ${opts === null ? "null" : typeof opts}`);
    }
    assertCacheStore(store, "opts.store");
    assertCacheMethods(methods, "opts.methods");
    if (typeof cacheByDefault !== "undefined" && typeof cacheByDefault !== "number") {
      throw new TypeError(`expected opts.cacheByDefault to be number or undefined, got ${typeof cacheByDefault}`);
    }
    if (typeof type !== "undefined" && type !== "shared" && type !== "private") {
      throw new TypeError(`expected opts.type to be shared, private, or undefined, got ${typeof type}`);
    }
    const globalOpts = {
      store,
      methods,
      cacheByDefault,
      type
    };
    const safeMethodsToNotCache = util.safeHTTPMethods.filter((method) => methods.includes(method) === false);
    return (dispatch) => {
      return (opts2, handler) => {
        if (!opts2.origin || safeMethodsToNotCache.includes(opts2.method)) {
          return dispatch(opts2, handler);
        }
        opts2 = {
          ...opts2,
          headers: normalizeHeaders(opts2)
        };
        const reqCacheControl = opts2.headers?.["cache-control"] ? parseCacheControlHeader(opts2.headers["cache-control"]) : void 0;
        if (reqCacheControl?.["no-store"]) {
          return dispatch(opts2, handler);
        }
        const cacheKey = makeCacheKey(opts2);
        const result = store.get(cacheKey);
        if (result && typeof result.then === "function") {
          result.then((result2) => {
            handleResult(
              dispatch,
              globalOpts,
              cacheKey,
              handler,
              opts2,
              reqCacheControl,
              result2
            );
          });
        } else {
          handleResult(
            dispatch,
            globalOpts,
            cacheKey,
            handler,
            opts2,
            reqCacheControl,
            result
          );
        }
        return true;
      };
    };
  };
  return cache;
}
export {
  requireCache as __require
};
//# sourceMappingURL=index42.js.map
