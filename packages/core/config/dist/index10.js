import { __exports as util } from "./index18.js";
import require$$0 from "fs";
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  var __createBinding = util && util.__createBinding || (Object.create ? (function(o, m, k, k2) {
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
  var __setModuleDefault = util && util.__setModuleDefault || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
  }) : function(o, v) {
    o["default"] = v;
  });
  var __importStar = util && util.__importStar || function(mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) {
      for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    }
    __setModuleDefault(result, mod);
    return result;
  };
  Object.defineProperty(util, "__esModule", { value: true });
  util.isDirectorySync = util.isDirectory = util.removeUndefinedValuesFromObject = util.getPropertyByPath = util.emplace = void 0;
  const fs_1 = __importStar(require$$0);
  function emplace(map, key, fn) {
    const cached = map.get(key);
    if (cached !== void 0) {
      return cached;
    }
    const result = fn();
    map.set(key, result);
    return result;
  }
  util.emplace = emplace;
  function getPropertyByPath(source, path) {
    if (typeof path === "string" && Object.prototype.hasOwnProperty.call(source, path)) {
      return source[path];
    }
    const parsedPath = typeof path === "string" ? path.split(".") : path;
    return parsedPath.reduce((previous, key) => {
      if (previous === void 0) {
        return previous;
      }
      return previous[key];
    }, source);
  }
  util.getPropertyByPath = getPropertyByPath;
  function removeUndefinedValuesFromObject(options) {
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== void 0));
  }
  util.removeUndefinedValuesFromObject = removeUndefinedValuesFromObject;
  /* istanbul ignore next -- @preserve */
  async function isDirectory(path) {
    try {
      const stat = await fs_1.promises.stat(path);
      return stat.isDirectory();
    } catch (e) {
      if (e.code === "ENOENT") {
        return false;
      }
      throw e;
    }
  }
  util.isDirectory = isDirectory;
  /* istanbul ignore next -- @preserve */
  function isDirectorySync(path) {
    try {
      const stat = fs_1.default.statSync(path);
      return stat.isDirectory();
    } catch (e) {
      if (e.code === "ENOENT") {
        return false;
      }
      throw e;
    }
  }
  util.isDirectorySync = isDirectorySync;
  return util;
}
export {
  requireUtil as __require
};
//# sourceMappingURL=index10.js.map
