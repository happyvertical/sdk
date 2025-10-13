import { __exports as envImpl } from "./index105.js";
import { __require as requireVersion } from "./index106.js";
var hasRequiredEnvImpl;
function requireEnvImpl() {
  if (hasRequiredEnvImpl) return envImpl;
  hasRequiredEnvImpl = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.env = void 0;
    const version_js_1 = requireVersion();
    let logLevelValue = "warning";
    exports.env = {
      wasm: {},
      webgl: {},
      webgpu: {},
      versions: { common: version_js_1.version },
      set logLevel(value) {
        if (value === void 0) {
          return;
        }
        if (typeof value !== "string" || ["verbose", "info", "warning", "error", "fatal"].indexOf(value) === -1) {
          throw new Error(`Unsupported logging level: ${value}`);
        }
        logLevelValue = value;
      },
      get logLevel() {
        return logLevelValue;
      }
    };
    Object.defineProperty(exports.env, "logLevel", { enumerable: true });
  })(envImpl);
  return envImpl;
}
export {
  requireEnvImpl as __require
};
//# sourceMappingURL=index92.js.map
