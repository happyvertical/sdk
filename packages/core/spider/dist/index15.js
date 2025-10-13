import require$$6 from "node:events";
import { __require as requireWrapHandler } from "./index67.js";
var dispatcher;
var hasRequiredDispatcher;
function requireDispatcher() {
  if (hasRequiredDispatcher) return dispatcher;
  hasRequiredDispatcher = 1;
  const EventEmitter = require$$6;
  const WrapHandler = requireWrapHandler();
  const wrapInterceptor = (dispatch) => (opts, handler) => dispatch(opts, WrapHandler.wrap(handler));
  class Dispatcher extends EventEmitter {
    dispatch() {
      throw new Error("not implemented");
    }
    close() {
      throw new Error("not implemented");
    }
    destroy() {
      throw new Error("not implemented");
    }
    compose(...args) {
      const interceptors = Array.isArray(args[0]) ? args[0] : args;
      let dispatch = this.dispatch.bind(this);
      for (const interceptor of interceptors) {
        if (interceptor == null) {
          continue;
        }
        if (typeof interceptor !== "function") {
          throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`);
        }
        dispatch = interceptor(dispatch);
        dispatch = wrapInterceptor(dispatch);
        if (dispatch == null || typeof dispatch !== "function" || dispatch.length !== 2) {
          throw new TypeError("invalid interceptor");
        }
      }
      return new Proxy(this, {
        get: (target, key) => key === "dispatch" ? dispatch : target[key]
      });
    }
  }
  dispatcher = Dispatcher;
  return dispatcher;
}
export {
  requireDispatcher as __require
};
//# sourceMappingURL=index15.js.map
