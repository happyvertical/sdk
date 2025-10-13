import require$$0 from "node:assert";
var cacheRevalidationHandler;
var hasRequiredCacheRevalidationHandler;
function requireCacheRevalidationHandler() {
  if (hasRequiredCacheRevalidationHandler) return cacheRevalidationHandler;
  hasRequiredCacheRevalidationHandler = 1;
  const assert = require$$0;
  class CacheRevalidationHandler {
    #successful = false;
    /**
     * @type {((boolean, any) => void) | null}
     */
    #callback;
    /**
     * @type {(import('../../types/dispatcher.d.ts').default.DispatchHandler)}
     */
    #handler;
    #context;
    /**
     * @type {boolean}
     */
    #allowErrorStatusCodes;
    /**
     * @param {(boolean) => void} callback Function to call if the cached value is valid
     * @param {import('../../types/dispatcher.d.ts').default.DispatchHandlers} handler
     * @param {boolean} allowErrorStatusCodes
     */
    constructor(callback, handler, allowErrorStatusCodes) {
      if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
      }
      this.#callback = callback;
      this.#handler = handler;
      this.#allowErrorStatusCodes = allowErrorStatusCodes;
    }
    onRequestStart(_, context) {
      this.#successful = false;
      this.#context = context;
    }
    onRequestUpgrade(controller, statusCode, headers, socket) {
      this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
    }
    onResponseStart(controller, statusCode, headers, statusMessage) {
      assert(this.#callback != null);
      this.#successful = statusCode === 304 || this.#allowErrorStatusCodes && statusCode >= 500 && statusCode <= 504;
      this.#callback(this.#successful, this.#context);
      this.#callback = null;
      if (this.#successful) {
        return true;
      }
      this.#handler.onRequestStart?.(controller, this.#context);
      this.#handler.onResponseStart?.(
        controller,
        statusCode,
        headers,
        statusMessage
      );
    }
    onResponseData(controller, chunk) {
      if (this.#successful) {
        return;
      }
      return this.#handler.onResponseData?.(controller, chunk);
    }
    onResponseEnd(controller, trailers) {
      if (this.#successful) {
        return;
      }
      this.#handler.onResponseEnd?.(controller, trailers);
    }
    onResponseError(controller, err) {
      if (this.#successful) {
        return;
      }
      if (this.#callback) {
        this.#callback(false);
        this.#callback = null;
      }
      if (typeof this.#handler.onResponseError === "function") {
        this.#handler.onResponseError(controller, err);
      } else {
        throw err;
      }
    }
  }
  cacheRevalidationHandler = CacheRevalidationHandler;
  return cacheRevalidationHandler;
}
export {
  requireCacheRevalidationHandler as __require
};
//# sourceMappingURL=index86.js.map
