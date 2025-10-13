import require$$0 from "node:assert";
import require$$1 from "node:async_hooks";
import { __require as requireErrors } from "./index23.js";
import { __require as requireUtil } from "./index24.js";
import { __require as requireAbortSignal } from "./index111.js";
var apiConnect;
var hasRequiredApiConnect;
function requireApiConnect() {
  if (hasRequiredApiConnect) return apiConnect;
  hasRequiredApiConnect = 1;
  const assert = require$$0;
  const { AsyncResource } = require$$1;
  const { InvalidArgumentError, SocketError } = requireErrors();
  const util = requireUtil();
  const { addSignal, removeSignal } = requireAbortSignal();
  class ConnectHandler extends AsyncResource {
    constructor(opts, callback) {
      if (!opts || typeof opts !== "object") {
        throw new InvalidArgumentError("invalid opts");
      }
      if (typeof callback !== "function") {
        throw new InvalidArgumentError("invalid callback");
      }
      const { signal, opaque, responseHeaders } = opts;
      if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
        throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
      }
      super("UNDICI_CONNECT");
      this.opaque = opaque || null;
      this.responseHeaders = responseHeaders || null;
      this.callback = callback;
      this.abort = null;
      addSignal(this, signal);
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
    onHeaders() {
      throw new SocketError("bad connect", null);
    }
    onUpgrade(statusCode, rawHeaders, socket) {
      const { callback, opaque, context } = this;
      removeSignal(this);
      this.callback = null;
      let headers = rawHeaders;
      if (headers != null) {
        headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
      }
      this.runInAsyncScope(callback, null, null, {
        statusCode,
        headers,
        socket,
        opaque,
        context
      });
    }
    onError(err) {
      const { callback, opaque } = this;
      removeSignal(this);
      if (callback) {
        this.callback = null;
        queueMicrotask(() => {
          this.runInAsyncScope(callback, null, err, { opaque });
        });
      }
    }
  }
  function connect(opts, callback) {
    if (callback === void 0) {
      return new Promise((resolve, reject) => {
        connect.call(this, opts, (err, data) => {
          return err ? reject(err) : resolve(data);
        });
      });
    }
    try {
      const connectHandler = new ConnectHandler(opts, callback);
      const connectOptions = { ...opts, method: "CONNECT" };
      this.dispatch(connectOptions, connectHandler);
    } catch (err) {
      if (typeof callback !== "function") {
        throw err;
      }
      const opaque = opts?.opaque;
      queueMicrotask(() => callback(err, { opaque }));
    }
  }
  apiConnect = connect;
  return apiConnect;
}
export {
  requireApiConnect as __require
};
//# sourceMappingURL=index77.js.map
