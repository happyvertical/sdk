/**
 * @have/ocr - Shared type definitions for OCR processing
 *
 * This module provides comprehensive type definitions for all OCR operations,
 * including input formats, configuration options, results, and provider interfaces.
 */

/**
 * Configuration options for OCR processing operations.
 *
 * These options control how OCR processing is performed across all providers,
 * allowing fine-tuning of accuracy, performance, and output format.
 *
 * @example Basic usage
 * ```typescript
 * const options: OCROptions = {
 *   language: 'eng',
 *   confidenceThreshold: 70
 * };
 * ```
 */
export interface OCROptions {
  /**
   * Language code for OCR recognition. Supports single languages or
   * combinations separated by '+' for multi-language processing.
   * @default 'eng'
   * @example 'eng' - English only
   * @example 'eng+chi_sim' - English and Chinese
   */
  language?: string;
  /**
   * Whether to enhance image resolution before OCR processing.
   * This can improve accuracy for low-resolution images but increases processing time.
   * @default false
   */
  improveResolution?: boolean;
  /**
   * Desired output format for OCR results.
   * - 'text' - Plain text only (fastest)
   * - 'json' - Structured data with bounding boxes and confidence
   * - 'hocr' - HTML-based OCR format with positioning data
   * @default 'text'
   */
  outputFormat?: 'text' | 'json' | 'hocr';
  /**
   * Minimum confidence threshold for including text in results (0-100).
   * Text detections with confidence below this threshold will be filtered out.
   * @default undefined (no filtering)
   */
  confidenceThreshold?: number;
  /**
   * Maximum time to wait for OCR processing to complete, in milliseconds.
   * @default 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Represents an image input for OCR processing operations.
 *
 * Supports multiple input formats to accommodate different use cases:
 * - Raw image files (PNG, JPEG, etc.) as Buffer
 * - RGB pixel data with dimensions
 * - Base64 encoded image strings
 * - File paths (as strings)
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
 * Result object returned from OCR processing operations.
 *
 * Contains the extracted text, confidence metrics, and optional
 * detailed detection information including bounding boxes.
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
 * Core interface that all OCR providers must implement.
 *
 * This interface standardizes OCR operations across different engines
 * providing a consistent API for text extraction.
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
  constructor(
    message: string,
    public readonly provider?: string,
    public readonly context?: any,
  ) {
    super(message);
    this.name = 'OCRError';
  }
}

export class OCRDependencyError extends OCRError {
  constructor(provider: string, message: string, context?: any) {
    super(
      `OCR dependency error for ${provider}: ${message}`,
      provider,
      context,
    );
    this.name = 'OCRDependencyError';
  }
}

export class OCRUnsupportedError extends OCRError {
  constructor(provider: string, operation: string, context?: any) {
    super(
      `OCR operation '${operation}' not supported by ${provider}`,
      provider,
      context,
    );
    this.name = 'OCRUnsupportedError';
  }
}

export class OCRProcessingError extends OCRError {
  constructor(provider: string, message: string, context?: any) {
    super(
      `OCR processing error for ${provider}: ${message}`,
      provider,
      context,
    );
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
