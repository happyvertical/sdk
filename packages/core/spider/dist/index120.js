import { __exports as utils } from "./index123.js";
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  Object.defineProperty(utils, "__esModule", { value: true });
  utils.enumToMap = enumToMap;
  function enumToMap(obj, filter = [], exceptions = []) {
    const emptyFilter = (filter?.length ?? 0) === 0;
    const emptyExceptions = (exceptions?.length ?? 0) === 0;
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => {
      return typeof value === "number" && (emptyFilter || filter.includes(value)) && (emptyExceptions || !exceptions.includes(value));
    }));
  }
  return utils;
}
export {
  requireUtils as __require
};
//# sourceMappingURL=index120.js.map
