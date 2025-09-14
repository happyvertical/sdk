/**
 * @have/ocr - ONNX OCR provider using @gutenye/ocr-node with PNG conversion
 */

import Ocr from '@gutenye/ocr-node';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
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
 * ONNX OCR provider using @gutenye/ocr-node with PNG conversion
 * 
 * This provider handles:
 * - RGB data processing from unpdf with PNG conversion
 * - Standard image formats (JPEG, PNG) 
 * - Uses battle-tested @gutenye/ocr-node for reliable OCR
 * - Automatic PNG conversion for optimal processing
 */
export class ONNXGutenyeProvider implements OCRProvider {
  readonly name = 'onnx';
  private ocrInstance: any = null;
  private initialized = false;

  constructor() {
    // Constructor is synchronous - OCR instance created lazily
  }

  /**
   * Initialize @gutenye/ocr-node instance
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('Initializing @gutenye/ocr-node...');
      this.ocrInstance = await Ocr.create();
      this.initialized = true;
      console.log('@gutenye/ocr-node initialized successfully');
    } catch (error) {
      console.error('Failed to initialize @gutenye/ocr-node:', error);
      throw new OCRDependencyError('onnx', `Failed to initialize @gutenye/ocr-node: ${(error as Error).message}`);
    }
  }

  /**
   * Convert RGB data to JPEG buffer for faster processing
   */
  private rgbToJpegBuffer(rgbData: Buffer, width: number, height: number): Buffer {
    // Convert RGB to RGBA format that jpeg-js expects
    const rgbaData = Buffer.alloc(width * height * 4);
    
    for (let i = 0; i < rgbData.length; i += 3) {
      const rgbaIndex = (i / 3) * 4;
      rgbaData[rgbaIndex] = rgbData[i];     // R
      rgbaData[rgbaIndex + 1] = rgbData[i + 1]; // G
      rgbaData[rgbaIndex + 2] = rgbData[i + 2]; // B
      rgbaData[rgbaIndex + 3] = 255;        // A (fully opaque)
    }
    
    // Encode as JPEG with high quality
    const jpegData = jpeg.encode({
      data: rgbaData,
      width: width,
      height: height
    }, 90); // 90% quality for good OCR results
    
    return Buffer.from(jpegData.data);
  }


  /**
   * Perform OCR using @gutenye/ocr-node with simplified processing
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

    await this.initialize();

    const startTime = Date.now();
    const allDetections: any[] = [];
    let combinedText = '';

    for (const image of images) {
      try {
        // Convert RGB data to JPEG (faster than PNG)
        if (image.data instanceof Buffer && image.width && image.height) {
          console.log(`Converting RGB data ${image.width}x${image.height} to JPEG`);
          const jpegBuffer = this.rgbToJpegBuffer(image.data, image.width, image.height);

          // Process with @gutenye/ocr-node - let it handle everything
          console.log('Processing with @gutenye/ocr-node...');
          const detections = await this.ocrInstance.detect(jpegBuffer, {
            language: options?.language || 'eng',
          });

          console.log('@gutenye/ocr-node result:', detections);

          // Simply pass through the detections with minimal processing
          if (detections && Array.isArray(detections)) {
            for (const detection of detections) {
              if (detection.text) {
                combinedText += detection.text + ' ';
                
                // Convert to our format, handling both API formats
                const confidence = (detection.score || detection.mean || 0) * 100;
                const boundingBox = detection.frame ? {
                  x: detection.frame.left,
                  y: detection.frame.top,
                  width: detection.frame.width,
                  height: detection.frame.height,
                } : detection.box ? {
                  x: detection.box[0][0],
                  y: detection.box[0][1], 
                  width: detection.box[1][0] - detection.box[0][0],
                  height: detection.box[2][1] - detection.box[0][1],
                } : undefined;

                allDetections.push({
                  text: detection.text,
                  confidence: confidence,
                  boundingBox: boundingBox,
                });
              }
            }
          }
        } else {
          console.warn('Unsupported image format - expected RGB data with width/height');
        }

      } catch (imageError: any) {
        console.warn(`@gutenye/ocr-node failed for image:`, imageError.message || imageError);
      }
    }

    const processingTime = Date.now() - startTime;
    
    // Calculate average confidence
    const validDetections = allDetections.filter(d => d.confidence > 0);
    const averageConfidence = validDetections.length > 0 
      ? validDetections.reduce((sum, d) => sum + d.confidence, 0) / validDetections.length 
      : 0;

    // Apply confidence threshold filtering
    const filteredDetections = options?.confidenceThreshold 
      ? allDetections.filter(d => d.confidence >= options.confidenceThreshold!)
      : allDetections;

    return {
      text: combinedText.trim(),
      confidence: averageConfidence,
      detections: filteredDetections,
      metadata: {
        processingTime,
        provider: this.name,
        detectionCount: allDetections.length,
        language: options?.language,
      },
    };
  }

  /**
   * Check dependencies for @gutenye/ocr-node
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    try {
      // Only test if @gutenye/ocr-node module can be imported (lightweight check)
      // Verify the module exists and has required functions without creating OCR instance
      if (Ocr && typeof Ocr.create === 'function') {
        return {
          available: true,
          details: {
            'gutenye-ocr-node': true,
          },
        };
      } else {
        return {
          available: false,
          error: '@gutenye/ocr-node module missing required functions',
          details: {
            'gutenye-ocr-node': false,
          },
        };
      }
    } catch (error) {
      return {
        available: false,
        error: `@gutenye/ocr-node not available: ${(error as Error).message}`,
        details: {
          'gutenye-ocr-node': false,
        },
      };
    }
  }

  /**
   * Check OCR capabilities
   */
  async checkCapabilities(): Promise<OCRCapabilities> {
    return {
      canPerformOCR: true,
      supportedLanguages: ['eng', 'chi_sim', 'chi_tra', 'fra', 'deu', 'jpn', 'kor'], // Common languages
      maxImageSize: 4096 * 4096, // Reasonable limit
      hasBoundingBoxes: true,
    };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return ['eng', 'chi_sim', 'chi_tra', 'fra', 'deu', 'jpn', 'kor'];
  }

  /**
   * Clean up OCR instance
   */
  async cleanup(): Promise<void> {
    if (this.ocrInstance) {
      // @gutenye/ocr-node cleanup if available
      try {
        if (this.ocrInstance.cleanup) {
          await this.ocrInstance.cleanup();
        }
      } catch (error) {
        console.warn('OCR cleanup failed:', error);
      }
      this.ocrInstance = null;
    }
    this.initialized = false;
  }
}