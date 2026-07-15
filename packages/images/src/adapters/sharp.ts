/**
 * Sharp adapter for image processing
 * Uses the native sharp library for fast image processing
 */

import { ImageNotFoundError, ProcessingError } from '../shared/errors.js';
import type {
  ConvertOptions,
  HashAlgorithm,
  ImageDimensions,
  ImageFormat,
  ImageInput,
  ImageMetadata,
  ImageProcessorInterface,
  ResizeOptions,
  SharpOptions,
  ThumbnailOptions,
} from '../shared/types.js';

type SharpConstructor = typeof import('sharp').default;

/**
 * Sharp adapter for high-performance image processing
 *
 * Uses the native sharp library which provides:
 * - Fast image resizing and format conversion
 * - Rich metadata extraction including EXIF, IPTC, XMP
 * - Perceptual hashing for image deduplication
 *
 * @example
 * ```typescript
 * const processor = new SharpAdapter();
 * const dims = await processor.getDimensions('/path/to/image.jpg');
 * console.log(dims); // { width: 1920, height: 1080 }
 * ```
 */
export class SharpAdapter implements ImageProcessorInterface {
  private sharp: SharpConstructor | null = null;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Stored for API compatibility and future extensibility
  private options: SharpOptions;

  /**
   * Create a new Sharp adapter
   * @param options - Sharp adapter options
   */
  constructor(options: SharpOptions = {}) {
    this.options = options;
  }

  /**
   * Lazily load sharp module
   */
  private async getSharp(): Promise<SharpConstructor> {
    if (!this.sharp) {
      try {
        this.sharp = (await import('sharp')).default;
      } catch (error) {
        throw new ProcessingError(
          'Sharp library is not installed. Install it with: npm install sharp',
          'sharp',
          error instanceof Error ? error : undefined,
        );
      }
    }
    return this.sharp;
  }

  async getDimensions(input: ImageInput): Promise<ImageDimensions> {
    const sharp = await this.getSharp();
    try {
      const metadata = await sharp(input).metadata();
      if (!metadata.width || !metadata.height) {
        throw new ProcessingError(
          'Could not determine image dimensions',
          'sharp',
        );
      }
      return { width: metadata.width, height: metadata.height };
    } catch (error) {
      if (error instanceof ProcessingError) throw error;
      throw this.mapError(error, input);
    }
  }

  async thumbnail(
    input: ImageInput,
    output: string,
    options: ThumbnailOptions = {},
  ): Promise<void> {
    const sharp = await this.getSharp();
    try {
      let pipeline = sharp(input).resize({
        width: options.maxWidth,
        height: options.maxHeight,
        fit: options.fit || 'inside',
        withoutEnlargement: true,
      });

      if (options.format) {
        pipeline = pipeline.toFormat(options.format, {
          quality: options.quality,
        });
      } else if (options.quality) {
        // Apply quality to inferred format from output path
        const format = this.inferFormat(output);
        pipeline = pipeline.toFormat(format, { quality: options.quality });
      }

      await pipeline.toFile(output);
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async convert(
    input: ImageInput,
    output: string,
    options: ConvertOptions = {},
  ): Promise<void> {
    const sharp = await this.getSharp();
    try {
      const format = options.format || this.inferFormat(output);
      await sharp(input)
        .toFormat(format, { quality: options.quality })
        .toFile(output);
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async getMetadata(input: ImageInput): Promise<ImageMetadata> {
    const sharp = await this.getSharp();
    try {
      const meta = await sharp(input).metadata();
      if (!meta.width || !meta.height || !meta.format) {
        throw new ProcessingError('Could not extract image metadata', 'sharp');
      }
      return {
        width: meta.width,
        height: meta.height,
        format: meta.format,
        space: meta.space,
        channels: meta.channels,
        depth: meta.depth,
        density: meta.density,
        hasAlpha: meta.hasAlpha,
        orientation: meta.orientation,
        exif: meta.exif ? this.parseExifBuffer(meta.exif) : undefined,
        iptc: meta.iptc ? this.parseIptcBuffer(meta.iptc) : undefined,
        xmp: meta.xmp ? this.parseXmpBuffer(meta.xmp) : undefined,
      };
    } catch (error) {
      if (error instanceof ProcessingError) throw error;
      throw this.mapError(error, input);
    }
  }

  async hash(
    input: ImageInput,
    algorithm: HashAlgorithm = 'perceptual',
  ): Promise<string> {
    const sharp = await this.getSharp();

    try {
      if (algorithm === 'md5' || algorithm === 'sha256') {
        const { createHash } = await import('node:crypto');
        const buffer = await sharp(input).toBuffer();
        return createHash(algorithm).update(buffer).digest('hex');
      }

      // Perceptual hash: resize to 8x8 grayscale, compute average hash
      const { data } = await sharp(input)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
      let hash = '';
      for (const val of data) {
        hash += val >= avg ? '1' : '0';
      }
      // Convert binary string to hex
      return BigInt(`0b${hash}`).toString(16).padStart(16, '0');
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async resize(
    input: ImageInput,
    output: string,
    options: ResizeOptions,
  ): Promise<void> {
    const sharp = await this.getSharp();
    try {
      let pipeline = sharp(input).resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'cover',
      });

      if (options.format) {
        pipeline = pipeline.toFormat(options.format, {
          quality: options.quality,
        });
      } else if (options.quality) {
        const format = this.inferFormat(output);
        pipeline = pipeline.toFormat(format, { quality: options.quality });
      }

      await pipeline.toFile(output);
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  /**
   * Infer image format from file extension
   */
  private inferFormat(path: string): ImageFormat {
    const ext = path.split('.').pop()?.toLowerCase();
    const map: Record<string, ImageFormat> = {
      jpg: 'jpeg',
      jpeg: 'jpeg',
      png: 'png',
      webp: 'webp',
      avif: 'avif',
      gif: 'gif',
      tiff: 'tiff',
      tif: 'tiff',
    };
    return map[ext || ''] || 'jpeg';
  }

  /**
   * Parse EXIF buffer to object (basic parsing)
   */
  private parseExifBuffer(buffer: Buffer): Record<string, unknown> {
    // For now, return basic info - could be expanded with exif-reader
    return { raw: `${buffer.toString('base64').slice(0, 100)}...` };
  }

  /**
   * Parse IPTC buffer to object (basic parsing)
   */
  private parseIptcBuffer(buffer: Buffer): Record<string, unknown> {
    return { raw: `${buffer.toString('base64').slice(0, 100)}...` };
  }

  /**
   * Parse XMP buffer to object (basic parsing)
   */
  private parseXmpBuffer(buffer: Buffer): Record<string, unknown> {
    // XMP is XML, try to extract as string
    try {
      const xmpString = buffer.toString('utf8');
      return { raw: `${xmpString.slice(0, 500)}...` };
    } catch {
      return { raw: `${buffer.toString('base64').slice(0, 100)}...` };
    }
  }

  /**
   * Map sharp errors to our error types
   */
  private mapError(error: unknown, input: ImageInput): ProcessingError {
    const message = error instanceof Error ? error.message : String(error);

    // Check for common error patterns
    if (message.includes('Input file is missing')) {
      const path = typeof input === 'string' ? input : '<buffer>';
      throw new ImageNotFoundError(path, 'sharp');
    }

    if (message.includes('Input buffer contains unsupported image format')) {
      throw new ProcessingError('Unsupported image format', 'sharp');
    }

    return new ProcessingError(
      `Image processing failed: ${message}`,
      'sharp',
      error instanceof Error ? error : undefined,
    );
  }
}
