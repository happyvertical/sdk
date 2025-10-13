import { d as distExports } from "./index4.js";
const MODULE_NAME = "smrt";
let cachedConfig = null;
async function loadConfig(options = {}) {
  const { configPath, searchParents = true, cache = true } = options;
  if (cache && cachedConfig) {
    return cachedConfig;
  }
  const explorer = distExports.cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.mjs`,
      `${MODULE_NAME}.config.cjs`,
      `${MODULE_NAME}.config.json`
    ],
    stopDir: searchParents ? void 0 : process.cwd(),
    cache
    // Respect cache option
  });
  let result;
  try {
    if (configPath) {
      result = await explorer.load(configPath);
    } else {
      result = await explorer.search();
    }
  } catch (error) {
    return {};
  }
  const config = result?.config || {};
  if (cache) {
    cachedConfig = config;
  }
  return config;
}
function clearConfigCache() {
  cachedConfig = null;
  const cacheKeys = Object.keys(require.cache);
  for (const key of cacheKeys) {
    if (key.includes("smrt.config")) {
      delete require.cache[key];
    }
  }
}
export {
  clearConfigCache,
  loadConfig
};
//# sourceMappingURL=index2.js.map
