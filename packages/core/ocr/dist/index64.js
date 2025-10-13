import { __exports as backend } from "./index89.js";
import { __require as requireBackendImpl } from "./index90.js";
var hasRequiredBackend;
function requireBackend() {
  if (hasRequiredBackend) return backend;
  hasRequiredBackend = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.registerBackend = void 0;
    var backend_impl_js_1 = requireBackendImpl();
    Object.defineProperty(exports, "registerBackend", { enumerable: true, get: function() {
      return backend_impl_js_1.registerBackend;
    } });
  })(backend);
  return backend;
}
export {
  requireBackend as __require
};
//# sourceMappingURL=index64.js.map
