async function getPDFReader(options = {}) {
  const { provider = "auto", ...readerOptions } = options;
  const isNode = typeof process !== "undefined" && process?.versions?.node !== void 0;
  const isBrowser = typeof globalThis !== "undefined" && typeof globalThis.window !== "undefined" && typeof globalThis.document !== "undefined";
  let selectedProvider = provider;
  if (provider === "auto") {
    if (isNode) {
      selectedProvider = "unpdf";
    } else if (isBrowser) {
      selectedProvider = "pdfjs";
    } else {
      throw new Error(
        "Unable to detect environment for automatic provider selection"
      );
    }
  }
  switch (selectedProvider) {
    case "unpdf": {
      if (!isNode) {
        throw new Error(
          "unpdf provider is only available in Node.js environments"
        );
      }
      const { CombinedNodeProvider } = await import("./index5.js");
      return new CombinedNodeProvider();
    }
    case "pdfjs": {
      if (!isBrowser) {
        throw new Error(
          "pdfjs provider is only available in browser environments"
        );
      }
      throw new Error(
        "pdfjs provider should be handled by browser entry point"
      );
    }
    default:
      throw new Error(`Unknown PDF provider: ${selectedProvider}`);
  }
}
function getAvailableProviders() {
  const providers = [];
  const isNode = typeof process !== "undefined" && process?.versions?.node !== void 0;
  const isBrowser = typeof globalThis !== "undefined" && typeof globalThis.window !== "undefined" && typeof globalThis.document !== "undefined";
  if (isNode) {
    providers.push("unpdf");
  }
  if (isBrowser) {
    providers.push("pdfjs");
  }
  return providers;
}
function isProviderAvailable(provider) {
  return getAvailableProviders().includes(provider);
}
async function getProviderInfo(provider) {
  try {
    const reader = await getPDFReader({ provider });
    const [capabilities, dependencies] = await Promise.all([
      reader.checkCapabilities(),
      reader.checkDependencies()
    ]);
    return {
      provider,
      available: isProviderAvailable(provider),
      capabilities,
      dependencies
    };
  } catch (error) {
    return {
      provider,
      available: false,
      error: error.message,
      capabilities: null,
      dependencies: null
    };
  }
}
async function initializeProviders() {
  try {
    const availableProviders = getAvailableProviders();
    for (const provider of availableProviders) {
      try {
        const info = await getProviderInfo(provider);
        if (!info.dependencies?.available) {
          console.warn(
            `PDF provider '${provider}' is available but dependencies are missing:`,
            info.dependencies?.error
          );
        }
      } catch (error) {
        console.warn(`Failed to initialize PDF provider '${provider}':`, error);
      }
    }
  } catch (error) {
    console.debug("PDF provider initialization failed:", error);
  }
}
export {
  getAvailableProviders,
  getPDFReader,
  getProviderInfo,
  initializeProviders,
  isProviderAvailable
};
//# sourceMappingURL=index2.js.map
