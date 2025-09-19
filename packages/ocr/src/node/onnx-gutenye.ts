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
   * Decode standard image formats (PNG, JPEG) to RGB data
   */
  private decodeImageToRGB(imageBuffer: Buffer): { rgbData: Buffer; width: number; height: number } | null {
    try {
      // Try PNG first
      if (imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
        console.log('Detected PNG format, decoding...');
        const png = PNG.sync.read(imageBuffer);

        // Convert RGBA to RGB
        const rgbData = Buffer.alloc(png.width * png.height * 3);
        for (let i = 0; i < png.data.length; i += 4) {
          const rgbIndex = (i / 4) * 3;
          rgbData[rgbIndex] = png.data[i];     // R
          rgbData[rgbIndex + 1] = png.data[i + 1]; // G
          rgbData[rgbIndex + 2] = png.data[i + 2]; // B
          // Skip alpha channel
        }

        return {
          rgbData,
          width: png.width,
          height: png.height
        };
      }

      // Try JPEG
      if (imageBuffer.subarray(0, 2).equals(Buffer.from([0xFF, 0xD8]))) {
        console.log('Detected JPEG format, decoding...');
        const jpegData = jpeg.decode(imageBuffer);

        // Convert RGBA to RGB if needed
        let rgbData: Buffer;
        if (jpegData.data.length === jpegData.width * jpegData.height * 4) {
          // RGBA format, convert to RGB
          rgbData = Buffer.alloc(jpegData.width * jpegData.height * 3);
          for (let i = 0; i < jpegData.data.length; i += 4) {
            const rgbIndex = (i / 4) * 3;
            rgbData[rgbIndex] = jpegData.data[i];     // R
            rgbData[rgbIndex + 1] = jpegData.data[i + 1]; // G
            rgbData[rgbIndex + 2] = jpegData.data[i + 2]; // B
          }
        } else {
          // Already RGB format
          rgbData = Buffer.from(jpegData.data);
        }

        return {
          rgbData,
          width: jpegData.width,
          height: jpegData.height
        };
      }

      console.warn('Unknown image format - not PNG or JPEG');
      return null;
    } catch (error) {
      console.error('Failed to decode image:', (error as Error).message);
      return null;
    }
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
        let rgbData: Buffer;
        let width: number;
        let height: number;

        // Handle different image input formats
        if (image.data instanceof Buffer && image.width && image.height) {
          // Already RGB data with dimensions
          console.log(`Processing RGB data ${image.width}x${image.height}`);
          rgbData = image.data;
          width = image.width;
          height = image.height;
        } else if (image.data instanceof Buffer) {
          // Standard image file (PNG, JPEG) - decode it
          console.log('Attempting to decode image file...');
          const decoded = this.decodeImageToRGB(image.data);
          if (!decoded) {
            const formatInfo = image.data.length > 8
              ? `First 8 bytes: ${Array.from(image.data.subarray(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`
              : `Buffer too small (${image.data.length} bytes)`;
            console.warn(`Failed to decode image - unsupported format. ${formatInfo}`);
            console.warn('Supported formats: PNG (starts with 89 50 4E 47), JPEG (starts with FF D8)');
            continue;
          }
          rgbData = decoded.rgbData;
          width = decoded.width;
          height = decoded.height;
          console.log(`Successfully decoded image: ${width}x${height}`);
        } else {
          const dataType = typeof image.data;
          const isArray = Array.isArray(image.data);
          console.warn(`Unsupported image data type: ${dataType}${isArray ? ' (array)' : ''} - expected Buffer with image file data or RGB data with width/height`);
          continue;
        }

        // Convert RGB data to JPEG for @gutenye/ocr-node
        console.log(`Converting RGB data ${width}x${height} to JPEG`);
        const jpegBuffer = this.rgbToJpegBuffer(rgbData, width, height);

        // Process with @gutenye/ocr-node
        console.log('Processing with @gutenye/ocr-node...');
        const detections = await this.ocrInstance.detect(jpegBuffer, {
          language: options?.language || 'eng',
        });

        console.log('@gutenye/ocr-node result:', detections);

        // Process the detections
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