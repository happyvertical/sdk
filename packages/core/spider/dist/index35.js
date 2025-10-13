import require$$0 from "node:assert";
import { __require as requireWrapHandler } from "./index67.js";
var decoratorHandler;
var hasRequiredDecoratorHandler;
function requireDecoratorHandler() {
  if (hasRequiredDecoratorHandler) return decoratorHandler;
  hasRequiredDecoratorHandler = 1;
  const assert = require$$0;
  const WrapHandler = requireWrapHandler();
  decoratorHandler = class DecoratorHandler {
    #handler;
    #onCompleteCalled = false;
    #onErrorCalled = false;
    #onResponseStartCalled = false;
    constructor(handler) {
      if (typeof handler !== "object" || handler === null) {
        throw new TypeError("handler must be an object");
      }
      this.#handler = WrapHandler.wrap(handler);
    }
    onRequestStart(...args) {
      this.#handler.onRequestStart?.(...args);
    }
    onRequestUpgrade(...args) {
      assert(!this.#onCompleteCalled);
      assert(!this.#onErrorCalled);
      return this.#handler.onRequestUpgrade?.(...args);
    }
    onResponseStart(...args) {
      assert(!this.#onCompleteCalled);
      assert(!this.#onErrorCalled);
      assert(!this.#onResponseStartCalled);
      this.#onResponseStartCalled = true;
      return this.#handler.onResponseStart?.(...args);
    }
    onResponseData(...args) {
      assert(!this.#onCompleteCalled);
      assert(!this.#onErrorCalled);
      return this.#handler.onResponseData?.(...args);
    }
    onResponseEnd(...args) {
      assert(!this.#onCompleteCalled);
      assert(!this.#onErrorCalled);
      this.#onCompleteCalled = true;
      return this.#handler.onResponseEnd?.(...args);
    }
    onResponseError(...args) {
      this.#onErrorCalled = true;
      return this.#handler.onResponseError?.(...args);
    }
    /**
     * @deprecated
     */
    onBodySent() {
    }
  };
  return decoratorHandler;
}
export {
  requireDecoratorHandler as __require
};
//# sourceMappingURL=index35.js.map
