import { __require as requireUtil } from "./index24.js";
import { __require as requireSymbols } from "./index53.js";
import require$$0 from "node:assert";
import { __require as requireErrors } from "./index23.js";
import require$$6 from "node:events";
var redirectHandler;
var hasRequiredRedirectHandler;
function requireRedirectHandler() {
  if (hasRequiredRedirectHandler) return redirectHandler;
  hasRequiredRedirectHandler = 1;
  const util = requireUtil();
  const { kBodyUsed } = requireSymbols();
  const assert = require$$0;
  const { InvalidArgumentError } = requireErrors();
  const EE = require$$6;
  const redirectableStatusCodes = [300, 301, 302, 303, 307, 308];
  const kBody = Symbol("body");
  const noop = () => {
  };
  class BodyAsyncIterable {
    constructor(body) {
      this[kBody] = body;
      this[kBodyUsed] = false;
    }
    async *[Symbol.asyncIterator]() {
      assert(!this[kBodyUsed], "disturbed");
      this[kBodyUsed] = true;
      yield* this[kBody];
    }
  }
  class RedirectHandler {
    static buildDispatch(dispatcher, maxRedirections) {
      if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
        throw new InvalidArgumentError("maxRedirections must be a positive number");
      }
      const dispatch = dispatcher.dispatch.bind(dispatcher);
      return (opts, originalHandler) => dispatch(opts, new RedirectHandler(dispatch, maxRedirections, opts, originalHandler));
    }
    constructor(dispatch, maxRedirections, opts, handler) {
      if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
        throw new InvalidArgumentError("maxRedirections must be a positive number");
      }
      this.dispatch = dispatch;
      this.location = null;
      const { maxRedirections: _, ...cleanOpts } = opts;
      this.opts = cleanOpts;
      this.maxRedirections = maxRedirections;
      this.handler = handler;
      this.history = [];
      if (util.isStream(this.opts.body)) {
        if (util.bodyLength(this.opts.body) === 0) {
          this.opts.body.on("data", function() {
            assert(false);
          });
        }
        if (typeof this.opts.body.readableDidRead !== "boolean") {
          this.opts.body[kBodyUsed] = false;
          EE.prototype.on.call(this.opts.body, "data", function() {
            this[kBodyUsed] = true;
          });
        }
      } else if (this.opts.body && typeof this.opts.body.pipeTo === "function") {
        this.opts.body = new BodyAsyncIterable(this.opts.body);
      } else if (this.opts.body && typeof this.opts.body !== "string" && !ArrayBuffer.isView(this.opts.body) && util.isIterable(this.opts.body) && !util.isFormDataLike(this.opts.body)) {
        this.opts.body = new BodyAsyncIterable(this.opts.body);
      }
    }
    onRequestStart(controller, context) {
      this.handler.onRequestStart?.(controller, { ...context, history: this.history });
    }
    onRequestUpgrade(controller, statusCode, headers, socket) {
      this.handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
    }
    onResponseStart(controller, statusCode, headers, statusMessage) {
      if (this.opts.throwOnMaxRedirect && this.history.length >= this.maxRedirections) {
        throw new Error("max redirects");
      }
      if ((statusCode === 301 || statusCode === 302) && this.opts.method === "POST") {
        this.opts.method = "GET";
        if (util.isStream(this.opts.body)) {
          util.destroy(this.opts.body.on("error", noop));
        }
        this.opts.body = null;
      }
      if (statusCode === 303 && this.opts.method !== "HEAD") {
        this.opts.method = "GET";
        if (util.isStream(this.opts.body)) {
          util.destroy(this.opts.body.on("error", noop));
        }
        this.opts.body = null;
      }
      this.location = this.history.length >= this.maxRedirections || util.isDisturbed(this.opts.body) || redirectableStatusCodes.indexOf(statusCode) === -1 ? null : headers.location;
      if (this.opts.origin) {
        this.history.push(new URL(this.opts.path, this.opts.origin));
      }
      if (!this.location) {
        this.handler.onResponseStart?.(controller, statusCode, headers, statusMessage);
        return;
      }
      const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin && new URL(this.opts.path, this.opts.origin)));
      const path = search ? `${pathname}${search}` : pathname;
      const redirectUrlString = `${origin}${path}`;
      for (const historyUrl of this.history) {
        if (historyUrl.toString() === redirectUrlString) {
          throw new InvalidArgumentError(`Redirect loop detected. Cannot redirect to ${origin}. This typically happens when using a Client or Pool with cross-origin redirects. Use an Agent for cross-origin redirects.`);
        }
      }
      this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303, this.opts.origin !== origin);
      this.opts.path = path;
      this.opts.origin = origin;
      this.opts.query = null;
    }
    onResponseData(controller, chunk) {
      if (this.location) ;
      else {
        this.handler.onResponseData?.(controller, chunk);
      }
    }
    onResponseEnd(controller, trailers) {
      if (this.location) {
        this.dispatch(this.opts, this);
      } else {
        this.handler.onResponseEnd(controller, trailers);
      }
    }
    onResponseError(controller, error) {
      this.handler.onResponseError?.(controller, error);
    }
  }
  function shouldRemoveHeader(header, removeContent, unknownOrigin) {
    if (header.length === 4) {
      return util.headerNameToString(header) === "host";
    }
    if (removeContent && util.headerNameToString(header).startsWith("content-")) {
      return true;
    }
    if (unknownOrigin && (header.length === 13 || header.length === 6 || header.length === 19)) {
      const name = util.headerNameToString(header);
      return name === "authorization" || name === "cookie" || name === "proxy-authorization";
    }
    return false;
  }
  function cleanRequestHeaders(headers, removeContent, unknownOrigin) {
    const ret = [];
    if (Array.isArray(headers)) {
      for (let i = 0; i < headers.length; i += 2) {
        if (!shouldRemoveHeader(headers[i], removeContent, unknownOrigin)) {
          ret.push(headers[i], headers[i + 1]);
        }
      }
    } else if (headers && typeof headers === "object") {
      const entries = typeof headers[Symbol.iterator] === "function" ? headers : Object.entries(headers);
      for (const [key, value] of entries) {
        if (!shouldRemoveHeader(key, removeContent, unknownOrigin)) {
          ret.push(key, value);
        }
      }
    } else {
      assert(headers == null, "headers must be an object or an array");
    }
    return ret;
  }
  redirectHandler = RedirectHandler;
  return redirectHandler;
}
export {
  requireRedirectHandler as __require
};
//# sourceMappingURL=index36.js.map
