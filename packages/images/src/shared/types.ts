/**
 * Core types and interfaces for the images library
 */

/**
 * Input type for image processing
 * Can be a file path string or a Buffer containing image data
 */
export type ImageInput = string | Buffer;

/**
 * Image dimensions
 */
export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Supported image formats
 */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';

/**
 * Hash algorithm options
 */
export type HashAlgorithm = 'perceptual' | 'md5' | 'sha256';

/**
 * Fit modes for resize operations
 */
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

/**
 * Options for thumbnail generation
 */
export interface ThumbnailOptions {
  /** Maximum width of the thumbnail */
  maxWidth?: number;
  /** Maximum height of the thumbnail */
  maxHeight?: number;
  /** Quality for lossy formats (1-100) */
  quality?: number;
  /** Output format */
  format?: ImageFormat;
  /** How to fit the image within dimensions */
  fit?: FitMode;
}

/**
 * Options for format conversion
 */
export interface ConvertOptions {
  /** Target format */
  format?: ImageFormat;
  /** Quality for lossy formats (1-100) */
  quality?: number;
}

/**
 * Options for resize operations
 */
export interface ResizeOptions {
  /** Target width */
  width?: number;
  /** Target height */
  height?: number;
  /** How to fit the image within dimensions */
  fit?: FitMode;
  /** Quality for lossy formats (1-100) */
  quality?: number;
  /** Output format */
  format?: ImageFormat;
}

/**
 * Image metadata structure
 */
export interface ImageMetadata {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Image format (jpeg, png, webp, etc.) */
  format: string;
  /** Color space (srgb, rgb, etc.) */
  space?: string;
  /** Number of channels (3 for RGB, 4 for RGBA) */
  channels?: number;
  /** Bit depth per channel */
  depth?: string;
  /** Image density (DPI) */
  density?: number;
  /** Whether the image has an alpha channel */
  hasAlpha?: boolean;
  /** EXIF orientation value (1-8) */
  orientation?: number;
  /** EXIF metadata */
  exif?: Record<string, unknown>;
  /** IPTC metadata */
  iptc?: Record<string, unknown>;
  /** XMP metadata */
  xmp?: Record<string, unknown>;
}

/**
 * Core image processor interface
 * All adapters must implement this interface
 */
export interface ImageProcessorInterface {
  /**
   * Get image dimensions
   * @param input - Image path or Buffer
   * @returns Promise resolving to image dimensions
   */
  getDimensions(input: ImageInput): Promise<ImageDimensions>;

  /**
   * Generate a thumbnail
   * @param input - Source image path or Buffer
   * @param output - Output file path
   * @param options - Thumbnail generation options
   */
  thumbnail(
    input: ImageInput,
    output: string,
    options?: ThumbnailOptions,
  ): Promise<void>;

  /**
   * Convert image format
   * @param input - Source image path or Buffer
   * @param output - Output file path
   * @param options - Conversion options
   */
  convert(
    input: ImageInput,
    output: string,
    options?: ConvertOptions,
  ): Promise<void>;

  /**
   * Get image metadata
   * @param input - Image path or Buffer
   * @returns Promise resolving to metadata
   */
  getMetadata(input: ImageInput): Promise<ImageMetadata>;

  /**
   * Compute image hash
   * @param input - Image path or Buffer
   * @param algorithm - Hash algorithm to use
   * @returns Promise resolving to hash string
   */
  hash(input: ImageInput, algorithm?: HashAlgorithm): Promise<string>;

  /**
   * Resize image with full control
   * @param input - Source image path or Buffer
   * @param output - Output file path
   * @param options - Resize options
   */
  resize(
    input: ImageInput,
    output: string,
    options: ResizeOptions,
  ): Promise<void>;
}

/**
 * Sharp adapter options
 */
export interface SharpOptions {
  type?: 'sharp';
}

/**
 * Jimp adapter options
 */
export interface JimpOptions {
  type: 'jimp';
}

/**
 * imgproxy adapter options
 */
export interface ImgproxyOptions {
  type: 'imgproxy';
  /** Base URL of the imgproxy server */
  baseUrl: string;
  /** Signing key (hex encoded) */
  key?: string;
  /** Signing salt (hex encoded) */
  salt?: string;
}

/**
 * Union type for all image processor options
 */
export type GetImageProcessorOptions =
  | SharpOptions
  | JimpOptions
  | ImgproxyOptions;
