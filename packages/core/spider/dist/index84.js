import { __require as requireErrors } from "./index23.js";
var snapshotUtils;
var hasRequiredSnapshotUtils;
function requireSnapshotUtils() {
  if (hasRequiredSnapshotUtils) return snapshotUtils;
  hasRequiredSnapshotUtils = 1;
  const { InvalidArgumentError } = requireErrors();
  function createHeaderFilters(matchOptions = {}) {
    const { ignoreHeaders = [], excludeHeaders = [], matchHeaders = [], caseSensitive = false } = matchOptions;
    return {
      ignore: new Set(ignoreHeaders.map((header) => caseSensitive ? header : header.toLowerCase())),
      exclude: new Set(excludeHeaders.map((header) => caseSensitive ? header : header.toLowerCase())),
      match: new Set(matchHeaders.map((header) => caseSensitive ? header : header.toLowerCase()))
    };
  }
  let crypto;
  try {
    crypto = require("node:crypto");
  } catch {
  }
  const hashId = crypto?.hash ? (value) => crypto.hash("sha256", value, "base64url") : (value) => Buffer.from(value).toString("base64url");
  function isUndiciHeaders(headers) {
    return Array.isArray(headers) && (headers.length & 1) === 0;
  }
  function isUrlExcludedFactory(excludePatterns = []) {
    if (excludePatterns.length === 0) {
      return () => false;
    }
    return function isUrlExcluded(url) {
      let urlLowerCased;
      for (const pattern of excludePatterns) {
        if (typeof pattern === "string") {
          if (!urlLowerCased) {
            urlLowerCased = url.toLowerCase();
          }
          if (urlLowerCased.includes(pattern.toLowerCase())) {
            return true;
          }
        } else if (pattern instanceof RegExp) {
          if (pattern.test(url)) {
            return true;
          }
        }
      }
      return false;
    };
  }
  function normalizeHeaders(headers) {
    const normalizedHeaders = {};
    if (!headers) return normalizedHeaders;
    if (isUndiciHeaders(headers)) {
      for (let i = 0; i < headers.length; i += 2) {
        const key = headers[i];
        const value = headers[i + 1];
        if (key && value !== void 0) {
          const keyStr = Buffer.isBuffer(key) ? key.toString() : key;
          const valueStr = Buffer.isBuffer(value) ? value.toString() : value;
          normalizedHeaders[keyStr.toLowerCase()] = valueStr;
        }
      }
      return normalizedHeaders;
    }
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (key && typeof key === "string") {
          normalizedHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
        }
      }
    }
    return normalizedHeaders;
  }
  const validSnapshotModes = (
    /** @type {const} */
    ["record", "playback", "update"]
  );
  function validateSnapshotMode(mode) {
    if (!validSnapshotModes.includes(mode)) {
      throw new InvalidArgumentError(`Invalid snapshot mode: ${mode}. Must be one of: ${validSnapshotModes.join(", ")}`);
    }
  }
  snapshotUtils = {
    createHeaderFilters,
    hashId,
    isUndiciHeaders,
    normalizeHeaders,
    isUrlExcludedFactory,
    validateSnapshotMode
  };
  return snapshotUtils;
}
export {
  requireSnapshotUtils as __require
};
//# sourceMappingURL=index84.js.map
