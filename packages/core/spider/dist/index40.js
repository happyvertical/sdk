import { __require as requireErrors } from "./index23.js";
import { __require as requireDecoratorHandler } from "./index35.js";
var dump;
var hasRequiredDump;
function requireDump() {
  if (hasRequiredDump) return dump;
  hasRequiredDump = 1;
  const { InvalidArgumentError, RequestAbortedError } = requireErrors();
  const DecoratorHandler = requireDecoratorHandler();
  class DumpHandler extends DecoratorHandler {
    #maxSize = 1024 * 1024;
    #dumped = false;
    #size = 0;
    #controller = null;
    aborted = false;
    reason = false;
    constructor({ maxSize, signal }, handler) {
      if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
        throw new InvalidArgumentError("maxSize must be a number greater than 0");
      }
      super(handler);
      this.#maxSize = maxSize ?? this.#maxSize;
    }
    #abort(reason) {
      this.aborted = true;
      this.reason = reason;
    }
    onRequestStart(controller, context) {
      controller.abort = this.#abort.bind(this);
      this.#controller = controller;
      return super.onRequestStart(controller, context);
    }
    onResponseStart(controller, statusCode, headers, statusMessage) {
      const contentLength = headers["content-length"];
      if (contentLength != null && contentLength > this.#maxSize) {
        throw new RequestAbortedError(
          `Response size (${contentLength}) larger than maxSize (${this.#maxSize})`
        );
      }
      if (this.aborted === true) {
        return true;
      }
      return super.onResponseStart(controller, statusCode, headers, statusMessage);
    }
    onResponseError(controller, err) {
      if (this.#dumped) {
        return;
      }
      err = this.#controller?.reason ?? err;
      super.onResponseError(controller, err);
    }
    onResponseData(controller, chunk) {
      this.#size = this.#size + chunk.length;
      if (this.#size >= this.#maxSize) {
        this.#dumped = true;
        if (this.aborted === true) {
          super.onResponseError(controller, this.reason);
        } else {
          super.onResponseEnd(controller, {});
        }
      }
      return true;
    }
    onResponseEnd(controller, trailers) {
      if (this.#dumped) {
        return;
      }
      if (this.#controller.aborted === true) {
        super.onResponseError(controller, this.reason);
        return;
      }
      super.onResponseEnd(controller, trailers);
    }
  }
  function createDumpInterceptor({ maxSize: defaultMaxSize } = {
    maxSize: 1024 * 1024
  }) {
    return (dispatch) => {
      return function Intercept(opts, handler) {
        const { dumpMaxSize = defaultMaxSize } = opts;
        const dumpHandler = new DumpHandler({ maxSize: dumpMaxSize, signal: opts.signal }, handler);
        return dispatch(opts, dumpHandler);
      };
    };
  }
  dump = createDumpInterceptor;
  return dump;
}
export {
  requireDump as __require
};
//# sourceMappingURL=index40.js.map
