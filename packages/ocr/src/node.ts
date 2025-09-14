/**
 * @have/ocr - Node.js specific exports
 */

// Export main API
export * from './index.js';

// Export Node.js specific providers for direct access
export { TesseractProvider } from './node/tesseract.js';
export { ONNXGutenyeProvider } from './node/onnx-gutenye.js';