/**
 * @have/pdf - Factory for creating PDF readers with automatic provider selection
 */

import type { PDFReader, PDFReaderOptions } from './types.js';

/**
 * Get a PDF reader instance with automatic provider selection based on environment
 * 
 * @param options - Configuration options for the PDF reader
 * @returns Promise resolving to a PDFReader instance
 * 
 * @example
 * ```typescript
 * // Get default reader (auto-detects environment)
 * const reader = await getPDFReader();
 * 
 * // Get reader with specific options
 * const reader = await getPDFReader({
 *   provider: 'unpdf',
 *   enableOCR: true,
 *   timeout: 30000
 * });
 * 
 * // Extract text from a PDF
 * const text = await reader.extractText('/path/to/document.pdf');
 * ```
 */
export async function getPDFReader(options: PDFReaderOptions = {}): Promise<PDFReader> {
  const { provider = 'auto', ...readerOptions } = options;

  // Detect environment if provider is auto
  const isNode = typeof process !== 'undefined' && 
                 process?.versions?.node !== undefined;
  const isBrowser = typeof globalThis !== 'undefined' && 
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
      throw new Error('Unable to detect environment for automatic provider selection');
    }
  }

  // Create the appropriate provider
  switch (selectedProvider) {
    case 'unpdf': {
      if (!isNode) {
        throw new Error('unpdf provider is only available in Node.js environments');
      }
      
      // Dynamic import to avoid bundling Node.js code in browser
      const { CombinedNodeProvider } = await import('../node/combined.js');
      return new CombinedNodeProvider();
    }
    
    case 'pdfjs': {
      if (!isBrowser) {
        throw new Error('pdfjs provider is only available in browser environments');
      }
      
      // This code path should never be reached in Node.js builds
      // The browser entry point will handle this provider
      throw new Error('pdfjs provider should be handled by browser entry point');
    }
    
    default:
      throw new Error(`Unknown PDF provider: ${selectedProvider}`);
  }
}

/**
 * Get available PDF providers in the current environment
 * 
 * @returns Array of available provider names
 */
export function getAvailableProviders(): string[] {
  const providers: string[] = [];
  
  const isNode = typeof process !== 'undefined' && 
                 process?.versions?.node !== undefined;
  const isBrowser = typeof globalThis !== 'undefined' && 
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
 * Check if a specific provider is available in the current environment
 * 
 * @param provider - Provider name to check
 * @returns Boolean indicating if the provider is available
 */
export function isProviderAvailable(provider: string): boolean {
  return getAvailableProviders().includes(provider);
}

/**
 * Get information about a specific provider
 * 
 * @param provider - Provider name
 * @returns Promise resolving to provider capabilities and dependency status
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
 * Initialize PDF readers and check dependencies
 * Called automatically when the module is imported
 */
export async function initializeProviders(): Promise<void> {
  try {
    const availableProviders = getAvailableProviders();
    
    for (const provider of availableProviders) {
      try {
        const info = await getProviderInfo(provider);
        if (!info.dependencies?.available) {
          console.warn(`PDF provider '${provider}' is available but dependencies are missing:`, info.dependencies?.error);
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