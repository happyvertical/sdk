import { __require as requireWebidl } from "./index91.js";
import { __require as requireUtil } from "./index98.js";
import { __require as requireSymbols } from "./index53.js";
import { __require as requireUtil$1 } from "./index24.js";
var websocketerror;
var hasRequiredWebsocketerror;
function requireWebsocketerror() {
  if (hasRequiredWebsocketerror) return websocketerror;
  hasRequiredWebsocketerror = 1;
  const { webidl } = requireWebidl();
  const { validateCloseCodeAndReason } = requireUtil();
  const { kConstruct } = requireSymbols();
  const { kEnumerableProperty } = requireUtil$1();
  function createInheritableDOMException() {
    class Test extends DOMException {
      get reason() {
        return "";
      }
    }
    if (new Test().reason !== void 0) {
      return DOMException;
    }
    return new Proxy(DOMException, {
      construct(target, args, newTarget) {
        const instance = Reflect.construct(target, args, target);
        Object.setPrototypeOf(instance, newTarget.prototype);
        return instance;
      }
    });
  }
  class WebSocketError extends createInheritableDOMException() {
    #closeCode;
    #reason;
    constructor(message = "", init = void 0) {
      message = webidl.converters.DOMString(message, "WebSocketError", "message");
      super(message, "WebSocketError");
      if (init === kConstruct) {
        return;
      } else if (init !== null) {
        init = webidl.converters.WebSocketCloseInfo(init);
      }
      let code = init.closeCode ?? null;
      const reason = init.reason ?? "";
      validateCloseCodeAndReason(code, reason);
      if (reason.length !== 0 && code === null) {
        code = 1e3;
      }
      this.#closeCode = code;
      this.#reason = reason;
    }
    get closeCode() {
      return this.#closeCode;
    }
    get reason() {
      return this.#reason;
    }
    /**
     * @param {string} message
     * @param {number|null} code
     * @param {string} reason
     */
    static createUnvalidatedWebSocketError(message, code, reason) {
      const error = new WebSocketError(message, kConstruct);
      error.#closeCode = code;
      error.#reason = reason;
      return error;
    }
  }
  const { createUnvalidatedWebSocketError } = WebSocketError;
  delete WebSocketError.createUnvalidatedWebSocketError;
  Object.defineProperties(WebSocketError.prototype, {
    closeCode: kEnumerableProperty,
    reason: kEnumerableProperty,
    [Symbol.toStringTag]: {
      value: "WebSocketError",
      writable: false,
      enumerable: false,
      configurable: true
    }
  });
  webidl.is.WebSocketError = webidl.util.MakeTypeAssertion(WebSocketError);
  websocketerror = { WebSocketError, createUnvalidatedWebSocketError };
  return websocketerror;
}
export {
  requireWebsocketerror as __require
};
//# sourceMappingURL=index59.js.map
