import { commonjsRequire } from "./index102.js";
import { __exports as binding } from "./index103.js";
import { __require as requireCjs } from "./index44.js";
var hasRequiredBinding;
function requireBinding() {
  if (hasRequiredBinding) return binding;
  hasRequiredBinding = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initOrt = exports.binding = void 0;
    const onnxruntime_common_1 = requireCjs();
    exports.binding = // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    commonjsRequire(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`);
    let ortInitialized = false;
    const initOrt = () => {
      if (!ortInitialized) {
        ortInitialized = true;
        let logLevel = 2;
        if (onnxruntime_common_1.env.logLevel) {
          switch (onnxruntime_common_1.env.logLevel) {
            case "verbose":
              logLevel = 0;
              break;
            case "info":
              logLevel = 1;
              break;
            case "warning":
              logLevel = 2;
              break;
            case "error":
              logLevel = 3;
              break;
            case "fatal":
              logLevel = 4;
              break;
            default:
              throw new Error(`Unsupported log level: ${onnxruntime_common_1.env.logLevel}`);
          }
        }
        exports.binding.initOrtOnce(logLevel, onnxruntime_common_1.Tensor);
      }
    };
    exports.initOrt = initOrt;
  })(binding);
  return binding;
}
export {
  requireBinding as __require
};
//# sourceMappingURL=index74.js.map
