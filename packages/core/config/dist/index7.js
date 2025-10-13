import { __exports as defaults } from "./index11.js";
import { __require as requireLoaders } from "./index12.js";
var hasRequiredDefaults;
function requireDefaults() {
  if (hasRequiredDefaults) return defaults;
  hasRequiredDefaults = 1;
  Object.defineProperty(defaults, "__esModule", { value: true });
  defaults.defaultLoadersSync = defaults.defaultLoaders = defaults.metaSearchPlaces = defaults.globalConfigSearchPlacesSync = defaults.globalConfigSearchPlaces = defaults.getDefaultSearchPlacesSync = defaults.getDefaultSearchPlaces = void 0;
  const loaders_1 = requireLoaders();
  function getDefaultSearchPlaces(moduleName) {
    return [
      "package.json",
      `.${moduleName}rc`,
      `.${moduleName}rc.json`,
      `.${moduleName}rc.yaml`,
      `.${moduleName}rc.yml`,
      `.${moduleName}rc.js`,
      `.${moduleName}rc.ts`,
      `.${moduleName}rc.cjs`,
      `.${moduleName}rc.mjs`,
      `.config/${moduleName}rc`,
      `.config/${moduleName}rc.json`,
      `.config/${moduleName}rc.yaml`,
      `.config/${moduleName}rc.yml`,
      `.config/${moduleName}rc.js`,
      `.config/${moduleName}rc.ts`,
      `.config/${moduleName}rc.cjs`,
      `.config/${moduleName}rc.mjs`,
      `${moduleName}.config.js`,
      `${moduleName}.config.ts`,
      `${moduleName}.config.cjs`,
      `${moduleName}.config.mjs`
    ];
  }
  defaults.getDefaultSearchPlaces = getDefaultSearchPlaces;
  function getDefaultSearchPlacesSync(moduleName) {
    return [
      "package.json",
      `.${moduleName}rc`,
      `.${moduleName}rc.json`,
      `.${moduleName}rc.yaml`,
      `.${moduleName}rc.yml`,
      `.${moduleName}rc.js`,
      `.${moduleName}rc.ts`,
      `.${moduleName}rc.cjs`,
      `.config/${moduleName}rc`,
      `.config/${moduleName}rc.json`,
      `.config/${moduleName}rc.yaml`,
      `.config/${moduleName}rc.yml`,
      `.config/${moduleName}rc.js`,
      `.config/${moduleName}rc.ts`,
      `.config/${moduleName}rc.cjs`,
      `${moduleName}.config.js`,
      `${moduleName}.config.ts`,
      `${moduleName}.config.cjs`
    ];
  }
  defaults.getDefaultSearchPlacesSync = getDefaultSearchPlacesSync;
  defaults.globalConfigSearchPlaces = [
    "config",
    "config.json",
    "config.yaml",
    "config.yml",
    "config.js",
    "config.ts",
    "config.cjs",
    "config.mjs"
  ];
  defaults.globalConfigSearchPlacesSync = [
    "config",
    "config.json",
    "config.yaml",
    "config.yml",
    "config.js",
    "config.ts",
    "config.cjs"
  ];
  defaults.metaSearchPlaces = [
    "package.json",
    "package.yaml",
    ".config/config.json",
    ".config/config.yaml",
    ".config/config.yml",
    ".config/config.js",
    ".config/config.ts",
    ".config/config.cjs",
    ".config/config.mjs"
  ];
  defaults.defaultLoaders = Object.freeze({
    ".mjs": loaders_1.loadJs,
    ".cjs": loaders_1.loadJs,
    ".js": loaders_1.loadJs,
    ".ts": loaders_1.loadTs,
    ".json": loaders_1.loadJson,
    ".yaml": loaders_1.loadYaml,
    ".yml": loaders_1.loadYaml,
    noExt: loaders_1.loadYaml
  });
  defaults.defaultLoadersSync = Object.freeze({
    ".cjs": loaders_1.loadJsSync,
    ".js": loaders_1.loadJsSync,
    ".ts": loaders_1.loadTsSync,
    ".json": loaders_1.loadJson,
    ".yaml": loaders_1.loadYaml,
    ".yml": loaders_1.loadYaml,
    noExt: loaders_1.loadYaml
  });
  return defaults;
}
export {
  requireDefaults as __require
};
//# sourceMappingURL=index7.js.map
