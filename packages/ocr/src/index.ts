/**
 * @have/ocr - Standardized OCR interface with multi-provider support
 * 
 * This package provides a unified interface for OCR operations across different
 * providers including EasyOCR, Tesseract.js, and ONNX Runtime.
 */

// Export main factory function and utilities
export { 
  OCRFactory,
  getOCR, 
  resetOCRFactory,
  getAvailableProviders, 
  isProviderAvailable,
  getProviderInfo 
} from './shared/factory.js';

// Export all types
export * from './shared/types.js';

// Re-export provider classes for direct instantiation if needed
// Note: Only export providers available in current environment
// The factory will handle environment-specific provider selection

// Default export for convenience
export { getOCR as default } from './shared/factory.js';