import { __require as requireErrors } from "./index23.js";
import { __require as requireAgent } from "./index18.js";
var global;
var hasRequiredGlobal;
function requireGlobal() {
  if (hasRequiredGlobal) return global;
  hasRequiredGlobal = 1;
  const globalDispatcher = Symbol.for("undici.globalDispatcher.1");
  const { InvalidArgumentError } = requireErrors();
  const Agent = requireAgent();
  if (getGlobalDispatcher() === void 0) {
    setGlobalDispatcher(new Agent());
  }
  function setGlobalDispatcher(agent) {
    if (!agent || typeof agent.dispatch !== "function") {
      throw new InvalidArgumentError("Argument agent must implement Agent");
    }
    Object.defineProperty(globalThis, globalDispatcher, {
      value: agent,
      writable: true,
      enumerable: false,
      configurable: false
    });
  }
  function getGlobalDispatcher() {
    return globalThis[globalDispatcher];
  }
  const installedExports = (
    /** @type {const} */
    [
      "fetch",
      "Headers",
      "Response",
      "Request",
      "FormData",
      "WebSocket",
      "CloseEvent",
      "ErrorEvent",
      "MessageEvent",
      "EventSource"
    ]
  );
  global = {
    setGlobalDispatcher,
    getGlobalDispatcher,
    installedExports
  };
  return global;
}
export {
  requireGlobal as __require
};
//# sourceMappingURL=index34.js.map
