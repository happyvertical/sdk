import { DependencyCheckResult, OCRCapabilities, OCRImage, OCROptions, OCRProvider, OCRResult } from '../shared/types';
/**
 * ONNX OCR provider implementation using PaddleOCR models for high-accuracy text extraction.
 *
 * This provider leverages ONNX Runtime with PaddleOCR PP-OCRv4 models through
 * the @gutenye/ocr-node package to deliver state-of-the-art OCR performance.
 * It's optimized for production use with excellent accuracy on both printed
 * and handwritten text.
 *
 * ## Key Features
 *
 * - **High Accuracy**: Uses PaddleOCR PP-OCRv4 models for superior text recognition
 * - **Format Flexibility**: Handles standard image formats (PNG, JPEG) and raw RGB data
 * - **Bounding Boxes**: Provides precise text positioning with confidence scores
 * - **Multi-Language**: Supports major languages including English, Chinese, Japanese, Korean
 * - **Production Ready**: Battle-tested @gutenye/ocr-node for reliable processing
 * - **Automatic Conversion**: Intelligent image format conversion for optimal processing
 *
 * ## Performance Characteristics
 *
 * - **Accuracy**: Excellent for both printed and handwritten text
 * - **Speed**: Fast processing with ONNX Runtime optimization
 * - **Memory**: Efficient memory usage with automatic cleanup
 * - **Languages**: English, Chinese (Simplified/Traditional), Japanese, Korean, French, German
 *
 * ## Supported Input Formats
 *
 * - Standard image files: PNG, JPEG with automatic decoding
 * - Raw RGB data: Direct pixel data from image processing pipelines
 * - Buffer data: Image file data as Node.js Buffer objects
 *
 * @example Basic usage with image file
 * ```typescript
 * const provider = new ONNXGutenyeProvider();
 * const result = await provider.performOCR([
 *   { data: fs.readFileSync('document.png'), format: 'png' }
 * ], {
 *   language: 'eng',
 *   confidenceThreshold: 80
 * });
 * ```
 *
 * @example Processing raw RGB data
 * ```typescript
 * const result = await provider.performOCR([
 *   {
 *     data: rgbBuffer,
 *     width: 1920,
 *     height: 1080,
 *     channels: 3
 *   }
 * ]);
 * ```
 */
export declare class ONNXGutenyeProvider implements OCRProvider {
    readonly name = "onnx";
    private ocrInstance;
    private initialized;
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
    private initialize;
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
    private rgbToJpegBuffer;
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
    private decodeImageToRGB;
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
    performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
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
    checkDependencies(): Promise<DependencyCheckResult>;
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
    checkCapabilities(): Promise<OCRCapabilities>;
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
    getSupportedLanguages(): string[];
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
    cleanup(): Promise<void>;
}
//# sourceMappingURL=onnx-gutenye.d.ts.map