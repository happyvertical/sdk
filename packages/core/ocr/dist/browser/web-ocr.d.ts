import { DependencyCheckResult, OCRCapabilities, OCRImage, OCROptions, OCRProvider, OCRResult } from '../shared/types';
/**
 * Web OCR provider implementation optimized for browser environments.
 *
 * This provider delivers client-side OCR capabilities using Tesseract.js
 * with WebAssembly, enabling text extraction directly in the browser
 * without any server dependencies or API calls.
 *
 * ## Key Features
 *
 * - **Client-Side Processing**: Complete OCR processing in the browser
 * - **No Server Required**: Zero backend dependencies for privacy and offline use
 * - **WebAssembly Powered**: High-performance processing using WASM
 * - **Progressive Loading**: Models and workers loaded on demand
 * - **Progress Tracking**: Real-time processing progress callbacks
 * - **Memory Efficient**: Automatic resource cleanup and management
 *
 * ## Browser Compatibility
 *
 * - **Modern Browsers**: Chrome 57+, Firefox 52+, Safari 11+, Edge 16+
 * - **WebAssembly**: Required for text recognition processing
 * - **Web Workers**: Used for non-blocking OCR processing
 * - **File API**: For image data handling and processing
 *
 * ## Performance Characteristics
 *
 * - **Accuracy**: Good for machine-printed text, decent for handwriting
 * - **Speed**: Moderate (optimized for browser constraints)
 * - **Memory**: Efficient with automatic cleanup
 * - **Offline**: Works completely offline after initial model download
 * - **Privacy**: All processing happens locally in the browser
 *
 * ## Supported Input Formats
 *
 * - Standard image files: PNG, JPEG, BMP, WebP
 * - Base64 encoded images
 * - Data URLs with image data
 * - Canvas ImageData objects
 * - File objects from input elements
 *
 * @example Basic browser usage
 * ```typescript
 * const provider = new WebOCRProvider();
 * const result = await provider.performOCR([
 *   { data: imageFile } // File from input element
 * ], {
 *   language: 'eng',
 *   confidenceThreshold: 70
 * });
 * ```
 *
 * @example Processing from canvas
 * ```typescript
 * const canvas = document.getElementById('canvas');
 * const imageData = canvas.toDataURL('image/png');
 * const result = await provider.performOCR([
 *   { data: imageData }
 * ]);
 * ```
 *
 * @example Progress tracking
 * ```typescript
 * const provider = new WebOCRProvider();
 * // Progress tracking is built into the provider
 * const result = await provider.performOCR(images);
 * // Check browser console for progress updates
 * ```
 */
export declare class WebOCRProvider implements OCRProvider {
    readonly name = "web-ocr";
    private tesseract;
    private workers;
    /**
     * Lazy load Tesseract.js module and verify browser compatibility.
     *
     * Loads the Tesseract.js module and validates that the current browser
     * environment supports the required features (WebAssembly, Web Workers).
     *
     * @returns The loaded Tesseract.js module
     * @throws {OCRDependencyError} If browser environment is incompatible
     * @private
     */
    private loadTesseract;
    /**
     * Get or create a Tesseract worker optimized for browser use.
     *
     * Creates workers with browser-specific optimizations including
     * progress logging and memory management. Workers are cached
     * per language to minimize initialization overhead.
     *
     * @param language - Language code for the worker
     * @returns Promise resolving to a browser-optimized Tesseract worker
     * @throws {OCRDependencyError} If worker creation fails
     * @private
     */
    private getWorker;
    /**
     * Perform OCR processing in the browser using Tesseract.js and WebAssembly.
     *
     * Processes images entirely client-side with progress tracking and
     * memory-efficient handling. Supports various browser-specific input
     * formats including File objects, data URLs, and base64 strings.
     *
     * @param images - Array of images to process
     * @param options - Optional processing configuration
     * @returns Promise resolving to OCR results with browser-optimized processing
     *
     * @throws {OCRDependencyError} If browser environment is incompatible
     * @throws {OCRProcessingError} If OCR processing fails
     *
     * @example File input processing
     * ```typescript
     * const fileInput = document.getElementById('imageFile');
     * const file = fileInput.files[0];
     * const result = await provider.performOCR([
     *   { data: file }
     * ], {
     *   language: 'eng',
     *   timeout: 30000 // Browser timeout
     * });
     * ```
     *
     * @example Canvas data processing
     * ```typescript
     * const canvas = document.getElementById('canvas');
     * const dataURL = canvas.toDataURL('image/png');
     * const result = await provider.performOCR([
     *   { data: dataURL }
     * ]);
     * ```
     */
    performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
    /**
     * Map common language codes to Tesseract.js-compatible codes for browser use.
     *
     * Converts standard language codes to Tesseract format, with consideration
     * for browser-specific language model availability and download sizes.
     *
     * @param code - Input language code
     * @returns Tesseract.js-compatible language code
     * @private
     */
    private mapLanguageCode;
    /**
     * Get array of language codes supported in browser environments.
     *
     * Returns commonly used languages that work well in browsers with
     * reasonable model download sizes and good performance characteristics.
     *
     * @returns Array of browser-optimized language codes
     *
     * @example
     * ```typescript
     * const languages = provider.getSupportedLanguages();
     * console.log('Browser supports:', languages);
     * // ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'ara', ...]
     * ```
     */
    getSupportedLanguages(): string[];
    /**
     * Check and return the capabilities of the Web OCR provider.
     *
     * Returns browser-specific capabilities including memory limitations,
     * supported formats, and special features available in web environments.
     *
     * @returns Promise resolving to browser-optimized capabilities
     *
     * @example
     * ```typescript
     * const caps = await provider.checkCapabilities();
     * console.log('Max image size:', caps.maxImageSize); // Browser memory limit
     * console.log('Browser features:', caps.providerSpecific);
     * ```
     */
    checkCapabilities(): Promise<OCRCapabilities>;
    /**
     * Check if Web OCR dependencies are available in the current browser.
     *
     * Performs comprehensive browser compatibility checks including
     * WebAssembly support, Web Workers availability, and Tesseract.js
     * module loading. Includes timeout protection for network-dependent checks.
     *
     * @returns Promise resolving to detailed dependency check results
     *
     * @example
     * ```typescript
     * const deps = await provider.checkDependencies();
     * if (deps.available) {
     *   console.log('Browser is ready for OCR processing');
     * } else {
     *   console.log('Browser compatibility issue:', deps.error);
     *   console.log('Details:', deps.details);
     * }
     * ```
     */
    checkDependencies(): Promise<DependencyCheckResult>;
    /**
     * Clean up all Web Workers and browser resources.
     *
     * Terminates all cached workers and releases browser resources
     * including memory used by WebAssembly modules and language models.
     * Important for preventing memory leaks in long-running web applications.
     *
     * @example
     * ```typescript
     * const provider = new WebOCRProvider();
     * try {
     *   await provider.performOCR(images);
     * } finally {
     *   await provider.cleanup();
     * }
     * ```
     *
     * @example Page unload cleanup
     * ```typescript
     * window.addEventListener('beforeunload', async () => {
     *   await provider.cleanup();
     * });
     * ```
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=web-ocr.d.ts.map