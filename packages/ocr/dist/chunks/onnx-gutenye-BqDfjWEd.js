import Ocr from "@gutenye/ocr-node";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { OCRDependencyError } from "../index.js";
class ONNXGutenyeProvider {
  name = "onnx";
  ocrInstance = null;
  initialized = false;
  /**
   * Initialize the @gutenye/ocr-node instance with PaddleOCR models.
   *
   * This method loads the ONNX Runtime and PaddleOCR models required
   * for text detection and recognition. It's called automatically on
   * first use and the instance is cached for subsequent operations.
   *
   * @throws {OCRDependencyError} If initialization fails due to missing dependencies
   * @private
   */
  async initialize() {
    if (this.initialized) return;
    try {
      console.log("Initializing @gutenye/ocr-node...");
      this.ocrInstance = await Ocr.create();
      this.initialized = true;
      console.log("@gutenye/ocr-node initialized successfully");
    } catch (error) {
      console.error("Failed to initialize @gutenye/ocr-node:", error);
      throw new OCRDependencyError(
        "onnx",
        `Failed to initialize @gutenye/ocr-node: ${error.message}`
      );
    }
  }
  /**
   * Convert raw RGB pixel data to JPEG format for optimal OCR processing.
   *
   * Converts RGB pixel data to RGBA format and encodes as high-quality JPEG.
   * This conversion optimizes the data for PaddleOCR models while maintaining
   * excellent text recognition accuracy.
   *
   * @param rgbData - Raw RGB pixel data (3 bytes per pixel)
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @returns JPEG-encoded image buffer
   * @private
   *
   * @example
   * ```typescript
   * // For RGB data from image processing
   * const jpegBuffer = this.rgbToJpegBuffer(rgbPixels, 1920, 1080);
   * ```
   */
  rgbToJpegBuffer(rgbData, width, height) {
    const rgbaData = Buffer.alloc(width * height * 4);
    for (let i = 0; i < rgbData.length; i += 3) {
      const rgbaIndex = i / 3 * 4;
      rgbaData[rgbaIndex] = rgbData[i];
      rgbaData[rgbaIndex + 1] = rgbData[i + 1];
      rgbaData[rgbaIndex + 2] = rgbData[i + 2];
      rgbaData[rgbaIndex + 3] = 255;
    }
    const jpegData = jpeg.encode(
      {
        data: rgbaData,
        width,
        height
      },
      90
    );
    return Buffer.from(jpegData.data);
  }
  /**
   * Decode standard image formats (PNG, JPEG) to raw RGB pixel data.
   *
   * Automatically detects image format and decodes to raw RGB data
   * suitable for OCR processing. Supports PNG and JPEG formats with
   * automatic color space conversion.
   *
   * @param imageBuffer - Image file data as Buffer
   * @returns Object with RGB data and dimensions, or null if format unsupported
   * @private
   *
   * @example
   * ```typescript
   * const decoded = this.decodeImageToRGB(pngBuffer);
   * if (decoded) {
   *   console.log(`Decoded ${decoded.width}x${decoded.height} image`);
   * }
   * ```
   */
  decodeImageToRGB(imageBuffer) {
    try {
      if (imageBuffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        console.log("Detected PNG format, decoding...");
        const png = PNG.sync.read(imageBuffer);
        const rgbData = Buffer.alloc(png.width * png.height * 3);
        for (let i = 0; i < png.data.length; i += 4) {
          const rgbIndex = i / 4 * 3;
          rgbData[rgbIndex] = png.data[i];
          rgbData[rgbIndex + 1] = png.data[i + 1];
          rgbData[rgbIndex + 2] = png.data[i + 2];
        }
        return {
          rgbData,
          width: png.width,
          height: png.height
        };
      }
      if (imageBuffer.subarray(0, 2).equals(Buffer.from([255, 216]))) {
        console.log("Detected JPEG format, decoding...");
        const jpegData = jpeg.decode(imageBuffer);
        let rgbData;
        if (jpegData.data.length === jpegData.width * jpegData.height * 4) {
          rgbData = Buffer.alloc(jpegData.width * jpegData.height * 3);
          for (let i = 0; i < jpegData.data.length; i += 4) {
            const rgbIndex = i / 4 * 3;
            rgbData[rgbIndex] = jpegData.data[i];
            rgbData[rgbIndex + 1] = jpegData.data[i + 1];
            rgbData[rgbIndex + 2] = jpegData.data[i + 2];
          }
        } else {
          rgbData = Buffer.from(jpegData.data);
        }
        return {
          rgbData,
          width: jpegData.width,
          height: jpegData.height
        };
      }
      console.warn("Unknown image format - not PNG or JPEG");
      return null;
    } catch (error) {
      console.error("Failed to decode image:", error.message);
      return null;
    }
  }
  /**
   * Perform OCR processing using ONNX Runtime with PaddleOCR models.
   *
   * Processes images using state-of-the-art PaddleOCR models for high-accuracy
   * text extraction. Handles both standard image formats and raw RGB data
   * with automatic format conversion and optimization.
   *
   * @param images - Array of images to process
   * @param options - Optional processing configuration
   * @returns Promise resolving to OCR results with high-confidence text extraction
   *
   * @throws {OCRDependencyError} If ONNX dependencies are not available
   * @throws {OCRProcessingError} If OCR processing fails
   *
   * @example High-accuracy text extraction
   * ```typescript
   * const result = await provider.performOCR([
   *   { data: documentImage, format: 'png' }
   * ], {
   *   language: 'eng',
   *   confidenceThreshold: 90
   * });
   *
   * // Access detailed detections with bounding boxes
   * result.detections?.forEach(detection => {
   *   console.log(`"${detection.text}" (${detection.confidence}%) at (${detection.boundingBox?.x}, ${detection.boundingBox?.y})`);
   * });
   * ```
   *
   * @example Processing document scans
   * ```typescript
   * const result = await provider.performOCR(images, {
   *   language: 'eng+chi_sim',
   *   confidenceThreshold: 85,
   *   outputFormat: 'json'
   * });
   * ```
   */
  async performOCR(images, options) {
    if (!images || images.length === 0) {
      return {
        text: "",
        confidence: 0,
        detections: [],
        metadata: {
          processingTime: 0,
          provider: this.name
        }
      };
    }
    await this.initialize();
    const startTime = Date.now();
    const allDetections = [];
    let combinedText = "";
    for (const image of images) {
      try {
        let rgbData;
        let width;
        let height;
        if (image.data instanceof Buffer && image.width && image.height) {
          console.log(`Processing RGB data ${image.width}x${image.height}`);
          rgbData = image.data;
          width = image.width;
          height = image.height;
        } else if (image.data instanceof Buffer) {
          console.log("Attempting to decode image file...");
          const decoded = this.decodeImageToRGB(image.data);
          if (!decoded) {
            const formatInfo = image.data.length > 8 ? `First 8 bytes: ${Array.from(image.data.subarray(0, 8)).map((b) => `0x${b.toString(16).padStart(2, "0")}`).join(" ")}` : `Buffer too small (${image.data.length} bytes)`;
            console.warn(
              `Failed to decode image - unsupported format. ${formatInfo}`
            );
            console.warn(
              "Supported formats: PNG (starts with 89 50 4E 47), JPEG (starts with FF D8)"
            );
            continue;
          }
          rgbData = decoded.rgbData;
          width = decoded.width;
          height = decoded.height;
          console.log(`Successfully decoded image: ${width}x${height}`);
        } else {
          const dataType = typeof image.data;
          const isArray = Array.isArray(image.data);
          console.warn(
            `Unsupported image data type: ${dataType}${isArray ? " (array)" : ""} - expected Buffer with image file data or RGB data with width/height`
          );
          continue;
        }
        console.log(`Converting RGB data ${width}x${height} to JPEG`);
        const jpegBuffer = this.rgbToJpegBuffer(rgbData, width, height);
        console.log("Processing with @gutenye/ocr-node...");
        const detections = await this.ocrInstance.detect(jpegBuffer, {
          language: options?.language || "eng"
        });
        console.log("@gutenye/ocr-node result:", detections);
        if (detections && Array.isArray(detections)) {
          for (const detection of detections) {
            if (detection.text) {
              combinedText += `${detection.text} `;
              const confidence = (detection.score || detection.mean || 0) * 100;
              const boundingBox = detection.frame ? {
                x: detection.frame.left,
                y: detection.frame.top,
                width: detection.frame.width,
                height: detection.frame.height
              } : detection.box ? {
                x: detection.box[0][0],
                y: detection.box[0][1],
                width: detection.box[1][0] - detection.box[0][0],
                height: detection.box[2][1] - detection.box[0][1]
              } : void 0;
              allDetections.push({
                text: detection.text,
                confidence,
                boundingBox
              });
            }
          }
        }
      } catch (imageError) {
        console.warn(
          "@gutenye/ocr-node failed for image:",
          imageError.message || imageError
        );
      }
    }
    const processingTime = Date.now() - startTime;
    const validDetections = allDetections.filter((d) => d.confidence > 0);
    const averageConfidence = validDetections.length > 0 ? validDetections.reduce((sum, d) => sum + d.confidence, 0) / validDetections.length : 0;
    const filteredDetections = options?.confidenceThreshold ? allDetections.filter(
      (d) => d.confidence >= options.confidenceThreshold
    ) : allDetections;
    return {
      text: combinedText.trim(),
      confidence: averageConfidence,
      detections: filteredDetections,
      metadata: {
        processingTime,
        provider: this.name,
        detectionCount: allDetections.length,
        language: options?.language
      }
    };
  }
  /**
   * Check if @gutenye/ocr-node dependencies are available and functional.
   *
   * Performs a lightweight check to verify that the ONNX Runtime and
   * PaddleOCR components can be loaded. Does not initialize the full
   * OCR pipeline to keep this check fast.
   *
   * @returns Promise resolving to dependency availability status
   *
   * @example
   * ```typescript
   * const deps = await provider.checkDependencies();
   * if (deps.available) {
   *   console.log('ONNX OCR is ready for high-accuracy processing');
   * } else {
   *   console.log('ONNX not available:', deps.error);
   * }
   * ```
   */
  async checkDependencies() {
    try {
      if (Ocr && typeof Ocr.create === "function") {
        return {
          available: true,
          details: {
            "gutenye-ocr-node": true
          }
        };
      }
      return {
        available: false,
        error: "@gutenye/ocr-node module missing required functions",
        details: {
          "gutenye-ocr-node": false
        }
      };
    } catch (error) {
      return {
        available: false,
        error: `@gutenye/ocr-node not available: ${error.message}`,
        details: {
          "gutenye-ocr-node": false
        }
      };
    }
  }
  /**
   * Check and return the capabilities of the ONNX OCR provider.
   *
   * Returns information about supported languages, image size limits,
   * and special features of the PaddleOCR models.
   *
   * @returns Promise resolving to provider capabilities
   *
   * @example
   * ```typescript
   * const caps = await provider.checkCapabilities();
   * console.log('Max image size:', caps.maxImageSize);
   * console.log('Has bounding boxes:', caps.hasBoundingBoxes);
   * console.log('Supported languages:', caps.supportedLanguages);
   * ```
   */
  async checkCapabilities() {
    return {
      canPerformOCR: true,
      supportedLanguages: [
        "eng",
        "chi_sim",
        "chi_tra",
        "fra",
        "deu",
        "jpn",
        "kor"
      ],
      // Common languages
      maxImageSize: 4096 * 4096,
      // Reasonable limit
      hasBoundingBoxes: true
    };
  }
  /**
   * Get array of language codes supported by the PaddleOCR models.
   *
   * Returns languages that have been trained and optimized for the
   * PaddleOCR models used by this provider. These languages provide
   * the highest accuracy.
   *
   * @returns Array of supported language codes
   *
   * @example
   * ```typescript
   * const languages = provider.getSupportedLanguages();
   * console.log('ONNX supports:', languages);
   * // ['eng', 'chi_sim', 'chi_tra', 'fra', 'deu', 'jpn', 'kor']
   * ```
   */
  getSupportedLanguages() {
    return ["eng", "chi_sim", "chi_tra", "fra", "deu", "jpn", "kor"];
  }
  /**
   * Clean up ONNX Runtime instance and release resources.
   *
   * Properly disposes of the OCR instance and any loaded models
   * to free memory and computational resources.
   *
   * @example
   * ```typescript
   * const provider = new ONNXGutenyeProvider();
   * try {
   *   await provider.performOCR(images);
   * } finally {
   *   await provider.cleanup();
   * }
   * ```
   */
  async cleanup() {
    if (this.ocrInstance) {
      try {
        if (this.ocrInstance.cleanup) {
          await this.ocrInstance.cleanup();
        }
      } catch (error) {
        console.warn("OCR cleanup failed:", error);
      }
      this.ocrInstance = null;
    }
    this.initialized = false;
  }
}
export {
  ONNXGutenyeProvider
};
//# sourceMappingURL=onnx-gutenye-BqDfjWEd.js.map
