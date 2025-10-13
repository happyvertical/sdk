var global;
var hasRequiredGlobal;
function requireGlobal() {
  if (hasRequiredGlobal) return global;
  hasRequiredGlobal = 1;
  const globalOrigin = Symbol.for("undici.globalOrigin.1");
  function getGlobalOrigin() {
    return globalThis[globalOrigin];
  }
  function setGlobalOrigin(newOrigin) {
    if (newOrigin === void 0) {
      Object.defineProperty(globalThis, globalOrigin, {
        value: void 0,
        writable: true,
        enumerable: false,
        configurable: false
      });
      return;
    }
    const parsedURL = new URL(newOrigin);
    if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
      throw new TypeError(`Only http & https urls are allowed, received ${parsedURL.protocol}`);
    }
    Object.defineProperty(globalThis, globalOrigin, {
      value: parsedURL,
      writable: true,
      enumerable: false,
      configurable: false
    });
  }
  global = {
    getGlobalOrigin,
    setGlobalOrigin
  };
  return global;
}
export {
  requireGlobal as __require
};
//# sourceMappingURL=index51.js.map
