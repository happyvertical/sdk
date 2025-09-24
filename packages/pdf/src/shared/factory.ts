/**
 * @have/pdf - Factory for creating PDF readers with automatic provider selection
 */

import type { PDFReader, PDFReaderOptions } from './types.js';

/**
 * Create a PDF reader instance with intelligent provider selection and configuration
 *
 * This is the primary entry point for PDF processing. Automatically selects the best
 * available provider for the current environment unless a specific provider is requested.
 * Supports comprehensive configuration for processing behavior, timeouts, and OCR settings.
 *
 * @param options - Configuration options controlling provider selection and behavior
 * @returns Promise resolving to a fully configured PDFReader instance
 *
 * @throws {Error} When no suitable provider can be found for the environment
 * @throws {Error} When requested provider is not available in current environment
 * @throws {PDFDependencyError} When provider dependencies are missing
 *
 * @example
 * ```typescript
 * // Auto-detect best provider for current environment
 * const reader = await getPDFReader();
 *
 * // Configure with specific options
 * const reader = await getPDFReader({
 *   provider: 'auto',           // 'unpdf', 'pdfjs', or 'auto'
 *   enableOCR: true,            // Enable OCR fallback for image-based PDFs
 *   timeout: 30000,             // 30 second timeout for operations
 *   maxFileSize: 50 * 1024 * 1024, // 50MB file size limit
 *   defaultOCROptions: {
 *     language: 'eng',           // Default OCR language
 *     confidenceThreshold: 70   // Minimum OCR confidence
 *   }
 * });
 *
 * // Force specific provider (with error handling)
 * try {
 *   const unpdfReader = await getPDFReader({ provider: 'unpdf' });
 * } catch (error) {
 *   if (error.message.includes('only available in Node.js')) {
 *     console.log('Running in browser, using auto-detection instead');
 *     const reader = await getPDFReader({ provider: 'auto' });
 *   }
 * }
 *
 * // Basic document processing workflow
 * const info = await reader.getInfo('/path/to/document.pdf');
 * console.log(`Strategy: ${info.recommendedStrategy}`);
 *
 * const text = await reader.extractText('/path/to/document.pdf');
 * if (text) {
 *   console.log('Extracted text:', text.substring(0, 100) + '...');
 * } else {
 *   console.log('No text found - may be image-based PDF');
 * }
 * ```
 */
export async function getPDFReader(
  options: PDFReaderOptions = {},
): Promise<PDFReader> {
  const { provider = 'auto', ...readerOptions } = options;

  // Environment detection for automatic provider selection
  const isNode =
    typeof process !== 'undefined' && process?.versions?.node !== undefined;
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).window !== 'undefined' &&
    typeof (globalThis as any).document !== 'undefined';

  // Select provider based on environment and preference
  let selectedProvider = provider;
  if (provider === 'auto') {
    if (isNode) {
      selectedProvider = 'unpdf'; // Use unpdf + OCR for Node.js
    } else if (isBrowser) {
      selectedProvider = 'pdfjs'; // Use PDF.js for browser
    } else {
      throw new Error(
        'Unable to detect environment for automatic provider selection',
      );
    }
  }

  // Create the appropriate provider
  switch (selectedProvider) {
    case 'unpdf': {
      if (!isNode) {
        throw new Error(
          'unpdf provider is only available in Node.js environments',
        );
      }

      // Dynamic import to avoid bundling Node.js code in browser
      const { CombinedNodeProvider } = await import('../node/combined.js');
      return new CombinedNodeProvider();
    }

    case 'pdfjs': {
      if (!isBrowser) {
        throw new Error(
          'pdfjs provider is only available in browser environments',
        );
      }

      // This code path should never be reached in Node.js builds
      // The browser entry point will handle this provider
      throw new Error(
        'pdfjs provider should be handled by browser entry point',
      );
    }

    default:
      throw new Error(`Unknown PDF provider: ${selectedProvider}`);
  }
}

/**
 * Get a list of PDF providers available in the current runtime environment
 *
 * Different providers are available depending on the runtime:
 * - Node.js: ['unpdf'] - Full-featured PDF processing with OCR
 * - Browser: ['pdfjs'] - Text extraction and basic metadata (planned)
 * - Edge/Unknown: [] - No providers available
 *
 * @returns Array of provider names available for use with getPDFReader()
 *
 * @example
 * ```typescript
 * const providers = getAvailableProviders();
 * console.log('Available providers:', providers);
 *
 * if (providers.includes('unpdf')) {
 *   console.log('✅ unpdf available for Node.js PDF processing');
 * }
 *
 * if (providers.length === 0) {
 *   console.warn('⚠️ No PDF providers available in this environment');
 * }
 * ```
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = [];

  const isNode =
    typeof process !== 'undefined' && process?.versions?.node !== undefined;
  const isBrowser =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).window !== 'undefined' &&
    typeof (globalThis as any).document !== 'undefined';

  if (isNode) {
    providers.push('unpdf');
  }

  if (isBrowser) {
    providers.push('pdfjs');
  }

  return providers;
}

/**
 * Check if a specific PDF provider is available in the current runtime environment
 *
 * Use this to verify provider availability before attempting to create a reader
 * with a specific provider, avoiding runtime errors from unsupported providers.
 *
 * @param provider - Name of the provider to check ('unpdf', 'pdfjs', etc.)
 * @returns True if the provider is available and can be used in this environment
 *
 * @example
 * ```typescript
 * // Check before using specific provider
 * if (isProviderAvailable('unpdf')) {
 *   const reader = await getPDFReader({ provider: 'unpdf' });
 * } else {
 *   console.warn('unpdf not available, falling back to auto-detection');
 *   const reader = await getPDFReader({ provider: 'auto' });
 * }
 *
 * // Validate user input
 * const userProvider = 'pdfjs';
 * if (!isProviderAvailable(userProvider)) {
 *   throw new Error(`Provider '${userProvider}' not available in this environment`);
 * }
 * ```
 */
export function isProviderAvailable(provider: string): boolean {
  return getAvailableProviders().includes(provider);
}

/**
 * Get comprehensive information about a specific PDF provider's capabilities and status
 *
 * Returns detailed information including availability, capabilities, dependency status,
 * and any error conditions. Useful for diagnostics, feature detection, and graceful
 * degradation in applications.
 *
 * @param provider - Name of the provider to inspect ('unpdf', 'pdfjs', etc.)
 * @returns Promise resolving to detailed provider information object
 *
 * @example
 * ```typescript
 * // Get detailed provider information
 * const info = await getProviderInfo('unpdf');
 *
 * console.log(`Provider: ${info.provider}`);
 * console.log(`Available: ${info.available}`);
 *
 * if (info.available && info.capabilities) {
 *   console.log('✅ Capabilities:');
 *   console.log(`  Text extraction: ${info.capabilities.canExtractText}`);
 *   console.log(`  Image extraction: ${info.capabilities.canExtractImages}`);
 *   console.log(`  OCR support: ${info.capabilities.canPerformOCR}`);
 *   if (info.capabilities.ocrLanguages) {
 *     console.log(`  OCR languages: ${info.capabilities.ocrLanguages.join(', ')}`);
 *   }
 * } else {
 *   console.error('❌ Provider not available:', info.error);
 * }
 *
 * // Check dependencies
 * if (info.dependencies && !info.dependencies.available) {
 *   console.warn('⚠️ Dependency issues:', info.dependencies.error);
 * }
 * ```
 */
export async function getProviderInfo(provider: string) {
  try {
    const reader = await getPDFReader({ provider: provider as any });
    const [capabilities, dependencies] = await Promise.all([
      reader.checkCapabilities(),
      reader.checkDependencies(),
    ]);

    return {
      provider,
      available: isProviderAvailable(provider),
      capabilities,
      dependencies,
    };
  } catch (error) {
    return {
      provider,
      available: false,
      error: (error as Error).message,
      capabilities: null,
      dependencies: null,
    };
  }
}

/**
 * Initialize all available PDF providers and perform dependency validation
 *
 * This function is called automatically when the module is imported to warm up
 * providers and check dependencies. It logs warnings for missing dependencies
 * but doesn't throw errors, allowing providers to fail gracefully when used.
 *
 * @returns Promise that resolves when initialization is complete (or fails silently)
 *
 * @example
 * ```typescript
 * // Manual initialization (usually not needed)
 * await initializeProviders();
 *
 * // Check initialization results
 * const providers = getAvailableProviders();
 * for (const provider of providers) {
 *   const info = await getProviderInfo(provider);
 *   if (!info.dependencies?.available) {
 *     console.warn(`Provider ${provider} has dependency issues`);
 *   }
 * }
 * ```
 */
export async function initializeProviders(): Promise<void> {
  try {
    const availableProviders = getAvailableProviders();

    for (const provider of availableProviders) {
      try {
        const info = await getProviderInfo(provider);
        if (!info.dependencies?.available) {
          console.warn(
            `PDF provider '${provider}' is available but dependencies are missing:`,
            info.dependencies?.error,
          );
        }
      } catch (error) {
        console.warn(`Failed to initialize PDF provider '${provider}':`, error);
      }
    }
  } catch (error) {
    // Ignore initialization errors - providers will fail when used
    console.debug('PDF provider initialization failed:', error);
  }
}
