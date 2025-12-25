/**
 * @happyvertical/images - Image processing utilities with adapter pattern
 *
 * Provides a unified interface for image processing that scales from
 * static sites to enterprise deployments:
 *
 * - **Sharp adapter**: Fast native processing (default)
 * - **Jimp adapter**: Pure JavaScript fallback (serverless/edge)
 * - **imgproxy adapter**: Self-hosted remote processing (scale)
 *
 * @example Basic usage with auto-detection
 * ```typescript
 * import { getDimensions, generateThumbnail } from '@happyvertical/images';
 *
 * // Automatically uses Sharp if available, falls back to Jimp
 * const dims = await getDimensions('/path/to/image.jpg');
 * await generateThumbnail('/path/to/image.jpg', '/path/to/thumb.jpg', {
 *   maxWidth: 300,
 *   maxHeight: 300
 * });
 * ```
 *
 * @example Using factory directly
 * ```typescript
 * import { getImageProcessor } from '@happyvertical/images';
 *
 * const processor = await getImageProcessor({ type: 'sharp' });
 * const metadata = await processor.getMetadata('/path/to/image.jpg');
 * ```
 *
 * @example Using imgproxy for remote processing
 * ```typescript
 * import { getImageProcessor } from '@happyvertical/images';
 *
 * const processor = await getImageProcessor({
 *   type: 'imgproxy',
 *   baseUrl: 'https://imgproxy.example.com',
 *   key: 'signing-key',
 *   salt: 'signing-salt'
 * });
 * ```
 *
 * @packageDocumentation
 */

export { ImgproxyAdapter } from './adapters/imgproxy.js';
export { JimpAdapter } from './adapters/jimp.js';
// Export adapters for direct use
export { SharpAdapter } from './adapters/sharp.js';
// Export all errors
export * from './shared/errors.js';
// Export factory
export { getAvailableAdapters, getImageProcessor } from './shared/factory.js';
// Export all types
export * from './shared/types.js';

import type {
  ConvertOptions,
  GetImageProcessorOptions,
  HashAlgorithm,
  ImageDimensions,
  ImageInput,
  ImageMetadata,
  ImageProcessorInterface,
  ResizeOptions,
  ThumbnailOptions,
} from './shared/types.js';

/**
 * Cached processor instance for auto-detection
 */
let cachedProcessor: ImageProcessorInterface | null = null;
let detectionAttempted = false;

/**
 * Get a default processor with auto-detection
 *
 * Auto-detection priority:
 * 1. If explicit adapter options provided, use those
 * 2. Try to load Sharp (fast native processing)
 * 3. Fall back to Jimp (pure JavaScript)
 *
 * The processor is cached for subsequent calls to avoid repeated detection.
 */
async function getDefaultProcessor(
  adapterOptions?: GetImageProcessorOptions,
): Promise<ImageProcessorInterface> {
  // If explicit options provided with a type, use them directly
  if (adapterOptions?.type) {
    const { getImageProcessor } = await import('./shared/factory.js');
    return getImageProcessor(adapterOptions);
  }

  // Use cached processor if available
  if (cachedProcessor && !adapterOptions) {
    return cachedProcessor;
  }

  // Auto-detect: try sharp first, fall back to jimp
  if (!detectionAttempted) {
    detectionAttempted = true;

    try {
      // Try to load sharp
      await import('sharp');
      const { SharpAdapter } = await import('./adapters/sharp.js');
      cachedProcessor = new SharpAdapter({});
    } catch {
      // Sharp not available, use jimp
      const { JimpAdapter } = await import('./adapters/jimp.js');
      cachedProcessor = new JimpAdapter({ type: 'jimp' });
    }
  }

  if (!cachedProcessor) {
    throw new Error('No image processor available. Install sharp or jimp.');
  }
  return cachedProcessor;
}

/**
 * Reset the cached processor (useful for testing)
 */
export function resetProcessor(): void {
  cachedProcessor = null;
  detectionAttempted = false;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get image dimensions
 *
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Image path or Buffer
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 * @returns Promise resolving to image dimensions
 *
 * @example
 * ```typescript
 * import { getDimensions } from '@happyvertical/images';
 *
 * // Auto-detect adapter
 * const dims = await getDimensions('/path/to/image.jpg');
 * console.log(`${dims.width}x${dims.height}`);
 *
 * // Force specific adapter
 * const jimp = await getDimensions(buffer, { type: 'jimp' });
 * ```
 */
export async function getDimensions(
  input: ImageInput,
  adapterOptions?: GetImageProcessorOptions,
): Promise<ImageDimensions> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.getDimensions(input);
}

/**
 * Generate a thumbnail image
 *
 * Creates a smaller version of the image while maintaining aspect ratio.
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Source image path or Buffer
 * @param output - Output file path
 * @param options - Thumbnail options (maxWidth, maxHeight, quality, format)
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 *
 * @example
 * ```typescript
 * import { generateThumbnail } from '@happyvertical/images';
 *
 * // Create 300x300 max thumbnail
 * await generateThumbnail('/path/to/image.jpg', '/path/to/thumb.jpg', {
 *   maxWidth: 300,
 *   maxHeight: 300,
 *   quality: 85
 * });
 *
 * // Convert to WebP while thumbnailing
 * await generateThumbnail('/path/to/image.jpg', '/path/to/thumb.webp', {
 *   maxWidth: 200,
 *   format: 'webp'
 * });
 * ```
 */
export async function generateThumbnail(
  input: ImageInput,
  output: string,
  options?: ThumbnailOptions,
  adapterOptions?: GetImageProcessorOptions,
): Promise<void> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.thumbnail(input, output, options);
}

/**
 * Convert image format
 *
 * Converts an image to a different format with optional quality settings.
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Source image path or Buffer
 * @param output - Output file path (format inferred from extension)
 * @param options - Conversion options (format, quality)
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 *
 * @example
 * ```typescript
 * import { convertFormat } from '@happyvertical/images';
 *
 * // Convert PNG to JPEG
 * await convertFormat('/path/to/image.png', '/path/to/image.jpg', {
 *   quality: 90
 * });
 *
 * // Convert to WebP with explicit format
 * await convertFormat('/path/to/image.jpg', '/path/to/image.webp', {
 *   format: 'webp',
 *   quality: 80
 * });
 * ```
 */
export async function convertFormat(
  input: ImageInput,
  output: string,
  options?: ConvertOptions,
  adapterOptions?: GetImageProcessorOptions,
): Promise<void> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.convert(input, output, options);
}

/**
 * Get image metadata
 *
 * Extracts comprehensive metadata including dimensions, format, color space,
 * and optionally EXIF/IPTC/XMP data.
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Image path or Buffer
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 * @returns Promise resolving to metadata object
 *
 * @example
 * ```typescript
 * import { getImageMetadata } from '@happyvertical/images';
 *
 * const metadata = await getImageMetadata('/path/to/photo.jpg');
 * console.log(`Format: ${metadata.format}`);
 * console.log(`Dimensions: ${metadata.width}x${metadata.height}`);
 * console.log(`Has alpha: ${metadata.hasAlpha}`);
 * if (metadata.exif) {
 *   console.log('EXIF data:', metadata.exif);
 * }
 * ```
 */
export async function getImageMetadata(
  input: ImageInput,
  adapterOptions?: GetImageProcessorOptions,
): Promise<ImageMetadata> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.getMetadata(input);
}

/**
 * Compute image hash
 *
 * Generates a hash of the image for deduplication or comparison.
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Image path or Buffer
 * @param algorithm - Hash algorithm: 'perceptual' (default), 'md5', 'sha256'
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 * @returns Promise resolving to hash string
 *
 * @example
 * ```typescript
 * import { getImageHash } from '@happyvertical/images';
 *
 * // Perceptual hash for finding similar images
 * const pHash = await getImageHash('/path/to/image.jpg');
 * console.log(`Perceptual hash: ${pHash}`);
 *
 * // Cryptographic hash for exact matching
 * const sha256 = await getImageHash('/path/to/image.jpg', 'sha256');
 * console.log(`SHA-256: ${sha256}`);
 * ```
 */
export async function getImageHash(
  input: ImageInput,
  algorithm: HashAlgorithm = 'perceptual',
  adapterOptions?: GetImageProcessorOptions,
): Promise<string> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.hash(input, algorithm);
}

/**
 * Resize image with full control
 *
 * Resizes an image to specific dimensions with control over fit mode.
 * Uses auto-detection to select the best available processor.
 *
 * @param input - Source image path or Buffer
 * @param output - Output file path
 * @param options - Resize options (width, height, fit, quality, format)
 * @param adapterOptions - Optional adapter configuration to override auto-detection
 *
 * @example
 * ```typescript
 * import { resizeImage } from '@happyvertical/images';
 *
 * // Resize to exact dimensions (may crop)
 * await resizeImage('/path/to/image.jpg', '/path/to/resized.jpg', {
 *   width: 800,
 *   height: 600,
 *   fit: 'cover' // Crop to fill
 * });
 *
 * // Resize to fit within dimensions (no crop)
 * await resizeImage('/path/to/image.jpg', '/path/to/resized.jpg', {
 *   width: 800,
 *   height: 600,
 *   fit: 'inside' // Fit within, may be smaller
 * });
 * ```
 */
export async function resizeImage(
  input: ImageInput,
  output: string,
  options: ResizeOptions,
  adapterOptions?: GetImageProcessorOptions,
): Promise<void> {
  const processor = await getDefaultProcessor(adapterOptions);
  return processor.resize(input, output, options);
}
