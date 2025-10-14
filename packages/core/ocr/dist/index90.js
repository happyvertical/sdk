import { __exports as backendImpl } from "./index106.js";
var hasRequiredBackendImpl;
function requireBackendImpl() {
  if (hasRequiredBackendImpl) return backendImpl;
  hasRequiredBackendImpl = 1;
  Object.defineProperty(backendImpl, "__esModule", { value: true });
  backendImpl.resolveBackendAndExecutionProviders = backendImpl.registerBackend = void 0;
  const backends = /* @__PURE__ */ new Map();
  const backendsSortedByPriority = [];
  const registerBackend = (name, backend, priority) => {
    if (backend && typeof backend.init === "function" && typeof backend.createInferenceSessionHandler === "function") {
      const currentBackend = backends.get(name);
      if (currentBackend === void 0) {
        backends.set(name, { backend, priority });
      } else if (currentBackend.priority > priority) {
        return;
      } else if (currentBackend.priority === priority) {
        if (currentBackend.backend !== backend) {
          throw new Error(`cannot register backend "${name}" using priority ${priority}`);
        }
      }
      if (priority >= 0) {
        const i = backendsSortedByPriority.indexOf(name);
        if (i !== -1) {
          backendsSortedByPriority.splice(i, 1);
        }
        for (let i2 = 0; i2 < backendsSortedByPriority.length; i2++) {
          if (backends.get(backendsSortedByPriority[i2]).priority <= priority) {
            backendsSortedByPriority.splice(i2, 0, name);
            return;
          }
        }
        backendsSortedByPriority.push(name);
      }
      return;
    }
    throw new TypeError("not a valid backend");
  };
  backendImpl.registerBackend = registerBackend;
  const tryResolveAndInitializeBackend = async (backendName) => {
    const backendInfo = backends.get(backendName);
    if (!backendInfo) {
      return "backend not found.";
    }
    if (backendInfo.initialized) {
      return backendInfo.backend;
    } else if (backendInfo.aborted) {
      return backendInfo.error;
    } else {
      const isInitializing = !!backendInfo.initPromise;
      try {
        if (!isInitializing) {
          backendInfo.initPromise = backendInfo.backend.init(backendName);
        }
        await backendInfo.initPromise;
        backendInfo.initialized = true;
        return backendInfo.backend;
      } catch (e) {
        if (!isInitializing) {
          backendInfo.error = `${e}`;
          backendInfo.aborted = true;
        }
        return backendInfo.error;
      } finally {
        delete backendInfo.initPromise;
      }
    }
  };
  const resolveBackendAndExecutionProviders = async (options) => {
    const eps = options.executionProviders || [];
    const backendHints = eps.map((i) => typeof i === "string" ? i : i.name);
    const backendNames = backendHints.length === 0 ? backendsSortedByPriority : backendHints;
    let backend;
    const errors = [];
    const availableBackendNames = /* @__PURE__ */ new Set();
    for (const backendName of backendNames) {
      const resolveResult = await tryResolveAndInitializeBackend(backendName);
      if (typeof resolveResult === "string") {
        errors.push({ name: backendName, err: resolveResult });
      } else {
        if (!backend) {
          backend = resolveResult;
        }
        if (backend === resolveResult) {
          availableBackendNames.add(backendName);
        }
      }
    }
    if (!backend) {
      throw new Error(`no available backend found. ERR: ${errors.map((e) => `[${e.name}] ${e.err}`).join(", ")}`);
    }
    for (const { name, err } of errors) {
      if (backendHints.includes(name)) {
        console.warn(`removing requested execution provider "${name}" from session options because it is not available: ${err}`);
      }
    }
    const filteredEps = eps.filter((i) => availableBackendNames.has(typeof i === "string" ? i : i.name));
    return [
      backend,
      new Proxy(options, {
        get: (target, prop) => {
          if (prop === "executionProviders") {
            return filteredEps;
          }
          return Reflect.get(target, prop);
        }
      })
    ];
  };
  backendImpl.resolveBackendAndExecutionProviders = resolveBackendAndExecutionProviders;
  return backendImpl;
}
export {
  requireBackendImpl as __require
};
//# sourceMappingURL=index90.js.map
