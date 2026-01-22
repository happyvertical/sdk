/**
 * Jimp adapter for image processing
 * Uses pure JavaScript for image processing (no native dependencies)
 * Ideal for serverless/edge environments where Sharp cannot be used
 */

import {
  ImageNotFoundError,
  ProcessingError,
  UnsupportedFormatError,
} from '../shared/errors.js';
import type {
  ConvertOptions,
  HashAlgorithm,
  ImageDimensions,
  ImageFormat,
  ImageInput,
  ImageMetadata,
  ImageProcessorInterface,
  JimpOptions,
  ResizeOptions,
  ThumbnailOptions,
} from '../shared/types.js';

// Jimp v1 type definitions
interface JimpImage {
  width: number;
  height: number;
  bitmap: {
    width: number;
    height: number;
    data: Buffer;
  };
  resize(options: { w?: number; h?: number }): JimpImage;
  scaleToFit(options: { w: number; h: number }): JimpImage;
  scale(factor: number): JimpImage;
  contain(options: { w: number; h: number }): JimpImage;
  cover(options: { w: number; h: number }): JimpImage;
  greyscale(): JimpImage;
  hash(base?: number): string;
  getBuffer(mime: string, options?: { quality?: number }): Promise<Buffer>;
  write(path: string): Promise<void>;
  clone(): JimpImage;
}

interface JimpStatic {
  read(
    input: string | Buffer | { data: Buffer; mime: string },
  ): Promise<JimpImage>;
}

/**
 * Jimp adapter for pure JavaScript image processing
 *
 * Provides a fallback option when Sharp (native library) is not available.
 * Useful for:
 * - Serverless environments (AWS Lambda, Vercel Edge)
 * - Environments without native compilation support
 * - Cross-platform compatibility
 *
 * Limitations compared to Sharp:
 * - Slower processing speed
 * - Limited EXIF/metadata extraction
 * - No AVIF support
 *
 * @example
 * ```typescript
 * const processor = new JimpAdapter();
 * const dims = await processor.getDimensions('/path/to/image.jpg');
 * console.log(dims); // { width: 1920, height: 1080 }
 * ```
 */
export class JimpAdapter implements ImageProcessorInterface {
  private jimpStatic: JimpStatic | null = null;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Stored for API compatibility and future extensibility
  private options: JimpOptions;

  /**
   * Create a new Jimp adapter
   * @param options - Jimp adapter options
   */
  constructor(options: JimpOptions = { type: 'jimp' }) {
    this.options = options;
  }

  /**
   * Lazily load Jimp module
   */
  private async getJimp(): Promise<JimpStatic> {
    if (!this.jimpStatic) {
      try {
        const jimpModule = await import('jimp');
        this.jimpStatic = jimpModule.Jimp as unknown as JimpStatic;
      } catch (error) {
        throw new ProcessingError(
          'Jimp library is not installed. Install it with: npm install jimp',
          'jimp',
          error instanceof Error ? error : undefined,
        );
      }
    }
    return this.jimpStatic;
  }

  async getDimensions(input: ImageInput): Promise<ImageDimensions> {
    const Jimp = await this.getJimp();
    try {
      const image = await Jimp.read(input);
      return { width: image.width, height: image.height };
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async thumbnail(
    input: ImageInput,
    output: string,
    options: ThumbnailOptions = {},
  ): Promise<void> {
    const Jimp = await this.getJimp();
    try {
      const image = await Jimp.read(input);

      // Use scaleToFit to maintain aspect ratio within bounds
      if (options.maxWidth && options.maxHeight) {
        image.scaleToFit({ w: options.maxWidth, h: options.maxHeight });
      } else if (options.maxWidth) {
        const scale = options.maxWidth / image.width;
        if (scale < 1) {
          image.scale(scale);
        }
      } else if (options.maxHeight) {
        const scale = options.maxHeight / image.height;
        if (scale < 1) {
          image.scale(scale);
        }
      }

      await this.writeWithOptions(image, output, options.quality);
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof ImageNotFoundError
      ) {
        throw error;
      }
      throw this.mapError(error, input);
    }
  }

  async convert(
    input: ImageInput,
    output: string,
    options: ConvertOptions = {},
  ): Promise<void> {
    const Jimp = await this.getJimp();
    try {
      const image = await Jimp.read(input);
      await this.writeWithOptions(image, output, options.quality);
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async getMetadata(input: ImageInput): Promise<ImageMetadata> {
    const Jimp = await this.getJimp();
    try {
      const image = await Jimp.read(input);
      const mime = this.getMimeFromInput(input);
      const format = this.formatFromMime(mime);

      return {
        width: image.width,
        height: image.height,
        format,
        channels: 4, // Jimp uses RGBA internally
        hasAlpha: true, // Jimp always works with alpha channel
        // Jimp has limited metadata extraction
        // EXIF/IPTC/XMP not directly supported
      };
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  async hash(
    input: ImageInput,
    algorithm: HashAlgorithm = 'perceptual',
  ): Promise<string> {
    const Jimp = await this.getJimp();

    try {
      if (algorithm === 'md5' || algorithm === 'sha256') {
        const { createHash } = await import('node:crypto');
        const image = await Jimp.read(input);
        const buffer = await image.getBuffer('image/png');
        return createHash(algorithm).update(buffer).digest('hex');
      }

      // Jimp has built-in perceptual hash
      const image = await Jimp.read(input);
      // Jimp's hash returns a 64-bit hash as a base64 string
      // We'll compute our own for consistency with Sharp adapter
      const resized = image.clone().resize({ w: 8, h: 8 }).greyscale();

      // Compute average hash manually
      const data = resized.bitmap.data;
      let sum = 0;
      const pixels: number[] = [];

      // Extract grayscale values (every 4th byte is alpha, we want R channel)
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i]; // R channel (grayscale means R=G=B)
        pixels.push(gray);
        sum += gray;
      }

      const avg = sum / pixels.length;
      let hash = '';
      for (const val of pixels) {
        hash += val >= avg ? '1' : '0';
      }
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
    const Jimp = await this.getJimp();
    try {
      const image = await Jimp.read(input);

      const fit = options.fit || 'cover';

      if (options.width && options.height) {
        if (fit === 'cover') {
          image.cover({ w: options.width, h: options.height });
        } else if (fit === 'contain' || fit === 'inside') {
          image.contain({ w: options.width, h: options.height });
        } else {
          // 'fill' - resize to exact dimensions
          image.resize({ w: options.width, h: options.height });
        }
      } else if (options.width) {
        const scale = options.width / image.width;
        image.scale(scale);
      } else if (options.height) {
        const scale = options.height / image.height;
        image.scale(scale);
      }

      await this.writeWithOptions(image, output, options.quality);
    } catch (error) {
      throw this.mapError(error, input);
    }
  }

  /**
   * Write image with quality settings based on output format
   */
  private async writeWithOptions(
    image: JimpImage,
    output: string,
    quality?: number,
  ): Promise<void> {
    const format = this.inferFormat(output);
    const mime = this.mimeFromFormat(format);

    if (format === 'avif') {
      throw new UnsupportedFormatError('avif', 'jimp');
    }

    const buffer = await image.getBuffer(mime, {
      quality: quality ?? 80,
    });

    const { writeFile } = await import('node:fs/promises');
    await writeFile(output, buffer);
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
      bmp: 'png', // Convert BMP to PNG
    };
    return map[ext || ''] || 'jpeg';
  }

  /**
   * Get MIME type from format
   */
  private mimeFromFormat(format: ImageFormat): string {
    const map: Record<ImageFormat, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
      gif: 'image/gif',
      tiff: 'image/tiff',
    };
    return map[format] || 'image/jpeg';
  }

  /**
   * Get format from MIME type
   */
  private formatFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/tiff': 'tiff',
      'image/bmp': 'bmp',
    };
    return map[mime] || 'unknown';
  }

  /**
   * Try to determine MIME type from input
   */
  private getMimeFromInput(input: ImageInput): string {
    if (typeof input === 'string') {
      const format = this.inferFormat(input);
      return this.mimeFromFormat(format);
    }
    // For buffers, we'd need to check magic bytes
    // For simplicity, default to png
    return 'image/png';
  }

  /**
   * Map Jimp errors to our error types
   */
  private mapError(error: unknown, input: ImageInput): ProcessingError {
    const message = error instanceof Error ? error.message : String(error);

    // Check for common error patterns
    if (
      message.includes('no such file') ||
      message.includes('ENOENT') ||
      message.includes('Could not find')
    ) {
      const path = typeof input === 'string' ? input : '<buffer>';
      throw new ImageNotFoundError(path, 'jimp');
    }

    if (
      message.includes('not supported') ||
      message.includes('Could not find MIME')
    ) {
      throw new UnsupportedFormatError('unknown', 'jimp');
    }

    return new ProcessingError(
      `Image processing failed: ${message}`,
      'jimp',
      error instanceof Error ? error : undefined,
    );
  }
}
