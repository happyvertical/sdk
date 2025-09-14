/**
 * @have/ocr - Shared type definitions for OCR processing
 */

/**
 * Options for OCR processing
 */
export interface OCROptions {
  /** Language for OCR recognition (default: 'eng') */
  language?: string;
  /** Whether to enhance image resolution before OCR */
  improveResolution?: boolean;
  /** Output format for OCR results */
  outputFormat?: 'text' | 'json' | 'hocr';
  /** Confidence threshold for OCR results (0-100) */
  confidenceThreshold?: number;
  /** Timeout in milliseconds for OCR processing */
  timeout?: number;
}

/**
 * Image data input for OCR processing
 */
export interface OCRImage {
  /** Image data as Buffer, Uint8Array, or string (base64/path) */
  data: Buffer | Uint8Array | string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Number of color channels */
  channels?: number;
  /** Image format/type */
  format?: string;
  /** Optional metadata for tracking */
  metadata?: Record<string, any>;
}

/**
 * OCR result with confidence information
 */
export interface OCRResult {
  /** Extracted text */
  text: string;
  /** Overall confidence score (0-100) */
  confidence: number;
  /** Detailed detection results */
  detections?: Array<{
    text: string;
    confidence: number;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  /** Processing metadata */
  metadata?: {
    processingTime?: number;
    provider?: string;
    language?: string;
    environment?: string;
    error?: string;
    fallbackFrom?: string;
    [key: string]: any;
  };
}

/**
 * Dependency check result for OCR providers
 */
export interface DependencyCheckResult {
  /** Whether all dependencies are available */
  available: boolean;
  /** Error message if dependencies are missing */
  error?: string;
  /** Detailed information about specific dependencies */
  details: Record<string, any>;
  /** Version information if available */
  version?: string;
}

/**
 * OCR provider capabilities information
 */
export interface OCRCapabilities {
  /** Whether the provider can perform OCR */
  canPerformOCR: boolean;
  /** List of supported languages */
  supportedLanguages: string[];
  /** Maximum supported image size in pixels */
  maxImageSize?: number;
  /** Supported image formats */
  supportedFormats?: string[];
  /** Whether the provider supports confidence scores */
  hasConfidenceScores?: boolean;
  /** Whether the provider supports bounding boxes */
  hasBoundingBoxes?: boolean;
  /** Provider-specific capabilities */
  providerSpecific?: Record<string, any>;
}

/**
 * Core OCR provider interface
 */
export interface OCRProvider {
  /** Provider name identifier */
  readonly name: string;
  
  /**
   * Perform OCR on image data
   */
  performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
  
  /**
   * Check if provider dependencies are available
   */
  checkDependencies(): Promise<DependencyCheckResult>;
  
  /**
   * Get provider capabilities
   */
  checkCapabilities(): Promise<OCRCapabilities>;
  
  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[];
  
  /**
   * Clean up provider resources (optional)
   */
  cleanup?(): Promise<void>;
}

/**
 * OCR factory configuration options
 */
export interface OCRFactoryOptions {
  /** Primary provider to use ('auto', 'tesseract', 'onnx') */
  provider?: string;
  /** Fallback providers to try if primary fails */
  fallbackProviders?: string[];
  /** Default options for OCR operations */
  defaultOptions?: OCROptions;
  /** Provider-specific configuration */
  providerConfig?: Record<string, any>;
}

/**
 * Error classes for OCR operations
 */
export class OCRError extends Error {
  constructor(message: string, public readonly provider?: string, public readonly context?: any) {
    super(message);
    this.name = 'OCRError';
  }
}

export class OCRDependencyError extends OCRError {
  constructor(provider: string, message: string, context?: any) {
    super(`OCR dependency error for ${provider}: ${message}`, provider, context);
    this.name = 'OCRDependencyError';
  }
}

export class OCRUnsupportedError extends OCRError {
  constructor(provider: string, operation: string, context?: any) {
    super(`OCR operation '${operation}' not supported by ${provider}`, provider, context);
    this.name = 'OCRUnsupportedError';
  }
}

export class OCRProcessingError extends OCRError {
  constructor(provider: string, message: string, context?: any) {
    super(`OCR processing error for ${provider}: ${message}`, provider, context);
    this.name = 'OCRProcessingError';
  }
}

/**
 * Provider information for discovery
 */
export interface OCRProviderInfo {
  name: string;
  available: boolean;
  dependencies: DependencyCheckResult;
  capabilities: OCRCapabilities | null;
}

/**
 * Environment-specific provider availability
 */
export type OCREnvironment = 'node' | 'browser' | 'unknown';

/**
 * Provider compatibility matrix
 */
export interface ProviderCompatibility {
  environment: OCREnvironment;
  provider: string;
  supported: boolean;
  reason?: string;
}