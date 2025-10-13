import { __exports as ExplorerBase } from "./index24.js";
import { __require as requireEnvPaths } from "./index25.js";
import require$$1 from "os";
import require$$0 from "path";
import { __require as requireUtil } from "./index10.js";
var hasRequiredExplorerBase;
function requireExplorerBase() {
  if (hasRequiredExplorerBase) return ExplorerBase;
  hasRequiredExplorerBase = 1;
  var __importDefault = ExplorerBase && ExplorerBase.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(ExplorerBase, "__esModule", { value: true });
  ExplorerBase.getExtensionDescription = ExplorerBase.ExplorerBase = void 0;
  const env_paths_1 = __importDefault(requireEnvPaths());
  const os_1 = __importDefault(require$$1);
  const path_1 = __importDefault(require$$0);
  const util_js_1 = requireUtil();
  let ExplorerBase$1 = class ExplorerBase {
    #loadingMetaConfig = false;
    config;
    loadCache;
    searchCache;
    constructor(options) {
      this.config = options;
      if (options.cache) {
        this.loadCache = /* @__PURE__ */ new Map();
        this.searchCache = /* @__PURE__ */ new Map();
      }
      this.#validateConfig();
    }
    set loadingMetaConfig(value) {
      this.#loadingMetaConfig = value;
    }
    #validateConfig() {
      const config = this.config;
      for (const place of config.searchPlaces) {
        const extension = path_1.default.extname(place);
        const loader = this.config.loaders[extension || "noExt"] ?? this.config.loaders["default"];
        if (loader === void 0) {
          throw new Error(`Missing loader for ${getExtensionDescription(place)}.`);
        }
        if (typeof loader !== "function") {
          throw new Error(`Loader for ${getExtensionDescription(place)} is not a function: Received ${typeof loader}.`);
        }
      }
    }
    clearLoadCache() {
      if (this.loadCache) {
        this.loadCache.clear();
      }
    }
    clearSearchCache() {
      if (this.searchCache) {
        this.searchCache.clear();
      }
    }
    clearCaches() {
      this.clearLoadCache();
      this.clearSearchCache();
    }
    toCosmiconfigResult(filepath, config) {
      if (config === null) {
        return null;
      }
      if (config === void 0) {
        return { filepath, config: void 0, isEmpty: true };
      }
      if (this.config.applyPackagePropertyPathToConfiguration || this.#loadingMetaConfig) {
        const packageProp = this.config.packageProp ?? this.config.moduleName;
        config = (0, util_js_1.getPropertyByPath)(config, packageProp);
      }
      if (config === void 0) {
        return { filepath, config: void 0, isEmpty: true };
      }
      return { config, filepath };
    }
    validateImports(containingFilePath, imports, importStack) {
      const fileDirectory = path_1.default.dirname(containingFilePath);
      for (const importPath of imports) {
        if (typeof importPath !== "string") {
          throw new Error(`${containingFilePath}: Key $import must contain a string or a list of strings`);
        }
        const fullPath = path_1.default.resolve(fileDirectory, importPath);
        if (fullPath === containingFilePath) {
          throw new Error(`Self-import detected in ${containingFilePath}`);
        }
        const idx = importStack.indexOf(fullPath);
        if (idx !== -1) {
          throw new Error(`Circular import detected:
${[...importStack, fullPath].map((path, i) => `${i + 1}. ${path}`).join("\n")} (same as ${idx + 1}.)`);
        }
      }
    }
    getSearchPlacesForDir(dir, globalConfigPlaces) {
      return (dir.isGlobalConfig ? globalConfigPlaces : this.config.searchPlaces).map((place) => path_1.default.join(dir.path, place));
    }
    getGlobalConfigDir() {
      return (0, env_paths_1.default)(this.config.moduleName, { suffix: "" }).config;
    }
    *getGlobalDirs(startDir) {
      const stopDir = path_1.default.resolve(this.config.stopDir ?? os_1.default.homedir());
      yield { path: startDir, isGlobalConfig: false };
      let currentDir = startDir;
      while (currentDir !== stopDir) {
        const parentDir = path_1.default.dirname(currentDir);
        /* istanbul ignore if -- @preserve */
        if (parentDir === currentDir) {
          break;
        }
        yield { path: parentDir, isGlobalConfig: false };
        currentDir = parentDir;
      }
      yield { path: this.getGlobalConfigDir(), isGlobalConfig: true };
    }
  };
  ExplorerBase.ExplorerBase = ExplorerBase$1;
  function getExtensionDescription(extension) {
    /* istanbul ignore next -- @preserve */
    return extension ? `extension "${extension}"` : "files without extensions";
  }
  ExplorerBase.getExtensionDescription = getExtensionDescription;
  return ExplorerBase;
}
export {
  requireExplorerBase as __require
};
//# sourceMappingURL=index15.js.map
