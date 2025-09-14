/**
 * @have/ocr - Browser specific exports
 */

// Export main API
export * from './index.js';

// Export browser specific providers for direct access
export { WebOCRProvider } from './browser/web-ocr.js';
export { TesseractProvider } from './node/tesseract.js'; // Tesseract.js works in browsers too