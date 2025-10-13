import { __require as requireErrors } from "./index23.js";
import require$$1 from "node:async_hooks";
import require$$0 from "node:assert";
import { __require as requireUtil } from "./index24.js";
import { __require as requireAbortSignal } from "./index111.js";
var apiUpgrade;
var hasRequiredApiUpgrade;
function requireApiUpgrade() {
  if (hasRequiredApiUpgrade) return apiUpgrade;
  hasRequiredApiUpgrade = 1;
  const { InvalidArgumentError, SocketError } = requireErrors();
  const { AsyncResource } = require$$1;
  const assert = require$$0;
  const util = requireUtil();
  const { addSignal, removeSignal } = requireAbortSignal();
  class UpgradeHandler extends AsyncResource {
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
      super("UNDICI_UPGRADE");
      this.responseHeaders = responseHeaders || null;
      this.opaque = opaque || null;
      this.callback = callback;
      this.abort = null;
      this.context = null;
      addSignal(this, signal);
    }
    onConnect(abort, context) {
      if (this.reason) {
        abort(this.reason);
        return;
      }
      assert(this.callback);
      this.abort = abort;
      this.context = null;
    }
    onHeaders() {
      throw new SocketError("bad upgrade", null);
    }
    onUpgrade(statusCode, rawHeaders, socket) {
      assert(statusCode === 101);
      const { callback, opaque, context } = this;
      removeSignal(this);
      this.callback = null;
      const headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
      this.runInAsyncScope(callback, null, null, {
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
  function upgrade(opts, callback) {
    if (callback === void 0) {
      return new Promise((resolve, reject) => {
        upgrade.call(this, opts, (err, data) => {
          return err ? reject(err) : resolve(data);
        });
      });
    }
    try {
      const upgradeHandler = new UpgradeHandler(opts, callback);
      const upgradeOpts = {
        ...opts,
        method: opts.method || "GET",
        upgrade: opts.protocol || "Websocket"
      };
      this.dispatch(upgradeOpts, upgradeHandler);
    } catch (err) {
      if (typeof callback !== "function") {
        throw err;
      }
      const opaque = opts?.opaque;
      queueMicrotask(() => callback(err, { opaque }));
    }
  }
  apiUpgrade = upgrade;
  return apiUpgrade;
}
export {
  requireApiUpgrade as __require
};
//# sourceMappingURL=index76.js.map
