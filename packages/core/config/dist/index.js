import { loadConfig as loadConfig$1, clearConfigCache } from "./index2.js";
import { getRuntimeConfig, mergeConfigs, setConfig as setConfig$1, clearRuntimeConfig } from "./index3.js";
let loadedConfig = null;
async function loadConfig(options) {
  const config = await loadConfig$1(options);
  loadedConfig = config;
  return config;
}
function getModuleConfig(moduleName, defaults) {
  const fileConfig = loadedConfig || {};
  const runtime = getRuntimeConfig();
  const globalConfig = fileConfig.smrt || {};
  const moduleConfig = fileConfig.modules?.[moduleName] || {};
  const runtimeModuleConfig = runtime.modules?.[moduleName] || {};
  const defaultsWithGlobal = mergeConfigs(defaults || {}, globalConfig, {});
  const withModuleConfig = mergeConfigs(defaultsWithGlobal, moduleConfig, {});
  const final = mergeConfigs(withModuleConfig, runtimeModuleConfig, {});
  return final;
}
function getPackageConfig(packageName, defaults) {
  const fileConfig = loadedConfig || {};
  const runtime = getRuntimeConfig();
  const globalConfig = fileConfig.smrt || {};
  const packageConfig = fileConfig.packages?.[packageName] || {};
  const runtimePackageConfig = runtime.packages?.[packageName] || {};
  const defaultsWithGlobal = mergeConfigs(defaults || {}, globalConfig, {});
  const withPackageConfig = mergeConfigs(defaultsWithGlobal, packageConfig, {});
  const final = mergeConfigs(withPackageConfig, runtimePackageConfig, {});
  return final;
}
function setConfig(config) {
  setConfig$1(config);
}
function clearCache() {
  loadedConfig = null;
  clearConfigCache();
  clearRuntimeConfig();
}
function defineConfig(config) {
  return config;
}
export {
  clearCache,
  defineConfig,
  getModuleConfig,
  getPackageConfig,
  loadConfig,
  setConfig
};
//# sourceMappingURL=index.js.map
