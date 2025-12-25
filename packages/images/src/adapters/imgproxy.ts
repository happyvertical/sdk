/**
 * imgproxy adapter for remote image processing
 *
 * Uses a self-hosted imgproxy server for scalable image processing.
 * Ideal for enterprise deployments where processing is offloaded to dedicated servers.
 *
 * @see https://imgproxy.net/
 */

import { createHmac } from 'node:crypto';
import {
  OperationNotSupportedError,
  ProcessingError,
  RemoteServiceError,
} from '../shared/errors.js';
import type {
  ConvertOptions,
  HashAlgorithm,
  ImageDimensions,
  ImageFormat,
  ImageInput,
  ImageMetadata,
  ImageProcessorInterface,
  ImgproxyOptions,
  ResizeOptions,
  ThumbnailOptions,
} from '../shared/types.js';

/**
 * imgproxy adapter for remote image processing
 *
 * Offloads image processing to a self-hosted imgproxy server.
 * Supports URL signing for secure access.
 *
 * Features:
 * - Scalable remote processing
 * - URL-based API
 * - Signed URLs for security
 * - CDN-friendly outputs
 *
 * Limitations:
 * - Requires network access to imgproxy server
 * - Input must be accessible via URL (not local paths)
 * - Hash computation not directly supported (requires fetching image)
 *
 * @example
 * ```typescript
 * const processor = new ImgproxyAdapter({
 *   type: 'imgproxy',
 *   baseUrl: 'https://imgproxy.example.com',
 *   key: 'hex-encoded-key',
 *   salt: 'hex-encoded-salt'
 * });
 *
 * await processor.thumbnail(
 *   'https://example.com/image.jpg',
 *   '/tmp/thumb.jpg',
 *   { maxWidth: 300 }
 * );
 * ```
 */
export class ImgproxyAdapter implements ImageProcessorInterface {
  private baseUrl: string;
  private key?: Buffer;
  private salt?: Buffer;

  constructor(options: ImgproxyOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');

    if (options.key && options.salt) {
      this.key = Buffer.from(options.key, 'hex');
      this.salt = Buffer.from(options.salt, 'hex');
    }
  }

  /**
   * Sign a path using HMAC-SHA256
   */
  private sign(path: string): string {
    if (!this.key || !this.salt) {
      return 'unsafe';
    }

    const hmac = createHmac('sha256', this.key);
    hmac.update(this.salt);
    hmac.update(path);

    // imgproxy expects base64url with padding stripped
    return hmac
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
      .substring(0, 32);
  }

  /**
   * Encode source URL for imgproxy
   */
  private encodeSource(source: string): string {
    // imgproxy expects base64url encoded source
    return Buffer.from(source)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Build imgproxy URL
   */
  private buildUrl(
    source: string,
    processing: string,
    extension?: string,
  ): string {
    const encodedSource = this.encodeSource(source);
    const ext = extension ? `.${extension}` : '';
    const path = `/${processing}/${encodedSource}${ext}`;
    const signature = this.sign(path);
    return `${this.baseUrl}/${signature}${path}`;
  }

  /**
   * Convert ImageInput to URL string
   */
  private toUrl(input: ImageInput): string {
    if (Buffer.isBuffer(input)) {
      throw new ProcessingError(
        'imgproxy adapter requires URL input, not Buffer. ' +
          'Upload the buffer to a storage service first.',
        'imgproxy',
      );
    }

    // Check if it's a valid URL
    if (!input.startsWith('http://') && !input.startsWith('https://')) {
      throw new ProcessingError(
        'imgproxy adapter requires HTTP/HTTPS URLs as input. ' +
          `Got: ${input.substring(0, 50)}...`,
        'imgproxy',
      );
    }

    return input;
  }

  async getDimensions(input: ImageInput): Promise<ImageDimensions> {
    const url = this.toUrl(input);

    try {
      // Use imgproxy's /info endpoint
      const infoUrl = this.buildUrl(url, 'info:1');

      const response = await fetch(infoUrl);
      if (!response.ok) {
        throw new RemoteServiceError(
          `imgproxy info request failed: ${response.statusText}`,
          'imgproxy',
          response.status,
        );
      }

      const info = await response.json();
      return {
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof RemoteServiceError
      ) {
        throw error;
      }
      throw new ProcessingError(
        `Failed to get dimensions: ${error instanceof Error ? error.message : String(error)}`,
        'imgproxy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async thumbnail(
    input: ImageInput,
    output: string,
    options: ThumbnailOptions = {},
  ): Promise<void> {
    const url = this.toUrl(input);

    try {
      const processing = this.buildProcessingString({
        resize: 'fit',
        width: options.maxWidth || 0,
        height: options.maxHeight || 0,
        quality: options.quality,
        format: options.format,
      });

      const ext = options.format || this.inferFormat(output);
      const imgUrl = this.buildUrl(url, processing, ext);

      await this.fetchAndSave(imgUrl, output);
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof RemoteServiceError
      ) {
        throw error;
      }
      throw new ProcessingError(
        `Thumbnail generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'imgproxy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async convert(
    input: ImageInput,
    output: string,
    options: ConvertOptions = {},
  ): Promise<void> {
    const url = this.toUrl(input);

    try {
      const format = options.format || this.inferFormat(output);
      const processing = this.buildProcessingString({
        quality: options.quality,
        format,
      });

      const imgUrl = this.buildUrl(url, processing, format);
      await this.fetchAndSave(imgUrl, output);
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof RemoteServiceError
      ) {
        throw error;
      }
      throw new ProcessingError(
        `Format conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        'imgproxy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getMetadata(input: ImageInput): Promise<ImageMetadata> {
    const url = this.toUrl(input);

    try {
      // Use imgproxy's /info endpoint
      const infoUrl = this.buildUrl(url, 'info:1');

      const response = await fetch(infoUrl);
      if (!response.ok) {
        throw new RemoteServiceError(
          `imgproxy info request failed: ${response.statusText}`,
          'imgproxy',
          response.status,
        );
      }

      const info = await response.json();

      return {
        width: info.width,
        height: info.height,
        format: info.type || 'unknown',
        // imgproxy returns limited metadata
        // Additional EXIF/IPTC/XMP not typically available
      };
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof RemoteServiceError
      ) {
        throw error;
      }
      throw new ProcessingError(
        `Failed to get metadata: ${error instanceof Error ? error.message : String(error)}`,
        'imgproxy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async hash(
    _input: ImageInput,
    _algorithm: HashAlgorithm = 'perceptual',
  ): Promise<string> {
    // imgproxy doesn't support hashing directly
    // Would need to fetch the image and compute hash locally
    throw new OperationNotSupportedError(
      'hash (imgproxy does not support direct hashing - fetch image first)',
      'imgproxy',
    );
  }

  async resize(
    input: ImageInput,
    output: string,
    options: ResizeOptions,
  ): Promise<void> {
    const url = this.toUrl(input);

    try {
      // Map fit modes to imgproxy resize types
      const resizeType = this.mapFitToResizeType(options.fit || 'cover');

      const processing = this.buildProcessingString({
        resize: resizeType,
        width: options.width || 0,
        height: options.height || 0,
        quality: options.quality,
        format: options.format,
      });

      const ext = options.format || this.inferFormat(output);
      const imgUrl = this.buildUrl(url, processing, ext);

      await this.fetchAndSave(imgUrl, output);
    } catch (error) {
      if (
        error instanceof ProcessingError ||
        error instanceof RemoteServiceError
      ) {
        throw error;
      }
      throw new ProcessingError(
        `Resize failed: ${error instanceof Error ? error.message : String(error)}`,
        'imgproxy',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Build imgproxy processing string
   */
  private buildProcessingString(opts: {
    resize?: string;
    width?: number;
    height?: number;
    quality?: number;
    format?: ImageFormat | string;
  }): string {
    const parts: string[] = [];

    // Resize: rs:<type>:<width>:<height>
    if (opts.resize) {
      const w = opts.width || 0;
      const h = opts.height || 0;
      parts.push(`rs:${opts.resize}:${w}:${h}`);
    }

    // Quality: q:<quality>
    if (opts.quality) {
      parts.push(`q:${opts.quality}`);
    }

    // Format is handled via extension, not processing string

    return parts.length > 0 ? parts.join('/') : 'raw:1';
  }

  /**
   * Map fit mode to imgproxy resize type
   */
  private mapFitToResizeType(fit: string): string {
    const map: Record<string, string> = {
      cover: 'fill', // Fill and crop
      contain: 'fit', // Fit within
      fill: 'force', // Force exact size
      inside: 'fit', // Same as contain
      outside: 'fill', // Same as cover
    };
    return map[fit] || 'fit';
  }

  /**
   * Fetch image from imgproxy and save to file
   */
  private async fetchAndSave(url: string, output: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new RemoteServiceError(
        `imgproxy request failed: ${response.statusText}`,
        'imgproxy',
        response.status,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

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
    };
    return map[ext || ''] || 'jpeg';
  }
}
