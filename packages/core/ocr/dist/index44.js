import { __exports as cjs } from "./index63.js";
import { __require as requireBackend } from "./index64.js";
import { __require as requireEnv } from "./index65.js";
import { __require as requireInferenceSession } from "./index66.js";
import { __require as requireTensor } from "./index67.js";
import { __require as requireTensorConversion } from "./index68.js";
import { __require as requireTensorFactory } from "./index69.js";
import { __require as requireTrace } from "./index70.js";
import { __require as requireOnnxModel } from "./index71.js";
import { __require as requireOnnxValue } from "./index72.js";
var hasRequiredCjs;
function requireCjs() {
  if (hasRequiredCjs) return cjs;
  hasRequiredCjs = 1;
  (function(exports) {
    var __createBinding = cjs && cjs.__createBinding || (Object.create ? (function(o, m, k, k2) {
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
    var __exportStar = cjs && cjs.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(requireBackend(), exports);
    __exportStar(requireEnv(), exports);
    __exportStar(requireInferenceSession(), exports);
    __exportStar(requireTensor(), exports);
    __exportStar(requireTensorConversion(), exports);
    __exportStar(requireTensorFactory(), exports);
    __exportStar(requireTrace(), exports);
    __exportStar(requireOnnxModel(), exports);
    __exportStar(requireOnnxValue(), exports);
  })(cjs);
  return cjs;
}
export {
  requireCjs as __require
};
//# sourceMappingURL=index44.js.map
