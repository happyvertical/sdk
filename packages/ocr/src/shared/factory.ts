/**
 * @have/ocr - OCR factory for managing multiple providers with fallback
 */

import type {
  OCRProvider,
  OCRFactoryOptions,
  OCRImage,
  OCROptions,
  OCRResult,
  OCRProviderInfo,
  OCREnvironment,
  DependencyCheckResult,
  OCRCapabilities,
} from './types.js';

import { OCRError, OCRDependencyError } from './types.js';

/**
 * Detect the current environment
 */
function detectEnvironment(): OCREnvironment {
  // Use globalThis to avoid TypeScript issues with global objects
  const globalObj = globalThis as any;
  
  if (typeof globalObj.window !== 'undefined' && typeof globalObj.document !== 'undefined') {
    return 'browser';
  }
  if (typeof globalObj.process !== 'undefined' && globalObj.process?.versions?.node) {
    return 'node';
  }
  return 'unknown';
}

/**
 * OCR factory that manages multiple OCR providers with intelligent fallback
 * 
 * This factory:
 * - Selects the best available OCR provider based on environment
 * - Falls back to alternative providers if the primary fails
 * - Provides a unified interface for all OCR operations
 * - Handles dependency checking and graceful degradation
 */
export class OCRFactory {
  private providers = new Map<string, OCRProvider>();
  private primaryProvider: string = 'auto';
  private fallbackProviders: string[] = [];
  private defaultOptions?: OCROptions;
  private environment: OCREnvironment;
  private initialized = false;

  constructor(options: OCRFactoryOptions = {}) {
    this.primaryProvider = options.provider || 'auto';
    this.fallbackProviders = options.fallbackProviders || [];
    this.defaultOptions = options.defaultOptions;
    this.environment = detectEnvironment();
  }

  /**
   * Initialize providers based on environment
   */
  private async initializeProviders(): Promise<void> {
    if (this.initialized) return;

    try {
      // Always try to load Tesseract.js (works in both environments)
      try {
        const { TesseractProvider } = await import('../node/tesseract.js');
        this.providers.set('tesseract', new TesseractProvider());
      } catch {
        // Ignore if tesseract provider fails to load
      }

      // Environment-specific providers
      if (this.environment === 'node') {
        // ONNX provider (Node.js only for now) - using @gutenye/ocr-node
        try {
          const { ONNXGutenyeProvider } = await import('../node/onnx-gutenye.js');
          this.providers.set('onnx', new ONNXGutenyeProvider());
        } catch {
          // Ignore if ONNX provider fails to load
        }
      } else if (this.environment === 'browser') {
        // Browser-specific providers
        try {
          const { WebOCRProvider } = await import('../browser/web-ocr.js');
          this.providers.set('web-ocr', new WebOCRProvider());
        } catch {
          // Ignore if Web OCR provider fails to load
        }
      }

      this.initialized = true;
    } catch (error) {
      console.warn('OCR factory initialization failed:', error);
      this.initialized = true; // Continue with whatever providers loaded
    }
  }

  /**
   * Get the best available OCR provider based on dependencies and environment
   */
  async getBestProvider(): Promise<OCRProvider | null> {
    await this.initializeProviders();

    // If a specific provider is requested, try to use it
    if (this.primaryProvider !== 'auto') {
      const provider = this.providers.get(this.primaryProvider);
      if (provider) {
        const deps = await provider.checkDependencies();
        if (deps.available) {
          return provider;
        }
        console.warn(`Primary OCR provider '${this.primaryProvider}' not available:`, deps.error);
      }
    }

    // Auto-select or fall back to the best available provider
    const providerPriority = this.primaryProvider === 'auto' 
      ? this.getDefaultProviderPriority()
      : [this.primaryProvider, ...this.fallbackProviders];

    // Check all providers in parallel for faster detection
    const providerChecks = providerPriority.map(async (providerName) => {
      const provider = this.providers.get(providerName);
      if (!provider) return { name: providerName, available: false, provider: null };
      
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
    
    // Return first available provider in priority order
    for (const providerName of providerPriority) {
      const result = results.find(r => r.name === providerName);
      if (result?.available && result.provider) {
        return result.provider;
      }
      if (result && !result.available && result.error) {
        console.debug(`OCR provider '${providerName}' not available:`, result.error);
      }
    }

    console.warn('No OCR providers are available. OCR functionality will be disabled.');
    return null;
  }

  /**
   * Get default provider priority based on environment and capabilities
   */
  private getDefaultProviderPriority(): string[] {
    if (this.environment === 'node') {
      return ['onnx', 'tesseract'];
    } else if (this.environment === 'browser') {
      return ['tesseract', 'web-ocr'];
    }
    return ['tesseract'];
  }

  /**
   * Perform OCR using the best available provider with fallback
   */
  async performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult> {
    if (!images || images.length === 0) {
      return {
        text: '',
        confidence: 0,
        detections: [],
        metadata: {
          processingTime: 0,
          provider: 'none',
        },
      };
    }

    // Merge default options with provided options
    const mergedOptions = { ...this.defaultOptions, ...options };

    // Get the best available provider
    const provider = await this.getBestProvider();
    if (!provider) {
      throw new OCRDependencyError('none', 'No OCR providers are available');
    }

    try {
      const startTime = Date.now();
      const result = await provider.performOCR(images, mergedOptions);
      const processingTime = Date.now() - startTime;
      
      // Enhance result with metadata
      result.metadata = {
        ...result.metadata,
        processingTime,
        provider: provider.name,
        language: mergedOptions.language,
      };
      
      // If result is empty and we have fallback providers, try them
      if ((!result.text || result.text.trim().length === 0) && this.fallbackProviders.length > 0) {
        for (const fallbackName of this.fallbackProviders) {
          if (fallbackName === provider.name) continue; // Skip if it's the same provider
          
          const fallbackProvider = this.providers.get(fallbackName);
          if (fallbackProvider) {
            try {
              const deps = await fallbackProvider.checkDependencies();
              if (deps.available) {
                const fallbackResult = await fallbackProvider.performOCR(images, mergedOptions);
                if (fallbackResult.text && fallbackResult.text.trim().length > 0) {
                  console.info(`OCR fallback to '${fallbackName}' provider succeeded`);
                  fallbackResult.metadata = {
                    ...fallbackResult.metadata,
                    provider: fallbackProvider.name,
                    fallbackFrom: provider.name,
                  };
                  return fallbackResult;
                }
              }
            } catch (fallbackError) {
              console.warn(`OCR fallback provider '${fallbackName}' failed:`, fallbackError);
            }
          }
        }
      }

      return result;
    } catch (error) {
      console.error(`OCR provider '${provider.name}' failed:`, error);
      throw new OCRError(`OCR processing failed: ${(error as Error).message}`, provider.name, error);
    }
  }

  /**
   * Get information about all available OCR providers
   */
  async getProvidersInfo(): Promise<OCRProviderInfo[]> {
    await this.initializeProviders();
    
    const info: OCRProviderInfo[] = [];

    for (const [name, provider] of this.providers) {
      try {
        const [dependencies, capabilities] = await Promise.all([
          provider.checkDependencies(),
          provider.checkCapabilities(),
        ]);

        info.push({
          name,
          available: dependencies.available,
          dependencies,
          capabilities,
        });
      } catch (error) {
        info.push({
          name,
          available: false,
          dependencies: {
            available: false,
            error: (error as Error).message,
            details: {},
          },
          capabilities: null,
        });
      }
    }

    return info;
  }

  /**
   * Check if any OCR provider is available
   */
  async isOCRAvailable(): Promise<boolean> {
    const provider = await this.getBestProvider();
    return provider !== null;
  }

  /**
   * Get supported languages from the best available provider
   */
  async getSupportedLanguages(): Promise<string[]> {
    const provider = await this.getBestProvider();
    if (!provider) {
      return [];
    }

    return provider.getSupportedLanguages();
  }

  /**
   * Clean up all OCR providers and their resources
   */
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

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
   * Add a custom OCR provider
   */
  addProvider(name: string, provider: OCRProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Remove an OCR provider
   */
  async removeProvider(name: string): Promise<void> {
    const provider = this.providers.get(name);
    if (provider && provider.cleanup) {
      await provider.cleanup();
    }
    this.providers.delete(name);
  }

  /**
   * Get available provider names in current environment
   */
  getAvailableProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get current environment
   */
  getEnvironment(): OCREnvironment {
    return this.environment;
  }
}

// Global factory instance
let globalOCRFactory: OCRFactory | null = null;

/**
 * Get or create an OCR factory instance
 * 
 * If no options are provided, returns the global singleton.
 * If options are provided, creates a new instance with those options.
 */
export function getOCR(options?: OCRFactoryOptions): OCRFactory {
  // If specific options are provided, create a new instance
  if (options && Object.keys(options).length > 0) {
    return new OCRFactory(options);
  }
  
  // Otherwise, use the global singleton
  if (!globalOCRFactory) {
    globalOCRFactory = new OCRFactory();
  }
  return globalOCRFactory;
}

/**
 * Reset the global OCR factory (useful for testing)
 */
export function resetOCRFactory(): void {
  if (globalOCRFactory) {
    globalOCRFactory.cleanup().catch(() => {
      // Ignore cleanup errors during reset
    });
  }
  globalOCRFactory = null;
}

/**
 * Get available OCR providers in current environment
 */
export async function getAvailableProviders(): Promise<string[]> {
  const factory = getOCR();
  await factory['initializeProviders'](); // Access private method for initialization
  return factory.getAvailableProviderNames();
}

/**
 * Check if a specific OCR provider is available
 */
export async function isProviderAvailable(providerName: string): Promise<boolean> {
  const factory = getOCR();
  const providersInfo = await factory.getProvidersInfo();
  const providerInfo = providersInfo.find(p => p.name === providerName);
  return providerInfo?.available ?? false;
}

/**
 * Get information about a specific OCR provider
 */
export async function getProviderInfo(providerName: string): Promise<OCRProviderInfo | null> {
  const factory = getOCR();
  const providersInfo = await factory.getProvidersInfo();
  return providersInfo.find(p => p.name === providerName) ?? null;
}