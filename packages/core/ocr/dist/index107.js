import { __exports as version } from "./index115.js";
var hasRequiredVersion;
function requireVersion() {
  if (hasRequiredVersion) return version;
  hasRequiredVersion = 1;
  Object.defineProperty(version, "__esModule", { value: true });
  version.version = void 0;
  version.version = "1.22.0";
  return version;
}
export {
  requireVersion as __require
};
//# sourceMappingURL=index107.js.map
