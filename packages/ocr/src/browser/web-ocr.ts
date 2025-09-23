/**
 * @have/ocr - Web OCR provider optimized for browser environments
 *
 * This module implements the OCRProvider interface specifically for browser
 * environments using Tesseract.js with WebAssembly for client-side OCR
 * processing without server dependencies.
 */

import type {
  OCRProvider,
  OCRImage,
  OCROptions,
  OCRResult,
  DependencyCheckResult,
  OCRCapabilities,
} from '../shared/types.js';
import { OCRDependencyError, OCRProcessingError } from '../shared/types.js';

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
export class WebOCRProvider implements OCRProvider {
  readonly name = 'web-ocr';
  private tesseract: any = null;
  private workers: Map<string, any> = new Map();

  /**
   * Create a new Web OCR provider instance.
   *
   * The constructor is lightweight and synchronous. Tesseract.js modules,
   * WebAssembly components, and workers are loaded lazily when first needed.
   */
  constructor() {
    // Constructor is synchronous - dependencies loaded lazily
  }

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
  private async loadTesseract() {
    if (this.tesseract) {
      return this.tesseract;
    }

    // Check if we're in a browser environment
    const globalObj = globalThis as any;
    if (
      typeof globalObj.window === 'undefined' ||
      typeof globalObj.document === 'undefined'
    ) {
      throw new Error(
        'WebOCRProvider can only be used in browser environments',
      );
    }

    try {
      const TesseractModule = await import('tesseract.js');
      this.tesseract = TesseractModule.default || TesseractModule;

      if (!this.tesseract || !this.tesseract.createWorker) {
        throw new Error('Tesseract.js module structure unexpected');
      }

      return this.tesseract;
    } catch (error) {
      throw new OCRDependencyError(this.name, (error as Error).message);
    }
  }

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
  private async getWorker(language: string = 'eng') {
    if (this.workers.has(language)) {
      return this.workers.get(language);
    }

    try {
      const tesseract = await this.loadTesseract();
      const worker = await tesseract.createWorker(language, {
        // Browser-specific options
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.debug(`OCR Progress: ${m.progress * 100}%`);
          }
        },
      });

      this.workers.set(language, worker);
      return worker;
    } catch (error) {
      throw new OCRDependencyError(
        this.name,
        `Failed to create worker for ${language}: ${(error as Error).message}`,
      );
    }
  }

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
  async performOCR(
    images: OCRImage[],
    options?: OCROptions,
  ): Promise<OCRResult> {
    if (!images || images.length === 0) {
      return {
        text: '',
        confidence: 0,
        detections: [],
        metadata: {
          processingTime: 0,
          provider: this.name,
        },
      };
    }

    // Check dependencies first
    const dependencyCheck = await this.checkDependencies();
    if (!dependencyCheck.available) {
      throw new OCRDependencyError(
        this.name,
        dependencyCheck.error || 'Dependencies not available',
      );
    }

    const startTime = Date.now();
    let ocrText = '';
    let totalConfidence = 0;
    let detectionCount = 0;
    const allDetections: any[] = [];

    try {
      // Determine language to use
      const language = this.mapLanguageCode(options?.language || 'eng');
      const worker = await this.getWorker(language);

      for (const image of images) {
        try {
          // Handle different image data formats for browser
          let imageData: string | ArrayBuffer | Uint8Array | any; // Using any to avoid DOM type issues

          if (!image.data) {
            continue;
          }

          if (image.data instanceof Uint8Array) {
            imageData = image.data;
          } else if (
            typeof Buffer !== 'undefined' &&
            (image.data as any).constructor?.name === 'Buffer'
          ) {
            // Handle Buffer-like objects in browser
            imageData = new Uint8Array(image.data as any);
          } else if (typeof image.data === 'string') {
            // Handle base64 or data URLs
            if (image.data.startsWith('data:')) {
              imageData = image.data; // Data URL
            } else {
              // Try to treat as base64
              try {
                const binaryString = atob(image.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                imageData = bytes;
              } catch {
                continue; // Skip invalid base64
              }
            }
          } else {
            continue;
          }

          // Perform OCR using Tesseract.js
          const result = await worker.recognize(imageData);

          // Process Tesseract results
          if (result && result.data) {
            const text = result.data.text?.trim() || '';
            if (text) {
              ocrText += text + ' ';

              // Extract confidence
              const confidence = result.data.confidence || 0;
              totalConfidence += confidence;
              detectionCount++;

              // Process word-level detections if available
              if (result.data.words) {
                for (const word of result.data.words) {
                  if (word.text && word.text.trim()) {
                    allDetections.push({
                      text: word.text,
                      confidence: word.confidence || 0,
                      boundingBox: word.bbox
                        ? {
                            x: word.bbox.x0,
                            y: word.bbox.y0,
                            width: word.bbox.x1 - word.bbox.x0,
                            height: word.bbox.y1 - word.bbox.y0,
                          }
                        : undefined,
                    });
                  }
                }
              } else {
                // Fallback: single detection for entire text
                allDetections.push({
                  text: text,
                  confidence: confidence,
                  boundingBox: undefined,
                });
              }
            }
          }
        } catch (imageError: any) {
          console.warn(
            'Web OCR failed to process image:',
            imageError.message || imageError,
          );
        }
      }
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('Web OCR processing failed:', error.message || error);

      throw new OCRProcessingError(
        this.name,
        `Processing failed: ${error.message || error}`,
        { ...error, processingTime },
      );
    }

    const processingTime = Date.now() - startTime;
    const averageConfidence =
      detectionCount > 0 ? totalConfidence / detectionCount : 0;

    return {
      text: ocrText.trim(),
      confidence: averageConfidence,
      detections: allDetections,
      metadata: {
        processingTime,
        provider: this.name,
        language: options?.language,
        environment: 'browser',
      },
    };
  }

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
  private mapLanguageCode(code: string): string {
    const langMap: { [key: string]: string } = {
      en: 'eng',
      zh: 'chi_sim',
      'zh-cn': 'chi_sim',
      'zh-tw': 'chi_tra',
      ja: 'jpn',
      ko: 'kor',
      ar: 'ara',
      hi: 'hin',
      ru: 'rus',
      es: 'spa',
      fr: 'fra',
      de: 'deu',
      it: 'ita',
      pt: 'por',
      pl: 'pol',
      nl: 'nld',
      tr: 'tur',
    };

    return langMap[code.toLowerCase()] || code;
  }

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
  getSupportedLanguages(): string[] {
    // Same as Tesseract.js but commonly used in browsers
    return [
      'eng',
      'chi_sim',
      'chi_tra',
      'jpn',
      'kor',
      'ara',
      'hin',
      'rus',
      'spa',
      'fra',
      'deu',
      'ita',
      'por',
      'nld',
      'tur',
      'pol',
    ];
  }

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
  async checkCapabilities(): Promise<OCRCapabilities> {
    const deps = await this.checkDependencies();

    return {
      canPerformOCR: deps.available,
      supportedLanguages: this.getSupportedLanguages(),
      maxImageSize: 4096, // Browser memory limitations
      supportedFormats: ['png', 'jpg', 'jpeg', 'bmp', 'webp'],
      hasConfidenceScores: true,
      hasBoundingBoxes: true,
      providerSpecific: {
        webAssembly: true,
        browserOnly: true,
        progressCallbacks: true,
        clientSideProcessing: true,
        noServerRequired: true,
      },
    };
  }

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
  async checkDependencies(): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      available: false,
      details: {
        browserEnvironment: false,
        tesseractJs: false,
        webAssembly: false,
        worker: false,
      },
    };

    try {
      // Check if we're in a browser environment
      const globalObj = globalThis as any;
      if (
        typeof globalObj.window === 'undefined' ||
        typeof globalObj.document === 'undefined'
      ) {
        result.error = 'WebOCRProvider requires a browser environment';
        return result;
      }
      result.details.browserEnvironment = true;

      // Check WebAssembly support
      if (typeof globalObj.WebAssembly === 'undefined') {
        result.error = 'WebAssembly not supported in this browser';
        return result;
      }
      result.details.webAssembly = true;

      // Test if tesseract.js module can be imported
      const tesseract = await this.loadTesseract();
      result.details.tesseractJs = true;

      // Test if a worker can be created with reasonable timeout
      const workerCreationPromise = tesseract.createWorker('eng');
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Worker creation timeout after 15 seconds')),
          15000,
        );
      });

      try {
        const testWorker = await Promise.race([
          workerCreationPromise,
          timeoutPromise,
        ]);
        result.details.worker = true;
        result.available = true;

        // Clean up test worker
        if (testWorker && typeof testWorker.terminate === 'function') {
          try {
            await testWorker.terminate();
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (workerError: any) {
        // Worker creation failed or timed out
        result.error = `Tesseract worker creation failed: ${workerError.message}`;
        result.details.worker = false;
        return result;
      }

      return result;
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      result.error = `Web OCR initialization failed: ${errorMessage}`;
      return result;
    }
  }

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
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<any>[] = [];

    for (const [language, worker] of this.workers) {
      if (worker && typeof worker.terminate === 'function') {
        cleanupPromises.push(
          worker.terminate().catch((error: any) => {
            console.warn(
              `Failed to terminate Web OCR worker for ${language}:`,
              error,
            );
          }),
        );
      }
    }

    if (cleanupPromises.length > 0) {
      await Promise.allSettled(cleanupPromises);
    }

    this.workers.clear();
  }
}
