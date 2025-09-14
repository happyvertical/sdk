/**
 * @have/ocr - Tesseract.js provider for Node.js and browser environments
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
 * Tesseract.js OCR provider for Node.js and browser environments
 * 
 * This provider handles:
 * - Pure JavaScript OCR using Tesseract.js
 * - Zero system dependencies (works anywhere Node.js or browsers work)
 * - Good accuracy for machine-printed text
 * - Reliable fallback when EasyOCR or other providers are not available
 * - Multi-language support (100+ languages)
 */
export class TesseractProvider implements OCRProvider {
  readonly name = 'tesseract';
  private tesseract: any = null;
  private workers: Map<string, any> = new Map();

  constructor() {
    // Constructor is synchronous - dependencies loaded lazily
  }

  /**
   * Lazy load Tesseract.js dependencies
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
   * Get or create a Tesseract worker for a specific language
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
   * Perform OCR on image data using Tesseract.js
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
   * Map common language codes to Tesseract language codes
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
   * Get supported languages for Tesseract.js
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
   * Check the capabilities of the Tesseract provider
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
   * Check if Tesseract.js dependencies are available
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
   * Clean up all workers and resources
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