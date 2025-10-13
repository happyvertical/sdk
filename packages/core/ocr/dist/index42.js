import { __exports as dist } from "./index43.js";
import { __require as requireCjs } from "./index44.js";
import { __require as requireBackend } from "./index45.js";
import { __require as requireVersion } from "./index46.js";
var hasRequiredDist;
function requireDist() {
  if (hasRequiredDist) return dist;
  hasRequiredDist = 1;
  (function(exports) {
    var __createBinding = dist && dist.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = dist && dist.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.listSupportedBackends = void 0;
    __exportStar(requireCjs(), exports);
    var backend_1 = requireBackend();
    Object.defineProperty(exports, "listSupportedBackends", { enumerable: true, get: function() {
      return backend_1.listSupportedBackends;
    } });
    const onnxruntime_common_1 = requireCjs();
    const version_1 = requireVersion();
    const backend_2 = requireBackend();
    const backends = (0, backend_2.listSupportedBackends)();
    for (const backend of backends) {
      (0, onnxruntime_common_1.registerBackend)(backend.name, backend_2.onnxruntimeBackend, 100);
    }
    Object.defineProperty(onnxruntime_common_1.env.versions, "node", { value: version_1.version, enumerable: true });
  })(dist);
  return dist;
}
export {
  requireDist as __require
};
//# sourceMappingURL=index42.js.map
