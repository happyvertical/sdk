import { DependencyCheckResult, OCRCapabilities, OCRImage, OCROptions, OCRProvider, OCRResult } from '../shared/types';
/**
 * Tesseract.js OCR provider implementation for cross-platform text extraction.
 *
 * This provider leverages Tesseract.js to provide reliable OCR capabilities
 * without requiring system-level dependencies. It's the most compatible
 * provider in the @have/ocr package, working in virtually any JavaScript
 * environment.
 *
 * ## Key Features
 *
 * - **Zero Dependencies**: Pure JavaScript implementation using WebAssembly
 * - **Cross-Platform**: Works in Node.js, browsers, and other JavaScript environments
 * - **Multi-Language**: Supports 100+ languages with automatic model downloading
 * - **Confidence Scores**: Provides word-level and overall confidence metrics
 * - **Bounding Boxes**: Returns precise text positioning information
 * - **Worker Management**: Efficient worker pooling for concurrent processing
 *
 * ## Language Support
 *
 * Supports all major languages including:
 * - English (eng), Chinese Simplified/Traditional (chi_sim/chi_tra)
 * - Japanese (jpn), Korean (kor), Arabic (ara)
 * - European languages: French (fra), German (deu), Spanish (spa), etc.
 * - Many others with automatic model download on first use
 *
 * ## Performance Characteristics
 *
 * - **Accuracy**: Good for machine-printed text, decent for handwriting
 * - **Speed**: Moderate (slower than ONNX, but very reliable)
 * - **Memory**: Reasonable memory usage with worker cleanup
 * - **Initialization**: First use downloads language models (~2-10MB each)
 *
 * @example Basic usage
 * ```typescript
 * const provider = new TesseractProvider();
 * const result = await provider.performOCR([
 *   { data: imageBuffer, format: 'png' }
 * ], {
 *   language: 'eng',
 *   confidenceThreshold: 70
 * });
 * ```
 *
 * @example Multi-language processing
 * ```typescript
 * const result = await provider.performOCR(images, {
 *   language: 'eng+chi_sim+jpn'
 * });
 * ```
 */
export declare class TesseractProvider implements OCRProvider {
    readonly name = "tesseract";
    private tesseract;
    private workers;
    /**
     * Lazy load Tesseract.js module and verify its structure.
     *
     * This method imports the Tesseract.js module and validates that it
     * has the expected API. The module is cached after first load.
     *
     * @returns The loaded Tesseract.js module
     * @throws {OCRDependencyError} If Tesseract.js cannot be loaded or has unexpected structure
     * @private
     */
    private loadTesseract;
    /**
     * Get or create a Tesseract worker for the specified language.
     *
     * Workers are cached per language to avoid repeated initialization costs.
     * If a worker doesn't exist for the language, a new one is created and
     * the required language model is downloaded automatically.
     *
     * @param language - Language code for the worker (e.g., 'eng', 'chi_sim')
     * @returns Promise resolving to a Tesseract worker instance
     * @throws {OCRDependencyError} If worker creation fails
     * @private
     */
    private getWorker;
    /**
     * Perform OCR processing on images using Tesseract.js.
     *
     * Processes each image in sequence, extracting text with confidence scores
     * and optional bounding box information. Results are combined into a
     * single OCRResult with overall statistics.
     *
     * @param images - Array of images to process
     * @param options - Optional processing configuration
     * @returns Promise resolving to combined OCR results
     *
     * @throws {OCRDependencyError} If Tesseract.js dependencies are not available
     * @throws {OCRProcessingError} If OCR processing fails
     *
     * @example Process multiple images
     * ```typescript
     * const result = await provider.performOCR([
     *   { data: page1Buffer, format: 'png' },
     *   { data: page2Buffer, format: 'jpg' }
     * ], {
     *   language: 'eng',
     *   confidenceThreshold: 80
     * });
     *
     * console.log('Combined text:', result.text);
     * console.log('Average confidence:', result.confidence);
     * ```
     */
    performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
    /**
     * Map common language codes to Tesseract.js-specific language codes.
     *
     * Converts standard language codes (ISO 639-1, etc.) to the specific
     * codes used by Tesseract.js for consistency across different providers.
     *
     * @param code - Input language code
     * @returns Tesseract.js-compatible language code
     * @private
     *
     * @example
     * ```typescript
     * this.mapLanguageCode('en') // returns 'eng'
     * this.mapLanguageCode('zh-cn') // returns 'chi_sim'
     * this.mapLanguageCode('unknown') // returns 'unknown' (pass-through)
     * ```
     */
    private mapLanguageCode;
    /**
     * Get array of language codes supported by Tesseract.js.
     *
     * Returns the most commonly used languages. Tesseract.js actually
     * supports 100+ languages, but this list includes the most frequently
     * needed ones. Additional languages can be used by specifying their
     * Tesseract language codes directly.
     *
     * @returns Array of supported language codes
     *
     * @example
     * ```typescript
     * const languages = provider.getSupportedLanguages();
     * console.log('Supported:', languages.slice(0, 5)); // ['eng', 'chi_sim', ...]
     * ```
     */
    getSupportedLanguages(): string[];
    /**
     * Check and return the capabilities of the Tesseract.js provider.
     *
     * Returns comprehensive information about what the provider can do,
     * including supported formats, features, and limitations.
     *
     * @returns Promise resolving to provider capabilities
     *
     * @example
     * ```typescript
     * const caps = await provider.checkCapabilities();
     * console.log('Can perform OCR:', caps.canPerformOCR);
     * console.log('Languages:', caps.supportedLanguages.length);
     * console.log('Has bounding boxes:', caps.hasBoundingBoxes);
     * ```
     */
    checkCapabilities(): Promise<OCRCapabilities>;
    /**
     * Check if Tesseract.js dependencies are available and functional.
     *
     * Performs a lightweight check to verify that Tesseract.js can be
     * imported and has the expected API structure. Does not create
     * workers or download models.
     *
     * @returns Promise resolving to dependency check results
     *
     * @example
     * ```typescript
     * const deps = await provider.checkDependencies();
     * if (deps.available) {
     *   console.log('Tesseract.js is ready to use');
     * } else {
     *   console.log('Issue:', deps.error);
     * }
     * ```
     */
    checkDependencies(): Promise<DependencyCheckResult>;
    /**
     * Clean up all Tesseract workers and release resources.
     *
     * Terminates all cached workers and clears the worker cache.
     * This should be called when the provider is no longer needed
     * to prevent resource leaks.
     *
     * @example
     * ```typescript
     * const provider = new TesseractProvider();
     * try {
     *   await provider.performOCR(images);
     * } finally {
     *   await provider.cleanup();
     * }
     * ```
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=tesseract.d.ts.map