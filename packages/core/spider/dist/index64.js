import { __require as requireDispatcher } from "./index15.js";
import { __require as requireUnwrapHandler } from "./index104.js";
import { __require as requireErrors } from "./index23.js";
import { __require as requireSymbols } from "./index53.js";
var dispatcherBase;
var hasRequiredDispatcherBase;
function requireDispatcherBase() {
  if (hasRequiredDispatcherBase) return dispatcherBase;
  hasRequiredDispatcherBase = 1;
  const Dispatcher = requireDispatcher();
  const UnwrapHandler = requireUnwrapHandler();
  const {
    ClientDestroyedError,
    ClientClosedError,
    InvalidArgumentError
  } = requireErrors();
  const { kDestroy, kClose, kClosed, kDestroyed, kDispatch } = requireSymbols();
  const kOnDestroyed = Symbol("onDestroyed");
  const kOnClosed = Symbol("onClosed");
  class DispatcherBase extends Dispatcher {
    /** @type {boolean} */
    [kDestroyed] = false;
    /** @type {Array|null} */
    [kOnDestroyed] = null;
    /** @type {boolean} */
    [kClosed] = false;
    /** @type {Array} */
    [kOnClosed] = [];
    /** @returns {boolean} */
    get destroyed() {
      return this[kDestroyed];
    }
    /** @returns {boolean} */
    get closed() {
      return this[kClosed];
    }
    close(callback) {
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          this.close((err, data) => {
            return err ? reject(err) : resolve(data);
          });
        });
      }
      if (typeof callback !== "function") {
        throw new InvalidArgumentError("invalid callback");
      }
      if (this[kDestroyed]) {
        queueMicrotask(() => callback(new ClientDestroyedError(), null));
        return;
      }
      if (this[kClosed]) {
        if (this[kOnClosed]) {
          this[kOnClosed].push(callback);
        } else {
          queueMicrotask(() => callback(null, null));
        }
        return;
      }
      this[kClosed] = true;
      this[kOnClosed].push(callback);
      const onClosed = () => {
        const callbacks = this[kOnClosed];
        this[kOnClosed] = null;
        for (let i = 0; i < callbacks.length; i++) {
          callbacks[i](null, null);
        }
      };
      this[kClose]().then(() => this.destroy()).then(() => {
        queueMicrotask(onClosed);
      });
    }
    destroy(err, callback) {
      if (typeof err === "function") {
        callback = err;
        err = null;
      }
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          this.destroy(err, (err2, data) => {
            return err2 ? (
              /* istanbul ignore next: should never error */
              reject(err2)
            ) : resolve(data);
          });
        });
      }
      if (typeof callback !== "function") {
        throw new InvalidArgumentError("invalid callback");
      }
      if (this[kDestroyed]) {
        if (this[kOnDestroyed]) {
          this[kOnDestroyed].push(callback);
        } else {
          queueMicrotask(() => callback(null, null));
        }
        return;
      }
      if (!err) {
        err = new ClientDestroyedError();
      }
      this[kDestroyed] = true;
      this[kOnDestroyed] = this[kOnDestroyed] || [];
      this[kOnDestroyed].push(callback);
      const onDestroyed = () => {
        const callbacks = this[kOnDestroyed];
        this[kOnDestroyed] = null;
        for (let i = 0; i < callbacks.length; i++) {
          callbacks[i](null, null);
        }
      };
      this[kDestroy](err).then(() => {
        queueMicrotask(onDestroyed);
      });
    }
    dispatch(opts, handler) {
      if (!handler || typeof handler !== "object") {
        throw new InvalidArgumentError("handler must be an object");
      }
      handler = UnwrapHandler.unwrap(handler);
      try {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("opts must be an object.");
        }
        if (this[kDestroyed] || this[kOnDestroyed]) {
          throw new ClientDestroyedError();
        }
        if (this[kClosed]) {
          throw new ClientClosedError();
        }
        return this[kDispatch](opts, handler);
      } catch (err) {
        if (typeof handler.onError !== "function") {
          throw err;
        }
        handler.onError(err);
        return false;
      }
    }
  }
  dispatcherBase = DispatcherBase;
  return dispatcherBase;
}
export {
  requireDispatcherBase as __require
};
//# sourceMappingURL=index64.js.map
