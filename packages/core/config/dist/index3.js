let runtimeConfig = {};
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];
    if (sourceValue && typeof sourceValue === "object" && !Array.isArray(sourceValue) && targetValue && typeof targetValue === "object" && !Array.isArray(targetValue)) {
      result[key] = deepMerge(
        targetValue,
        sourceValue
      );
    } else if (sourceValue !== void 0) {
      result[key] = sourceValue;
    }
  }
  return result;
}
function setConfig(config) {
  runtimeConfig = deepMerge(runtimeConfig, config);
}
function getRuntimeConfig() {
  return runtimeConfig;
}
function clearRuntimeConfig() {
  runtimeConfig = {};
}
function mergeConfigs(defaults, fileConfig, runtime) {
  let result = { ...defaults };
  result = deepMerge(result, fileConfig);
  result = deepMerge(result, runtime);
  return result;
}
export {
  clearRuntimeConfig,
  getRuntimeConfig,
  mergeConfigs,
  setConfig
};
//# sourceMappingURL=index3.js.map
