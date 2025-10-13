import { __require as requireUtil } from "./index24.js";
var cache;
var hasRequiredCache;
function requireCache() {
  if (hasRequiredCache) return cache;
  hasRequiredCache = 1;
  const {
    safeHTTPMethods,
    pathHasQueryOrFragment
  } = requireUtil();
  const { serializePathWithQuery } = requireUtil();
  function makeCacheKey(opts) {
    if (!opts.origin) {
      throw new Error("opts.origin is undefined");
    }
    let fullPath = opts.path || "/";
    if (opts.query && !pathHasQueryOrFragment(opts.path)) {
      fullPath = serializePathWithQuery(fullPath, opts.query);
    }
    return {
      origin: opts.origin.toString(),
      method: opts.method,
      path: fullPath,
      headers: opts.headers
    };
  }
  function normalizeHeaders(opts) {
    let headers;
    if (opts.headers == null) {
      headers = {};
    } else if (typeof opts.headers[Symbol.iterator] === "function") {
      headers = {};
      for (const x of opts.headers) {
        if (!Array.isArray(x)) {
          throw new Error("opts.headers is not a valid header map");
        }
        const [key, val] = x;
        if (typeof key !== "string" || typeof val !== "string") {
          throw new Error("opts.headers is not a valid header map");
        }
        headers[key.toLowerCase()] = val;
      }
    } else if (typeof opts.headers === "object") {
      headers = {};
      for (const key of Object.keys(opts.headers)) {
        headers[key.toLowerCase()] = opts.headers[key];
      }
    } else {
      throw new Error("opts.headers is not an object");
    }
    return headers;
  }
  function assertCacheKey(key) {
    if (typeof key !== "object") {
      throw new TypeError(`expected key to be object, got ${typeof key}`);
    }
    for (const property of ["origin", "method", "path"]) {
      if (typeof key[property] !== "string") {
        throw new TypeError(`expected key.${property} to be string, got ${typeof key[property]}`);
      }
    }
    if (key.headers !== void 0 && typeof key.headers !== "object") {
      throw new TypeError(`expected headers to be object, got ${typeof key}`);
    }
  }
  function assertCacheValue(value) {
    if (typeof value !== "object") {
      throw new TypeError(`expected value to be object, got ${typeof value}`);
    }
    for (const property of ["statusCode", "cachedAt", "staleAt", "deleteAt"]) {
      if (typeof value[property] !== "number") {
        throw new TypeError(`expected value.${property} to be number, got ${typeof value[property]}`);
      }
    }
    if (typeof value.statusMessage !== "string") {
      throw new TypeError(`expected value.statusMessage to be string, got ${typeof value.statusMessage}`);
    }
    if (value.headers != null && typeof value.headers !== "object") {
      throw new TypeError(`expected value.rawHeaders to be object, got ${typeof value.headers}`);
    }
    if (value.vary !== void 0 && typeof value.vary !== "object") {
      throw new TypeError(`expected value.vary to be object, got ${typeof value.vary}`);
    }
    if (value.etag !== void 0 && typeof value.etag !== "string") {
      throw new TypeError(`expected value.etag to be string, got ${typeof value.etag}`);
    }
  }
  function parseCacheControlHeader(header) {
    const output = {};
    let directives;
    if (Array.isArray(header)) {
      directives = [];
      for (const directive of header) {
        directives.push(...directive.split(","));
      }
    } else {
      directives = header.split(",");
    }
    for (let i = 0; i < directives.length; i++) {
      const directive = directives[i].toLowerCase();
      const keyValueDelimiter = directive.indexOf("=");
      let key;
      let value;
      if (keyValueDelimiter !== -1) {
        key = directive.substring(0, keyValueDelimiter).trimStart();
        value = directive.substring(keyValueDelimiter + 1);
      } else {
        key = directive.trim();
      }
      switch (key) {
        case "min-fresh":
        case "max-stale":
        case "max-age":
        case "s-maxage":
        case "stale-while-revalidate":
        case "stale-if-error": {
          if (value === void 0 || value[0] === " ") {
            continue;
          }
          if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
            value = value.substring(1, value.length - 1);
          }
          const parsedValue = parseInt(value, 10);
          if (parsedValue !== parsedValue) {
            continue;
          }
          if (key === "max-age" && key in output && output[key] >= parsedValue) {
            continue;
          }
          output[key] = parsedValue;
          break;
        }
        case "private":
        case "no-cache": {
          if (value) {
            if (value[0] === '"') {
              const headers = [value.substring(1)];
              let foundEndingQuote = value[value.length - 1] === '"';
              if (!foundEndingQuote) {
                for (let j = i + 1; j < directives.length; j++) {
                  const nextPart = directives[j];
                  const nextPartLength = nextPart.length;
                  headers.push(nextPart.trim());
                  if (nextPartLength !== 0 && nextPart[nextPartLength - 1] === '"') {
                    foundEndingQuote = true;
                    break;
                  }
                }
              }
              if (foundEndingQuote) {
                let lastHeader = headers[headers.length - 1];
                if (lastHeader[lastHeader.length - 1] === '"') {
                  lastHeader = lastHeader.substring(0, lastHeader.length - 1);
                  headers[headers.length - 1] = lastHeader;
                }
                if (key in output) {
                  output[key] = output[key].concat(headers);
                } else {
                  output[key] = headers;
                }
              }
            } else {
              if (key in output) {
                output[key] = output[key].concat(value);
              } else {
                output[key] = [value];
              }
            }
            break;
          }
        }
        // eslint-disable-next-line no-fallthrough
        case "public":
        case "no-store":
        case "must-revalidate":
        case "proxy-revalidate":
        case "immutable":
        case "no-transform":
        case "must-understand":
        case "only-if-cached":
          if (value) {
            continue;
          }
          output[key] = true;
          break;
        default:
          continue;
      }
    }
    return output;
  }
  function parseVaryHeader(varyHeader, headers) {
    if (typeof varyHeader === "string" && varyHeader.includes("*")) {
      return headers;
    }
    const output = (
      /** @type {Record<string, string | string[] | null>} */
      {}
    );
    const varyingHeaders = typeof varyHeader === "string" ? varyHeader.split(",") : varyHeader;
    for (const header of varyingHeaders) {
      const trimmedHeader = header.trim().toLowerCase();
      output[trimmedHeader] = headers[trimmedHeader] ?? null;
    }
    return output;
  }
  function isEtagUsable(etag) {
    if (etag.length <= 2) {
      return false;
    }
    if (etag[0] === '"' && etag[etag.length - 1] === '"') {
      return !(etag[1] === '"' || etag.startsWith('"W/'));
    }
    if (etag.startsWith('W/"') && etag[etag.length - 1] === '"') {
      return etag.length !== 4;
    }
    return false;
  }
  function assertCacheStore(store, name = "CacheStore") {
    if (typeof store !== "object" || store === null) {
      throw new TypeError(`expected type of ${name} to be a CacheStore, got ${store === null ? "null" : typeof store}`);
    }
    for (const fn of ["get", "createWriteStream", "delete"]) {
      if (typeof store[fn] !== "function") {
        throw new TypeError(`${name} needs to have a \`${fn}()\` function`);
      }
    }
  }
  function assertCacheMethods(methods, name = "CacheMethods") {
    if (!Array.isArray(methods)) {
      throw new TypeError(`expected type of ${name} needs to be an array, got ${methods === null ? "null" : typeof methods}`);
    }
    if (methods.length === 0) {
      throw new TypeError(`${name} needs to have at least one method`);
    }
    for (const method of methods) {
      if (!safeHTTPMethods.includes(method)) {
        throw new TypeError(`element of ${name}-array needs to be one of following values: ${safeHTTPMethods.join(", ")}, got ${method}`);
      }
    }
  }
  cache = {
    makeCacheKey,
    normalizeHeaders,
    assertCacheKey,
    assertCacheValue,
    parseCacheControlHeader,
    parseVaryHeader,
    isEtagUsable,
    assertCacheMethods,
    assertCacheStore
  };
  return cache;
}
export {
  requireCache as __require
};
//# sourceMappingURL=index87.js.map
