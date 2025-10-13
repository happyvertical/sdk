function isValidKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 250;
}
function calculateSize(value) {
  try {
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  } catch {
    return 0;
  }
}
function matchesPattern(pattern, str) {
  const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}
function formatKey(namespace, key) {
  return namespace ? `${namespace}:${key}` : key;
}
function extractKey(namespace, fullKey) {
  if (!namespace) {
    return fullKey;
  }
  const prefix = `${namespace}:`;
  return fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : fullKey;
}
function isExpired(expiresAt) {
  if (expiresAt === void 0) {
    return false;
  }
  return Date.now() >= expiresAt;
}
function calculateExpiration(ttl) {
  if (ttl === void 0 || ttl <= 0) {
    return void 0;
  }
  return Date.now() + ttl * 1e3;
}
function serialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(
      `Failed to serialize value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
function deserialize(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to deserialize value: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
export {
  calculateExpiration,
  calculateSize,
  deserialize,
  extractKey,
  formatKey,
  isExpired,
  isValidKey,
  matchesPattern,
  serialize
};
//# sourceMappingURL=index6.js.map
