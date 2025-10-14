import { __exports as trace } from "./index101.js";
import { __require as requireEnvImpl } from "./index94.js";
var hasRequiredTrace;
function requireTrace() {
  if (hasRequiredTrace) return trace;
  hasRequiredTrace = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TRACE_FUNC_END = exports.TRACE_FUNC_BEGIN = exports.TRACE = void 0;
    const env_impl_js_1 = requireEnvImpl();
    const TRACE = (deviceType, label) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      console.timeStamp(`${deviceType}::ORT::${label}`);
    };
    exports.TRACE = TRACE;
    const TRACE_FUNC = (msg, extraMsg) => {
      const stack = new Error().stack?.split(/\r\n|\r|\n/g) || [];
      let hasTraceFunc = false;
      for (let i = 0; i < stack.length; i++) {
        if (hasTraceFunc && !stack[i].includes("TRACE_FUNC")) {
          let label = `FUNC_${msg}::${stack[i].trim().split(" ")[1]}`;
          if (extraMsg) {
            label += `::${extraMsg}`;
          }
          (0, exports.TRACE)("CPU", label);
          return;
        }
        if (stack[i].includes("TRACE_FUNC")) {
          hasTraceFunc = true;
        }
      }
    };
    const TRACE_FUNC_BEGIN = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      TRACE_FUNC("BEGIN", extraMsg);
    };
    exports.TRACE_FUNC_BEGIN = TRACE_FUNC_BEGIN;
    const TRACE_FUNC_END = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      TRACE_FUNC("END", extraMsg);
    };
    exports.TRACE_FUNC_END = TRACE_FUNC_END;
  })(trace);
  return trace;
}
export {
  requireTrace as __require
};
//# sourceMappingURL=index69.js.map
