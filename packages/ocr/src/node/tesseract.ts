/**
 * @have/ocr - Tesseract.js provider for cross-platform OCR processing
 *
 * This module implements the OCRProvider interface using Tesseract.js,
 * providing reliable OCR capabilities that work in both Node.js and
 * browser environments with zero system dependencies.
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
export class TesseractProvider implements OCRProvider {
  readonly name = 'tesseract';
  private tesseract: any = null;
  private workers: Map<string, any> = new Map();

  /**
   * Create a new Tesseract.js provider instance.
   *
   * The constructor is lightweight and synchronous. Tesseract.js modules
   * and workers are loaded lazily when first needed.
   */
  constructor() {
    // Constructor is synchronous - dependencies loaded lazily
  }

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
  private async loadTesseract() {
    if (this.tesseract) {
      return this.tesseract;
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
  private async getWorker(language: string = 'eng') {
    if (this.workers.has(language)) {
      return this.workers.get(language);
    }

    try {
      const tesseract = await this.loadTesseract();
      const worker = await tesseract.createWorker(language);
      this.workers.set(language, worker);
      return worker;
    } catch (error) {
      throw new OCRDependencyError(this.name, `Failed to create worker for ${language}: ${(error as Error).message}`);
    }
  }

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
  async performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult> {
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
      throw new OCRDependencyError(this.name, dependencyCheck.error || 'Dependencies not available');
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
          // Handle different image data formats
          let imageData = image.data;
          
          // Skip if no valid image data
          if (!imageData) {
            continue;
          }
          
          // Convert image data to Buffer/Uint8Array if needed
          let buffer: Buffer | Uint8Array;
          if (imageData instanceof Buffer || imageData instanceof Uint8Array) {
            buffer = imageData;
          } else if (typeof imageData === 'string') {
            // Handle base64 encoded strings or file paths
            try {
              buffer = Buffer.from(imageData, 'base64');
            } catch {
              // If not base64, try as UTF-8 string (probably a file path)
              buffer = Buffer.from(imageData, 'utf-8');
            }
          } else {
            continue;
          }
          
          // Skip empty buffers or buffers that are too small to be valid images
          if (buffer.length < 100) {  // Minimum size for a valid image header
            continue;
          }
          
          // Check for valid image signatures (PNG, JPEG, etc.)
          const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
          const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
          const isBMP = buffer[0] === 0x42 && buffer[1] === 0x4D;
          const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
          
          if (!isPNG && !isJPEG && !isBMP && !isGIF) {
            // Not a recognized image format, skip
            continue;
          }
          
          // Perform OCR using Tesseract.js
          const result = await worker.recognize(buffer);
          
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
                      boundingBox: word.bbox ? {
                        x: word.bbox.x0,
                        y: word.bbox.y0,
                        width: word.bbox.x1 - word.bbox.x0,
                        height: word.bbox.y1 - word.bbox.y0,
                      } : undefined,
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
          console.warn('Tesseract.js failed to process image:', imageError.message || imageError);
          continue;
        }
      }
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error('Tesseract.js processing failed:', error.message || error);
      
      throw new OCRProcessingError(
        this.name,
        `Processing failed: ${error.message || error}`,
        { ...error, processingTime }
      );
    }
    
    const processingTime = Date.now() - startTime;
    const averageConfidence = detectionCount > 0 ? totalConfidence / detectionCount : 0;
    
    return {
      text: ocrText.trim(),
      confidence: averageConfidence,
      detections: allDetections,
      metadata: {
        processingTime,
        provider: this.name,
        language: options?.language,
      },
    };
  }

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
  private mapLanguageCode(code: string): string {
    const langMap: { [key: string]: string } = {
      'en': 'eng',
      'zh': 'chi_sim',
      'zh-cn': 'chi_sim',
      'zh-tw': 'chi_tra',
      'ja': 'jpn',
      'ko': 'kor',
      'ar': 'ara',
      'hi': 'hin',
      'ru': 'rus',
      'es': 'spa',
      'fr': 'fra',
      'de': 'deu',
      'it': 'ita',
      'pt': 'por',
      'pl': 'pol',
      'nl': 'nld',
      'tr': 'tur',
    };

    return langMap[code.toLowerCase()] || code;
  }

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
  getSupportedLanguages(): string[] {
    // Tesseract supports 100+ languages - listing the most common ones
    return [
      'eng', 'chi_sim', 'chi_tra', 'jpn', 'kor', 'ara', 'hin', 'rus',
      'spa', 'fra', 'deu', 'ita', 'por', 'pol', 'nld', 'tur', 'vie',
      'tha', 'mya', 'ben', 'tam', 'tel', 'kan', 'mal', 'guj', 'ori',
      'pan', 'asm', 'nep', 'sin', 'bod', 'khm', 'lao', 'heb', 'yid',
      'urd', 'fas', 'pus', 'snd', 'aze', 'bel', 'bul', 'cat', 'ces',
      'dan', 'ell', 'est', 'eus', 'fin', 'gle', 'glg', 'hun', 'isl',
      'lav', 'lit', 'mkd', 'mlt', 'nor', 'ron', 'slk', 'slv', 'sqi',
      'srp', 'swe', 'ukr', 'afr', 'aze_cyrl', 'bos', 'ceb', 'cym',
      'hrv', 'ind', 'jav', 'lat', 'ltz', 'msa', 'mlt', 'swa', 'tgl'
    ];
  }

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
  async checkCapabilities(): Promise<OCRCapabilities> {
    const deps = await this.checkDependencies();
    
    return {
      canPerformOCR: deps.available,
      supportedLanguages: this.getSupportedLanguages(),
      maxImageSize: undefined, // Tesseract.js can handle reasonably large images
      supportedFormats: ['png', 'jpg', 'jpeg', 'bmp', 'tiff', 'pbm', 'pgm', 'ppm'],
      hasConfidenceScores: true,
      hasBoundingBoxes: true,
      providerSpecific: {
        webAssembly: true,
        modelDownloads: true, // Tesseract.js downloads models on first use
        crossPlatform: true,
        browserSupported: true,
      },
    };
  }

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
  async checkDependencies(): Promise<DependencyCheckResult> {
    const result: DependencyCheckResult = {
      available: false,
      details: {
        tesseractJs: false,
      },
    };

    try {
      // Only test if tesseract.js module can be imported (lightweight check)
      const tesseract = await this.loadTesseract();
      
      // Verify essential functions exist without creating workers
      if (tesseract && typeof tesseract.createWorker === 'function') {
        result.details.tesseractJs = true;
        result.available = true;
        return result;
      } else {
        result.error = 'tesseract.js module missing required functions';
        return result;
      }
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      
      // Categorize the error
      if (errorMessage.includes('tesseract.js') || errorMessage.includes('Cannot find module')) {
        result.error = `tesseract.js module not found: ${errorMessage}`;
        result.details.tesseractJs = false;
      } else {
        result.error = `Tesseract dependency check failed: ${errorMessage}`;
      }
      
      return result;
    }
  }

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
  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<any>[] = [];
    
    for (const [language, worker] of this.workers) {
      if (worker && typeof worker.terminate === 'function') {
        cleanupPromises.push(
          worker.terminate().catch((error: any) => {
            console.warn(`Failed to terminate Tesseract worker for ${language}:`, error);
          })
        );
      }
    }
    
    if (cleanupPromises.length > 0) {
      await Promise.allSettled(cleanupPromises);
    }
    
    this.workers.clear();
  }
}