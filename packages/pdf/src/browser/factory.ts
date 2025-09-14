/**
 * @have/pdf - Browser-specific factory for creating PDF readers
 */

import type { PDFReader, PDFReaderOptions } from '../shared/types.js';

/**
 * Get a PDF reader instance for browser environments
 * 
 * @param options - Configuration options for the PDF reader
 * @returns Promise resolving to a PDFReader instance
 */
export async function getPDFReader(options: PDFReaderOptions = {}): Promise<PDFReader> {
  const { provider = 'auto', ...readerOptions } = options;

  // In browser, we only support PDF.js-based providers
  let selectedProvider = provider;
  if (provider === 'auto') {
    selectedProvider = 'pdfjs';
  }

  // Create the appropriate provider
  switch (selectedProvider) {
    case 'pdfjs': {
      const { CombinedBrowserProvider } = await import('./combined.js');
      return new CombinedBrowserProvider();
    }
    
    default:
      throw new Error(`PDF provider '${selectedProvider}' is not available in browser environments. Available providers: pdfjs`);
  }
}

/**
 * Get available PDF providers in the browser environment
 * 
 * @returns Array of available provider names
 */
export function getAvailableProviders(): string[] {
  return ['pdfjs'];
}

/**
 * Check if a specific provider is available in the browser environment
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