import { __exports as loaders } from "./index23.js";
import require$$0$1 from "fs";
import require$$0$2 from "./index14.js";
import require$$0 from "path";
import require$$3 from "url";
import { __require as requireImportFresh } from "./index24.js";
import { __require as requireParseJson } from "./index25.js";
import { __require as requireJsYaml } from "./index26.js";
import require$$7 from "typescript";
var hasRequiredLoaders;
function requireLoaders() {
  if (hasRequiredLoaders) return loaders;
  hasRequiredLoaders = 1;
  (function(exports) {
    var __importDefault = loaders && loaders.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.loadTs = exports.loadTsSync = exports.loadYaml = exports.loadJson = exports.loadJs = exports.loadJsSync = void 0;
    const fs_1 = require$$0$1;
    const promises_1 = require$$0$2;
    const path_1 = __importDefault(require$$0);
    const url_1 = require$$3;
    let importFresh;
    const loadJsSync = function loadJsSync2(filepath) {
      if (importFresh === void 0) {
        importFresh = /* @__PURE__ */ requireImportFresh();
      }
      return importFresh(filepath);
    };
    exports.loadJsSync = loadJsSync;
    const loadJs = async function loadJs2(filepath) {
      try {
        const { href } = (0, url_1.pathToFileURL)(filepath);
        return (await import(href)).default;
      } catch (error) {
        try {
          return (0, exports.loadJsSync)(filepath, "");
        } catch (requireError) {
          if (requireError.code === "ERR_REQUIRE_ESM" || requireError instanceof SyntaxError && requireError.toString().includes("Cannot use import statement outside a module")) {
            throw error;
          }
          throw requireError;
        }
      }
    };
    exports.loadJs = loadJs;
    let parseJson;
    const loadJson = function loadJson2(filepath, content) {
      if (parseJson === void 0) {
        parseJson = requireParseJson();
      }
      try {
        return parseJson(content);
      } catch (error) {
        error.message = `JSON Error in ${filepath}:
${error.message}`;
        throw error;
      }
    };
    exports.loadJson = loadJson;
    let yaml;
    const loadYaml = function loadYaml2(filepath, content) {
      if (yaml === void 0) {
        yaml = requireJsYaml();
      }
      try {
        return yaml.load(content);
      } catch (error) {
        error.message = `YAML Error in ${filepath}:
${error.message}`;
        throw error;
      }
    };
    exports.loadYaml = loadYaml;
    let typescript;
    const loadTsSync = function loadTsSync2(filepath, content) {
      /* istanbul ignore next -- @preserve */
      if (typescript === void 0) {
        typescript = require$$7;
      }
      const compiledFilepath = `${filepath.slice(0, -2)}cjs`;
      try {
        const config = resolveTsConfig(path_1.default.dirname(filepath)) ?? {};
        config.compilerOptions = {
          ...config.compilerOptions,
          module: typescript.ModuleKind.NodeNext,
          moduleResolution: typescript.ModuleResolutionKind.NodeNext,
          target: typescript.ScriptTarget.ES2022,
          noEmit: false
        };
        content = typescript.transpileModule(content, config).outputText;
        (0, fs_1.writeFileSync)(compiledFilepath, content);
        return (0, exports.loadJsSync)(compiledFilepath, content).default;
      } catch (error) {
        error.message = `TypeScript Error in ${filepath}:
${error.message}`;
        throw error;
      } finally {
        if ((0, fs_1.existsSync)(compiledFilepath)) {
          (0, fs_1.rmSync)(compiledFilepath);
        }
      }
    };
    exports.loadTsSync = loadTsSync;
    const loadTs = async function loadTs2(filepath, content) {
      if (typescript === void 0) {
        typescript = (await import("typescript")).default;
      }
      const compiledFilepath = `${filepath.slice(0, -2)}mjs`;
      let transpiledContent;
      try {
        try {
          const config = resolveTsConfig(path_1.default.dirname(filepath)) ?? {};
          config.compilerOptions = {
            ...config.compilerOptions,
            module: typescript.ModuleKind.ES2022,
            moduleResolution: typescript.ModuleResolutionKind.Bundler,
            target: typescript.ScriptTarget.ES2022,
            noEmit: false
          };
          transpiledContent = typescript.transpileModule(content, config).outputText;
          await (0, promises_1.writeFile)(compiledFilepath, transpiledContent);
        } catch (error) {
          error.message = `TypeScript Error in ${filepath}:
${error.message}`;
          throw error;
        }
        return await (0, exports.loadJs)(compiledFilepath, transpiledContent);
      } finally {
        if ((0, fs_1.existsSync)(compiledFilepath)) {
          await (0, promises_1.rm)(compiledFilepath);
        }
      }
    };
    exports.loadTs = loadTs;
    function resolveTsConfig(directory) {
      const filePath = typescript.findConfigFile(directory, (fileName) => {
        return typescript.sys.fileExists(fileName);
      });
      if (filePath !== void 0) {
        const { config, error } = typescript.readConfigFile(filePath, (path) => typescript.sys.readFile(path));
        if (error) {
          throw new Error(`Error in ${filePath}: ${error.messageText.toString()}`);
        }
        return config;
      }
      return;
    }
  })(loaders);
  return loaders;
}
export {
  requireLoaders as __require
};
//# sourceMappingURL=index12.js.map
