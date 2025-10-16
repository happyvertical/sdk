import { OCREnvironment, OCRFactoryOptions, OCRImage, OCROptions, OCRProvider, OCRProviderInfo, OCRResult } from './types';
/**
 * Main factory class for managing OCR providers with intelligent selection and fallback.
 *
 * The OCRFactory handles the complexities of multiple OCR providers by:
 * - Automatically detecting the best available provider for the current environment
 * - Providing seamless fallback when primary providers fail or are unavailable
 * - Offering a unified API that abstracts away provider-specific differences
 * - Managing provider lifecycles including initialization and cleanup
 * - Handling dependency checking and providing detailed error information
 *
 * @example Basic usage with auto provider selection
 * ```typescript
 * const factory = new OCRFactory();
 * const result = await factory.performOCR([
 *   { data: imageBuffer, format: 'png' }
 * ]);
 * console.log('Extracted text:', result.text);
 * ```
 *
 * @example Specific provider with fallback
 * ```typescript
 * const factory = new OCRFactory({
 *   provider: 'onnx',
 *   fallbackProviders: ['tesseract'],
 *   defaultOptions: {
 *     language: 'eng',
 *     confidenceThreshold: 80
 *   }
 * });
 * ```
 *
 * @example Multi-language processing
 * ```typescript
 * const factory = new OCRFactory({
 *   defaultOptions: {
 *     language: 'eng+chi_sim+jpn',
 *     outputFormat: 'json'
 *   }
 * });
 *
 * const result = await factory.performOCR(images);
 * if (result.detections) {
 *   for (const detection of result.detections) {
 *     console.log(`"${detection.text}" (${detection.confidence}%)`);
 *   }
 * }
 * ```
 */
export declare class OCRFactory {
    private providers;
    private primaryProvider;
    private fallbackProviders;
    private defaultOptions?;
    private environment;
    private initialized;
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
    constructor(options?: OCRFactoryOptions);
    /**
     * Initialize available OCR providers based on the current environment.
     *
     * This method dynamically imports and instantiates providers that are
     * compatible with the current runtime environment. It's called automatically
     * when OCR operations are first requested.
     *
     * @private
     */
    initializeProviders(): Promise<void>;
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
    getBestProvider(): Promise<OCRProvider | null>;
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
    private getDefaultProviderPriority;
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
    performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
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
    getProvidersInfo(): Promise<OCRProviderInfo[]>;
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
    isOCRAvailable(): Promise<boolean>;
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
    getSupportedLanguages(): Promise<string[]>;
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
    cleanup(): Promise<void>;
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
    addProvider(name: string, provider: OCRProvider): void;
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
    removeProvider(name: string): Promise<void>;
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
    getAvailableProviderNames(): string[];
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
    getEnvironment(): OCREnvironment;
}
/**
 * Get or create an OCR factory instance with automatic provider selection.
 *
 * This is the recommended way to get an OCR factory. When called without
 * options, it returns a global singleton for efficient resource usage.
 * When called with options, it creates a new instance with custom configuration.
 *
 * @param options - Optional factory configuration. If provided, creates a new instance.
 * @returns OCR factory instance ready for use
 *
 * @example Simple usage (global singleton)
 * ```typescript
 * import { getOCR } from '@have/ocr';
 *
 * const factory = getOCR();
 * const result = await factory.performOCR(images);
 * ```
 *
 * @example Custom configuration (new instance)
 * ```typescript
 * const factory = getOCR({
 *   provider: 'onnx',
 *   fallbackProviders: ['tesseract'],
 *   defaultOptions: {
 *     language: 'eng+chi_sim',
 *     confidenceThreshold: 80
 *   }
 * });
 * ```
 *
 * @example Environment-specific usage
 * ```typescript
 * const factory = getOCR();
 * const env = factory.getEnvironment();
 *
 * const options = env === 'browser'
 *   ? { language: 'eng', timeout: 15000 }
 *   : { language: 'eng+chi_sim', timeout: 30000 };
 *
 * const result = await factory.performOCR(images, options);
 * ```
 */
export declare function getOCR(options?: OCRFactoryOptions): OCRFactory;
/**
 * Reset the global OCR factory instance.
 *
 * Cleans up the current global factory and forces creation of a new one
 * on the next call to getOCR(). Primarily useful for testing or when
 * you need to ensure a fresh factory state.
 *
 * @example
 * ```typescript
 * // In test setup/teardown
 * afterEach(async () => {
 *   resetOCRFactory();
 * });
 * ```
 *
 * @example Force re-initialization
 * ```typescript
 * resetOCRFactory();
 * const factory = getOCR(); // Creates new factory instance
 * ```
 */
export declare function resetOCRFactory(): void;
/**
 * Get list of OCR provider names available in the current environment.
 *
 * This function provides a quick way to check which providers can be loaded
 * without creating a full factory instance. The returned providers may still
 * require dependency checks before use.
 *
 * @returns Promise resolving to array of available provider names
 *
 * @example
 * ```typescript
 * const providers = await getAvailableProviders();
 * console.log('Available providers:', providers);
 * // Node.js: ['tesseract', 'onnx']
 * // Browser: ['tesseract', 'web-ocr']
 *
 * if (providers.includes('onnx')) {
 *   console.log('High-accuracy ONNX OCR is available');
 * }
 * ```
 */
export declare function getAvailableProviders(): Promise<string[]>;
/**
 * Check if a specific OCR provider is available and ready to use.
 *
 * Performs a complete availability check including dependency validation
 * for the specified provider.
 *
 * @param providerName - Name of the provider to check
 * @returns Promise resolving to true if provider is available and functional
 *
 * @example
 * ```typescript
 * const onnxAvailable = await isProviderAvailable('onnx');
 * const tesseractAvailable = await isProviderAvailable('tesseract');
 *
 * console.log('ONNX available:', onnxAvailable);
 * console.log('Tesseract available:', tesseractAvailable);
 *
 * // Choose provider based on availability
 * const provider = onnxAvailable ? 'onnx' : 'tesseract';
 * const factory = getOCR({ provider });
 * ```
 */
export declare function isProviderAvailable(providerName: string): Promise<boolean>;
/**
 * Get detailed information about a specific OCR provider.
 *
 * Returns comprehensive information about the provider including
 * availability, dependencies, and capabilities. Returns null if
 * the provider doesn't exist.
 *
 * @param providerName - Name of the provider to query
 * @returns Promise resolving to provider information or null if not found
 *
 * @example
 * ```typescript
 * const info = await getProviderInfo('tesseract');
 * if (info) {
 *   console.log('Provider available:', info.available);
 *   if (info.available && info.capabilities) {
 *     console.log('Supported languages:', info.capabilities.supportedLanguages.length);
 *     console.log('Has bounding boxes:', info.capabilities.hasBoundingBoxes);
 *   } else {
 *     console.log('Dependency error:', info.dependencies.error);
 *   }
 * } else {
 *   console.log('Provider "tesseract" not found');
 * }
 * ```
 *
 * @example Compare multiple providers
 * ```typescript
 * const providers = ['tesseract', 'onnx', 'web-ocr'];
 * for (const name of providers) {
 *   const info = await getProviderInfo(name);
 *   if (info?.available && info.capabilities) {
 *     console.log(`${name}: ${info.capabilities.supportedLanguages.length} languages`);
 *   }
 * }
 * ```
 */
export declare function getProviderInfo(providerName: string): Promise<OCRProviderInfo | null>;
//# sourceMappingURL=factory.d.ts.map