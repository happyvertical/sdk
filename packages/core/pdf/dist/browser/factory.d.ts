import { PDFReader, PDFReaderOptions } from '../shared/types';
/**
 * Get a PDF reader instance for browser environments
 *
 * @param options - Configuration options for the PDF reader
 * @returns Promise resolving to a PDFReader instance
 */
export declare function getPDFReader(options?: PDFReaderOptions): Promise<PDFReader>;
/**
 * Get available PDF providers in the browser environment
 *
 * @returns Array of available provider names
 */
export declare function getAvailableProviders(): string[];
/**
 * Check if a specific provider is available in the browser environment
 *
 * @param provider - Provider name to check
 * @returns Boolean indicating if the provider is available
 */
export declare function isProviderAvailable(provider: string): boolean;
/**
 * Get information about a specific provider
 *
 * @param provider - Provider name
 * @returns Promise resolving to provider capabilities and dependency status
 */
export declare function getProviderInfo(provider: string): Promise<{
    provider: string;
    available: boolean;
    capabilities: import('..').PDFCapabilities;
    dependencies: import('packages/core/ocr/dist').DependencyCheckResult;
    error?: undefined;
} | {
    provider: string;
    available: boolean;
    error: string;
    capabilities: null;
    dependencies: null;
}>;
/**
 * Initialize PDF readers and check dependencies
 * Called automatically when the module is imported
 */
export declare function initializeProviders(): Promise<void>;
//# sourceMappingURL=factory.d.ts.map