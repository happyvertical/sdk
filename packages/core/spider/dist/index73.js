import { __module as apiRequest } from "./index109.js";
import require$$0 from "node:assert";
import require$$1 from "node:async_hooks";
import { __require as requireReadable } from "./index110.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
var hasRequiredApiRequest;
function requireApiRequest() {
  if (hasRequiredApiRequest) return apiRequest.exports;
  hasRequiredApiRequest = 1;
  const assert = require$$0;
  const { AsyncResource } = require$$1;
  const { Readable } = requireReadable();
  const { InvalidArgumentError, RequestAbortedError } = requireErrors();
  const util = requireUtil();
  function noop() {
  }
  class RequestHandler extends AsyncResource {
    constructor(opts, callback) {
      if (!opts || typeof opts !== "object") {
        throw new InvalidArgumentError("invalid opts");
      }
      const { signal, method, opaque, body, onInfo, responseHeaders, highWaterMark } = opts;
      try {
        if (typeof callback !== "function") {
          throw new InvalidArgumentError("invalid callback");
        }
        if (highWaterMark && (typeof highWaterMark !== "number" || highWaterMark < 0)) {
          throw new InvalidArgumentError("invalid highWaterMark");
        }
        if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
          throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
        }
        if (method === "CONNECT") {
          throw new InvalidArgumentError("invalid method");
        }
        if (onInfo && typeof onInfo !== "function") {
          throw new InvalidArgumentError("invalid onInfo callback");
        }
        super("UNDICI_REQUEST");
      } catch (err) {
        if (util.isStream(body)) {
          util.destroy(body.on("error", noop), err);
        }
        throw err;
      }
      this.method = method;
      this.responseHeaders = responseHeaders || null;
      this.opaque = opaque || null;
      this.callback = callback;
      this.res = null;
      this.abort = null;
      this.body = body;
      this.trailers = {};
      this.context = null;
      this.onInfo = onInfo || null;
      this.highWaterMark = highWaterMark;
      this.reason = null;
      this.removeAbortListener = null;
      if (signal?.aborted) {
        this.reason = signal.reason ?? new RequestAbortedError();
      } else if (signal) {
        this.removeAbortListener = util.addAbortListener(signal, () => {
          this.reason = signal.reason ?? new RequestAbortedError();
          if (this.res) {
            util.destroy(this.res.on("error", noop), this.reason);
          } else if (this.abort) {
            this.abort(this.reason);
          }
        });
      }
    }
    onConnect(abort, context) {
      if (this.reason) {
        abort(this.reason);
        return;
      }
      assert(this.callback);
      this.abort = abort;
      this.context = context;
    }
    onHeaders(statusCode, rawHeaders, resume, statusMessage) {
      const { callback, opaque, abort, context, responseHeaders, highWaterMark } = this;
      const headers = responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
      if (statusCode < 200) {
        if (this.onInfo) {
          this.onInfo({ statusCode, headers });
        }
        return;
      }
      const parsedHeaders = responseHeaders === "raw" ? util.parseHeaders(rawHeaders) : headers;
      const contentType = parsedHeaders["content-type"];
      const contentLength = parsedHeaders["content-length"];
      const res = new Readable({
        resume,
        abort,
        contentType,
        contentLength: this.method !== "HEAD" && contentLength ? Number(contentLength) : null,
        highWaterMark
      });
      if (this.removeAbortListener) {
        res.on("close", this.removeAbortListener);
        this.removeAbortListener = null;
      }
      this.callback = null;
      this.res = res;
      if (callback !== null) {
        try {
          this.runInAsyncScope(callback, null, null, {
            statusCode,
            headers,
            trailers: this.trailers,
            opaque,
            body: res,
            context
          });
        } catch (err) {
          this.res = null;
          util.destroy(res.on("error", noop), err);
          queueMicrotask(() => {
            throw err;
          });
        }
      }
    }
    onData(chunk) {
      return this.res.push(chunk);
    }
    onComplete(trailers) {
      util.parseHeaders(trailers, this.trailers);
      this.res.push(null);
    }
    onError(err) {
      const { res, callback, body, opaque } = this;
      if (callback) {
        this.callback = null;
        queueMicrotask(() => {
          this.runInAsyncScope(callback, null, err, { opaque });
        });
      }
      if (res) {
        this.res = null;
        queueMicrotask(() => {
          util.destroy(res.on("error", noop), err);
        });
      }
      if (body) {
        this.body = null;
        if (util.isStream(body)) {
          body.on("error", noop);
          util.destroy(body, err);
        }
      }
      if (this.removeAbortListener) {
        this.removeAbortListener();
        this.removeAbortListener = null;
      }
    }
  }
  function request(opts, callback) {
    if (callback === void 0) {
      return new Promise((resolve, reject) => {
        request.call(this, opts, (err, data) => {
          return err ? reject(err) : resolve(data);
        });
      });
    }
    try {
      const handler = new RequestHandler(opts, callback);
      this.dispatch(opts, handler);
    } catch (err) {
      if (typeof callback !== "function") {
        throw err;
      }
      const opaque = opts?.opaque;
      queueMicrotask(() => callback(err, { opaque }));
    }
  }
  apiRequest.exports = request;
  apiRequest.exports.RequestHandler = RequestHandler;
  return apiRequest.exports;
}
export {
  requireApiRequest as __require
};
//# sourceMappingURL=index73.js.map
