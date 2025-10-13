import { __exports as mockInterceptor } from "./index112.js";
import { __require as requireMockUtils } from "./index78.js";
import { __require as requireMockSymbols } from "./index79.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
var hasRequiredMockInterceptor;
function requireMockInterceptor() {
  if (hasRequiredMockInterceptor) return mockInterceptor;
  hasRequiredMockInterceptor = 1;
  const { getResponseData, buildKey, addMockDispatch } = requireMockUtils();
  const {
    kDispatches,
    kDispatchKey,
    kDefaultHeaders,
    kDefaultTrailers,
    kContentLength,
    kMockDispatch,
    kIgnoreTrailingSlash
  } = requireMockSymbols();
  const { InvalidArgumentError } = requireErrors();
  const { serializePathWithQuery } = requireUtil();
  class MockScope {
    constructor(mockDispatch) {
      this[kMockDispatch] = mockDispatch;
    }
    /**
     * Delay a reply by a set amount in ms.
     */
    delay(waitInMs) {
      if (typeof waitInMs !== "number" || !Number.isInteger(waitInMs) || waitInMs <= 0) {
        throw new InvalidArgumentError("waitInMs must be a valid integer > 0");
      }
      this[kMockDispatch].delay = waitInMs;
      return this;
    }
    /**
     * For a defined reply, never mark as consumed.
     */
    persist() {
      this[kMockDispatch].persist = true;
      return this;
    }
    /**
     * Allow one to define a reply for a set amount of matching requests.
     */
    times(repeatTimes) {
      if (typeof repeatTimes !== "number" || !Number.isInteger(repeatTimes) || repeatTimes <= 0) {
        throw new InvalidArgumentError("repeatTimes must be a valid integer > 0");
      }
      this[kMockDispatch].times = repeatTimes;
      return this;
    }
  }
  class MockInterceptor {
    constructor(opts, mockDispatches) {
      if (typeof opts !== "object") {
        throw new InvalidArgumentError("opts must be an object");
      }
      if (typeof opts.path === "undefined") {
        throw new InvalidArgumentError("opts.path must be defined");
      }
      if (typeof opts.method === "undefined") {
        opts.method = "GET";
      }
      if (typeof opts.path === "string") {
        if (opts.query) {
          opts.path = serializePathWithQuery(opts.path, opts.query);
        } else {
          const parsedURL = new URL(opts.path, "data://");
          opts.path = parsedURL.pathname + parsedURL.search;
        }
      }
      if (typeof opts.method === "string") {
        opts.method = opts.method.toUpperCase();
      }
      this[kDispatchKey] = buildKey(opts);
      this[kDispatches] = mockDispatches;
      this[kIgnoreTrailingSlash] = opts.ignoreTrailingSlash ?? false;
      this[kDefaultHeaders] = {};
      this[kDefaultTrailers] = {};
      this[kContentLength] = false;
    }
    createMockScopeDispatchData({ statusCode, data, responseOptions }) {
      const responseData = getResponseData(data);
      const contentLength = this[kContentLength] ? { "content-length": responseData.length } : {};
      const headers = { ...this[kDefaultHeaders], ...contentLength, ...responseOptions.headers };
      const trailers = { ...this[kDefaultTrailers], ...responseOptions.trailers };
      return { statusCode, data, headers, trailers };
    }
    validateReplyParameters(replyParameters) {
      if (typeof replyParameters.statusCode === "undefined") {
        throw new InvalidArgumentError("statusCode must be defined");
      }
      if (typeof replyParameters.responseOptions !== "object" || replyParameters.responseOptions === null) {
        throw new InvalidArgumentError("responseOptions must be an object");
      }
    }
    /**
     * Mock an undici request with a defined reply.
     */
    reply(replyOptionsCallbackOrStatusCode) {
      if (typeof replyOptionsCallbackOrStatusCode === "function") {
        const wrappedDefaultsCallback = (opts) => {
          const resolvedData = replyOptionsCallbackOrStatusCode(opts);
          if (typeof resolvedData !== "object" || resolvedData === null) {
            throw new InvalidArgumentError("reply options callback must return an object");
          }
          const replyParameters2 = { data: "", responseOptions: {}, ...resolvedData };
          this.validateReplyParameters(replyParameters2);
          return {
            ...this.createMockScopeDispatchData(replyParameters2)
          };
        };
        const newMockDispatch2 = addMockDispatch(this[kDispatches], this[kDispatchKey], wrappedDefaultsCallback, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] });
        return new MockScope(newMockDispatch2);
      }
      const replyParameters = {
        statusCode: replyOptionsCallbackOrStatusCode,
        data: arguments[1] === void 0 ? "" : arguments[1],
        responseOptions: arguments[2] === void 0 ? {} : arguments[2]
      };
      this.validateReplyParameters(replyParameters);
      const dispatchData = this.createMockScopeDispatchData(replyParameters);
      const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], dispatchData, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] });
      return new MockScope(newMockDispatch);
    }
    /**
     * Mock an undici request with a defined error.
     */
    replyWithError(error) {
      if (typeof error === "undefined") {
        throw new InvalidArgumentError("error must be defined");
      }
      const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], { error }, { ignoreTrailingSlash: this[kIgnoreTrailingSlash] });
      return new MockScope(newMockDispatch);
    }
    /**
     * Set default reply headers on the interceptor for subsequent replies
     */
    defaultReplyHeaders(headers) {
      if (typeof headers === "undefined") {
        throw new InvalidArgumentError("headers must be defined");
      }
      this[kDefaultHeaders] = headers;
      return this;
    }
    /**
     * Set default reply trailers on the interceptor for subsequent replies
     */
    defaultReplyTrailers(trailers) {
      if (typeof trailers === "undefined") {
        throw new InvalidArgumentError("trailers must be defined");
      }
      this[kDefaultTrailers] = trailers;
      return this;
    }
    /**
     * Set reply content length header for replies on the interceptor
     */
    replyContentLength() {
      this[kContentLength] = true;
      return this;
    }
  }
  mockInterceptor.MockInterceptor = MockInterceptor;
  mockInterceptor.MockScope = MockScope;
  return mockInterceptor;
}
export {
  requireMockInterceptor as __require
};
//# sourceMappingURL=index80.js.map
