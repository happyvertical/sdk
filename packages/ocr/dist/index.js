class OCRError extends Error {
  constructor(message, provider, context) {
    super(message);
    this.provider = provider;
    this.context = context;
    this.name = "OCRError";
  }
}
class OCRDependencyError extends OCRError {
  constructor(provider, message, context) {
    super(
      `OCR dependency error for ${provider}: ${message}`,
      provider,
      context
    );
    this.name = "OCRDependencyError";
  }
}
class OCRUnsupportedError extends OCRError {
  constructor(provider, operation, context) {
    super(
      `OCR operation '${operation}' not supported by ${provider}`,
      provider,
      context
    );
    this.name = "OCRUnsupportedError";
  }
}
class OCRProcessingError extends OCRError {
  constructor(provider, message, context) {
    super(
      `OCR processing error for ${provider}: ${message}`,
      provider,
      context
    );
    this.name = "OCRProcessingError";
  }
}
function detectEnvironment() {
  const globalObj = globalThis;
  if (typeof globalObj.window !== "undefined" && typeof globalObj.document !== "undefined") {
    return "browser";
  }
  if (globalObj.process?.versions?.node) {
    return "node";
  }
  return "unknown";
}
class OCRFactory {
  providers = /* @__PURE__ */ new Map();
  primaryProvider = "auto";
  fallbackProviders = [];
  defaultOptions;
  environment;
  initialized = false;
  /**
   * Create a new OCR factory instance.
   *
   * @param options - Configuration options for the factory
   *
   * @example Auto-selection with defaults
   * ```typescript
   * const factory = new OCRFactory();
   * ```
   *
   * @example Specific provider configuration
   * ```typescript
   * const factory = new OCRFactory({
   *   provider: 'tesseract',
   *   fallbackProviders: ['onnx'],
   *   defaultOptions: {
   *     language: 'eng',
   *     confidenceThreshold: 75
   *   }
   * });
   * ```
   */
  constructor(options = {}) {
    this.primaryProvider = options.provider || "auto";
    this.fallbackProviders = options.fallbackProviders || [];
    this.defaultOptions = options.defaultOptions;
    this.environment = detectEnvironment();
  }
  /**
   * Initialize available OCR providers based on the current environment.
   *
   * This method dynamically imports and instantiates providers that are
   * compatible with the current runtime environment. It's called automatically
   * when OCR operations are first requested.
   *
   * @private
   */
  async initializeProviders() {
    if (this.initialized) return;
    try {
      try {
        const { TesseractProvider } = await import("./chunks/tesseract-D5t1PrBv.js");
        this.providers.set("tesseract", new TesseractProvider());
      } catch {
      }
      if (this.environment === "node") {
        try {
          const { ONNXGutenyeProvider } = await import("./chunks/onnx-gutenye-BqDfjWEd.js");
          this.providers.set("onnx", new ONNXGutenyeProvider());
        } catch {
        }
      } else if (this.environment === "browser") {
        try {
          const { WebOCRProvider } = await import("./chunks/web-ocr-Dkpjv61E.js");
          this.providers.set("web-ocr", new WebOCRProvider());
        } catch {
        }
      }
      this.initialized = true;
    } catch (error) {
      console.warn("OCR factory initialization failed:", error);
      this.initialized = true;
    }
  }
  /**
   * Get the best available OCR provider for the current environment.
   *
   * Evaluates all available providers based on:
   * - User preference (if a specific provider was requested)
   * - Provider availability (dependency checks)
   * - Environment compatibility
   * - Default priority order for auto-selection
   *
   * @returns Promise resolving to the best provider, or null if none are available
   *
   * @example
   * ```typescript
   * const provider = await factory.getBestProvider();
   * if (provider) {
   *   console.log('Using provider:', provider.name);
   * } else {
   *   console.log('No OCR providers available');
   * }
   * ```
   */
  async getBestProvider() {
    await this.initializeProviders();
    if (this.primaryProvider !== "auto") {
      const provider = this.providers.get(this.primaryProvider);
      if (provider) {
        const deps = await provider.checkDependencies();
        if (deps.available) {
          return provider;
        }
        console.warn(
          `Primary OCR provider '${this.primaryProvider}' not available:`,
          deps.error
        );
      }
    }
    const providerPriority = this.primaryProvider === "auto" ? this.getDefaultProviderPriority() : [this.primaryProvider, ...this.fallbackProviders];
    const providerChecks = providerPriority.map(async (providerName) => {
      const provider = this.providers.get(providerName);
      if (!provider)
        return { name: providerName, available: false, provider: null };
      try {
        const deps = await provider.checkDependencies();
        return {
          name: providerName,
          available: deps.available,
          provider: deps.available ? provider : null,
          error: deps.error
        };
      } catch (error) {
        console.debug(`OCR provider '${providerName}' check failed:`, error);
        return { name: providerName, available: false, provider: null };
      }
    });
    const results = await Promise.all(providerChecks);
    for (const providerName of providerPriority) {
      const result = results.find((r) => r.name === providerName);
      if (result?.available && result.provider) {
        return result.provider;
      }
      if (result && !result.available && result.error) {
        console.debug(
          `OCR provider '${providerName}' not available:`,
          result.error
        );
      }
    }
    console.warn(
      "No OCR providers are available. OCR functionality will be disabled."
    );
    return null;
  }
  /**
   * Get the default provider priority order based on environment.
   *
   * Returns an ordered list of provider names to try when using
   * auto-selection. Providers are ordered by expected performance
   * and reliability in each environment.
   *
   * @returns Array of provider names in priority order
   * @private
   */
  getDefaultProviderPriority() {
    if (this.environment === "node") {
      return ["onnx", "tesseract"];
    }
    if (this.environment === "browser") {
      return ["tesseract", "web-ocr"];
    }
    return ["tesseract"];
  }
  /**
   * Perform OCR processing on one or more images.
   *
   * This is the main method for extracting text from images. It automatically
   * selects the best available provider and handles fallback if the primary
   * provider fails or returns empty results.
   *
   * @param images - Array of images to process
   * @param options - Optional processing configuration (merged with factory defaults)
   * @returns Promise resolving to OCR results with extracted text and metadata
   *
   * @throws {OCRDependencyError} When no OCR providers are available
   * @throws {OCRError} When processing fails across all providers
   *
   * @example Basic text extraction
   * ```typescript
   * const result = await factory.performOCR([
   *   { data: fs.readFileSync('document.png') }
   * ]);
   * console.log('Text:', result.text);
   * console.log('Confidence:', result.confidence);
   * ```
   *
   * @example Advanced processing with options
   * ```typescript
   * const result = await factory.performOCR(images, {
   *   language: 'eng+chi_sim',
   *   confidenceThreshold: 80,
   *   outputFormat: 'json',
   *   timeout: 45000
   * });
   *
   * // Access detailed detections
   * if (result.detections) {
   *   result.detections.forEach(detection => {
   *     if (detection.boundingBox) {
   *       console.log(`"${detection.text}" at (${detection.boundingBox.x}, ${detection.boundingBox.y})`);
   *     }
   *   });
   * }
   * ```
   *
   * @example Handling errors
   * ```typescript
   * try {
   *   const result = await factory.performOCR(images);
   *   console.log('Success:', result.text);
   * } catch (error) {
   *   if (error instanceof OCRDependencyError) {
   *     console.log('No OCR providers available');
   *   } else if (error instanceof OCRError) {
   *     console.log('OCR processing failed:', error.message);
   *   }
   * }
   * ```
   */
  async performOCR(images, options) {
    if (!images || images.length === 0) {
      return {
        text: "",
        confidence: 0,
        detections: [],
        metadata: {
          processingTime: 0,
          provider: "none"
        }
      };
    }
    const mergedOptions = { ...this.defaultOptions, ...options };
    const provider = await this.getBestProvider();
    if (!provider) {
      throw new OCRDependencyError("none", "No OCR providers are available");
    }
    try {
      const startTime = Date.now();
      const result = await provider.performOCR(images, mergedOptions);
      const processingTime = Date.now() - startTime;
      result.metadata = {
        ...result.metadata,
        processingTime,
        provider: provider.name,
        language: mergedOptions.language
      };
      if ((!result.text || result.text.trim().length === 0) && this.fallbackProviders.length > 0) {
        for (const fallbackName of this.fallbackProviders) {
          if (fallbackName === provider.name) continue;
          const fallbackProvider = this.providers.get(fallbackName);
          if (fallbackProvider) {
            try {
              const deps = await fallbackProvider.checkDependencies();
              if (deps.available) {
                const fallbackResult = await fallbackProvider.performOCR(
                  images,
                  mergedOptions
                );
                if (fallbackResult.text && fallbackResult.text.trim().length > 0) {
                  console.info(
                    `OCR fallback to '${fallbackName}' provider succeeded`
                  );
                  fallbackResult.metadata = {
                    ...fallbackResult.metadata,
                    provider: fallbackProvider.name,
                    fallbackFrom: provider.name
                  };
                  return fallbackResult;
                }
              }
            } catch (fallbackError) {
              console.warn(
                `OCR fallback provider '${fallbackName}' failed:`,
                fallbackError
              );
            }
          }
        }
      }
      return result;
    } catch (error) {
      console.error(`OCR provider '${provider.name}' failed:`, error);
      throw new OCRError(
        `OCR processing failed: ${error.message}`,
        provider.name,
        error
      );
    }
  }
  /**
   * Get detailed information about all OCR providers.
   *
   * Returns comprehensive information about each provider including
   * availability status, dependency checks, and capabilities. Useful
   * for diagnostics and provider selection.
   *
   * @returns Promise resolving to array of provider information
   *
   * @example
   * ```typescript
   * const providers = await factory.getProvidersInfo();
   * providers.forEach(provider => {
   *   console.log(`${provider.name}: ${provider.available ? 'Available' : 'Unavailable'}`);
   *   if (!provider.available) {
   *     console.log(`  Error: ${provider.dependencies.error}`);
   *   } else if (provider.capabilities) {
   *     console.log(`  Languages: ${provider.capabilities.supportedLanguages.length}`);
   *     console.log(`  Bounding boxes: ${provider.capabilities.hasBoundingBoxes}`);
   *   }
   * });
   * ```
   */
  async getProvidersInfo() {
    await this.initializeProviders();
    const info = [];
    for (const [name, provider] of this.providers) {
      try {
        const [dependencies, capabilities] = await Promise.all([
          provider.checkDependencies(),
          provider.checkCapabilities()
        ]);
        info.push({
          name,
          available: dependencies.available,
          dependencies,
          capabilities
        });
      } catch (error) {
        info.push({
          name,
          available: false,
          dependencies: {
            available: false,
            error: error.message,
            details: {}
          },
          capabilities: null
        });
      }
    }
    return info;
  }
  /**
   * Check if OCR functionality is available in the current environment.
   *
   * This is a quick check to determine if any OCR provider can be used
   * before attempting to process images.
   *
   * @returns Promise resolving to true if OCR is available, false otherwise
   *
   * @example
   * ```typescript
   * if (await factory.isOCRAvailable()) {
   *   const result = await factory.performOCR(images);
   * } else {
   *   console.log('OCR not available - check dependencies');
   * }
   * ```
   */
  async isOCRAvailable() {
    const provider = await this.getBestProvider();
    return provider !== null;
  }
  /**
   * Get array of supported language codes from the best available provider.
   *
   * Returns language codes that can be used in the language option
   * for OCR processing. The list depends on which provider is selected.
   *
   * @returns Promise resolving to array of language codes
   *
   * @example
   * ```typescript
   * const languages = await factory.getSupportedLanguages();
   * console.log('Supported languages:', languages);
   * // ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'fra', ...]
   *
   * // Use in OCR processing
   * const result = await factory.performOCR(images, {
   *   language: languages.includes('jpn') ? 'eng+jpn' : 'eng'
   * });
   * ```
   */
  async getSupportedLanguages() {
    const provider = await this.getBestProvider();
    if (!provider) {
      return [];
    }
    return provider.getSupportedLanguages();
  }
  /**
   * Clean up all OCR providers and release their resources.
   *
   * This method should be called when the factory is no longer needed
   * to properly dispose of resources like workers, models, and memory.
   * Failure to call cleanup may result in resource leaks.
   *
   * @example
   * ```typescript
   * const factory = new OCRFactory();
   * try {
   *   const result = await factory.performOCR(images);
   *   // Process results...
   * } finally {
   *   await factory.cleanup();
   * }
   * ```
   *
   * @example Using in Node.js process cleanup
   * ```typescript
   * const factory = new OCRFactory();
   *
   * process.on('SIGINT', async () => {
   *   await factory.cleanup();
   *   process.exit(0);
   * });
   * ```
   */
  async cleanup() {
    const cleanupPromises = [];
    for (const provider of this.providers.values()) {
      if (provider.cleanup) {
        cleanupPromises.push(provider.cleanup());
      }
    }
    if (cleanupPromises.length > 0) {
      await Promise.allSettled(cleanupPromises);
    }
  }
  /**
   * Add a custom OCR provider to the factory.
   *
   * Allows extending the factory with additional OCR providers
   * beyond the built-in ones. Custom providers must implement
   * the OCRProvider interface.
   *
   * @param name - Unique name for the provider
   * @param provider - Provider instance implementing OCRProvider interface
   *
   * @example
   * ```typescript
   * class CustomOCRProvider implements OCRProvider {
   *   readonly name = 'custom';
   *   // ... implement required methods
   * }
   *
   * const factory = new OCRFactory();
   * factory.addProvider('custom', new CustomOCRProvider());
   *
   * // Now can use custom provider
   * const customFactory = new OCRFactory({ provider: 'custom' });
   * ```
   */
  addProvider(name, provider) {
    this.providers.set(name, provider);
  }
  /**
   * Remove an OCR provider from the factory.
   *
   * Removes the provider and calls its cleanup method if available
   * to properly dispose of resources.
   *
   * @param name - Name of the provider to remove
   *
   * @example
   * ```typescript
   * await factory.removeProvider('custom');
   * // Provider cleaned up and removed
   * ```
   */
  async removeProvider(name) {
    const provider = this.providers.get(name);
    if (provider?.cleanup) {
      await provider.cleanup();
    }
    this.providers.delete(name);
  }
  /**
   * Get array of provider names that have been loaded in the current environment.
   *
   * This returns the names of providers that were successfully imported,
   * but doesn't guarantee they have all required dependencies available.
   * Use getProvidersInfo() for detailed availability information.
   *
   * @returns Array of loaded provider names
   *
   * @example
   * ```typescript
   * const providerNames = factory.getAvailableProviderNames();
   * console.log('Loaded providers:', providerNames);
   * // ['tesseract', 'onnx'] in Node.js
   * // ['tesseract', 'web-ocr'] in browser
   * ```
   */
  getAvailableProviderNames() {
    return Array.from(this.providers.keys());
  }
  /**
   * Get the detected runtime environment.
   *
   * @returns The environment where the factory is running
   *
   * @example
   * ```typescript
   * const env = factory.getEnvironment();
   * if (env === 'node') {
   *   console.log('Running in Node.js - full provider support');
   * } else if (env === 'browser') {
   *   console.log('Running in browser - limited to web-compatible providers');
   * }
   * ```
   */
  getEnvironment() {
    return this.environment;
  }
}
let globalOCRFactory = null;
function getOCR(options) {
  if (options && Object.keys(options).length > 0) {
    return new OCRFactory(options);
  }
  if (!globalOCRFactory) {
    globalOCRFactory = new OCRFactory();
  }
  return globalOCRFactory;
}
function resetOCRFactory() {
  if (globalOCRFactory) {
    globalOCRFactory.cleanup().catch(() => {
    });
  }
  globalOCRFactory = null;
}
async function getAvailableProviders() {
  const factory = getOCR();
  await factory.initializeProviders();
  return factory.getAvailableProviderNames();
}
async function isProviderAvailable(providerName) {
  const factory = getOCR();
  const providersInfo = await factory.getProvidersInfo();
  const providerInfo = providersInfo.find((p) => p.name === providerName);
  return providerInfo?.available ?? false;
}
async function getProviderInfo(providerName) {
  const factory = getOCR();
  const providersInfo = await factory.getProvidersInfo();
  return providersInfo.find((p) => p.name === providerName) ?? null;
}
export {
  OCRDependencyError,
  OCRError,
  OCRFactory,
  OCRProcessingError,
  OCRUnsupportedError,
  getOCR as default,
  getAvailableProviders,
  getOCR,
  getProviderInfo,
  isProviderAvailable,
  resetOCRFactory
};
//# sourceMappingURL=index.js.map
