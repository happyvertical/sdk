/**
 * Integration tests for imgproxy adapter
 *
 * These tests hit the actual deployed imgproxy server at imgproxy.happyvertical.com
 * to verify URL signing and image processing work correctly.
 *
 * Required environment variables:
 * - IMGPROXY_KEY: Hex-encoded HMAC key
 * - IMGPROXY_SALT: Hex-encoded HMAC salt
 *
 * Skip these tests in CI unless credentials are available:
 * IMGPROXY_KEY=... IMGPROXY_SALT=... npm test
 */

import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImgproxyAdapter } from './imgproxy.js';

// Test configuration
const IMGPROXY_BASE_URL = 'https://imgproxy.happyvertical.com';
const IMGPROXY_KEY = process.env.IMGPROXY_KEY;
const IMGPROXY_SALT = process.env.IMGPROXY_SALT;

// Test image URLs (public images that should always be available)
const TEST_IMAGES = {
  // Lorem Picsum - reliable test images
  picsum800x600: 'https://picsum.photos/id/1/800/600',
  picsum1920x1080: 'https://picsum.photos/id/10/1920/1080',
  // Wikipedia Commons - public domain images
  wikipedia:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png',
};

// Output directory for test files
const OUTPUT_DIR = join(process.cwd(), '.test-imgproxy-integration');

// Check if integration tests should run
const shouldRunIntegrationTests = Boolean(IMGPROXY_KEY && IMGPROXY_SALT);

describe.skipIf(!shouldRunIntegrationTests)(
  'ImgproxyAdapter Integration Tests',
  () => {
    let adapter: ImgproxyAdapter;

    beforeAll(async () => {
      // Create adapter with real credentials
      adapter = new ImgproxyAdapter({
        type: 'imgproxy',
        baseUrl: IMGPROXY_BASE_URL,
        key: IMGPROXY_KEY!,
        salt: IMGPROXY_SALT!,
      });

      // Create output directory
      await mkdir(OUTPUT_DIR, { recursive: true });
    });

    afterAll(async () => {
      // Cleanup output directory
      try {
        await rm(OUTPUT_DIR, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('Health Check', () => {
      it('should reach imgproxy health endpoint', async () => {
        const response = await fetch(`${IMGPROXY_BASE_URL}/health`);
        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
      });

      it('should reject unsigned requests', async () => {
        // Unsigned request should fail with 403
        const response = await fetch(
          `${IMGPROXY_BASE_URL}/insecure/rs:fit:300:200/plain/https://picsum.photos/800/600`,
        );
        expect(response.status).toBe(403);
      });
    });

    describe('URL Signing', () => {
      it('should generate valid signed URLs that return 200', async () => {
        // Use getDimensions which internally builds a signed URL
        const dims = await adapter.getDimensions(TEST_IMAGES.picsum800x600);

        // If we got here without throwing, the signed URL worked
        expect(dims.width).toBeGreaterThan(0);
        expect(dims.height).toBeGreaterThan(0);
      });

      it('should fail with wrong key/salt', async () => {
        const badAdapter = new ImgproxyAdapter({
          type: 'imgproxy',
          baseUrl: IMGPROXY_BASE_URL,
          key: 'deadbeefdeadbeefdeadbeefdeadbeef', // Wrong key
          salt: 'cafebabecafebabecafebabecafebabe', // Wrong salt
        });

        // Should throw RemoteServiceError with 403
        await expect(
          badAdapter.getDimensions(TEST_IMAGES.picsum800x600),
        ).rejects.toThrow(/403|Forbidden|failed/i);
      });
    });

    describe('getDimensions', () => {
      it('should get dimensions of 800x600 image', async () => {
        const dims = await adapter.getDimensions(TEST_IMAGES.picsum800x600);

        expect(dims.width).toBe(800);
        expect(dims.height).toBe(600);
      });

      it('should get dimensions of 1920x1080 image', async () => {
        const dims = await adapter.getDimensions(TEST_IMAGES.picsum1920x1080);

        expect(dims.width).toBe(1920);
        expect(dims.height).toBe(1080);
      });

      it('should get dimensions of PNG image', async () => {
        const dims = await adapter.getDimensions(TEST_IMAGES.wikipedia);

        expect(dims.width).toBeGreaterThan(0);
        expect(dims.height).toBeGreaterThan(0);
      });
    });

    describe('getMetadata', () => {
      it('should get metadata including format', async () => {
        const metadata = await adapter.getMetadata(TEST_IMAGES.picsum800x600);

        expect(metadata.width).toBe(800);
        expect(metadata.height).toBe(600);
        expect(metadata.format).toBeDefined();
      });

      it('should detect PNG format', async () => {
        const metadata = await adapter.getMetadata(TEST_IMAGES.wikipedia);

        expect(metadata.format).toBe('png');
      });
    });

    describe('thumbnail', () => {
      it('should generate 300x200 thumbnail', async () => {
        const output = join(OUTPUT_DIR, 'thumb-300x200.jpg');

        await adapter.thumbnail(TEST_IMAGES.picsum800x600, output, {
          maxWidth: 300,
          maxHeight: 200,
          format: 'jpeg',
        });

        // Verify file was created
        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);

        // Verify dimensions using the adapter
        const dims = await getLocalImageDimensions(output);
        expect(dims.width).toBeLessThanOrEqual(300);
        expect(dims.height).toBeLessThanOrEqual(200);
      });

      it('should generate WebP thumbnail', async () => {
        const output = join(OUTPUT_DIR, 'thumb.webp');

        await adapter.thumbnail(TEST_IMAGES.picsum1920x1080, output, {
          maxWidth: 400,
          format: 'webp',
          quality: 80,
        });

        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);

        // Check WebP magic bytes
        const buffer = await readFile(output);
        expect(buffer[0]).toBe(0x52); // R
        expect(buffer[1]).toBe(0x49); // I
        expect(buffer[2]).toBe(0x46); // F
        expect(buffer[3]).toBe(0x46); // F
      });

      it('should generate PNG thumbnail preserving transparency', async () => {
        const output = join(OUTPUT_DIR, 'thumb-transparent.png');

        await adapter.thumbnail(TEST_IMAGES.wikipedia, output, {
          maxWidth: 100,
          format: 'png',
        });

        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);

        // Check PNG magic bytes
        const buffer = await readFile(output);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50); // P
        expect(buffer[2]).toBe(0x4e); // N
        expect(buffer[3]).toBe(0x47); // G
      });
    });

    describe('resize', () => {
      it('should resize to exact dimensions with cover fit', async () => {
        const output = join(OUTPUT_DIR, 'resize-cover-400x300.jpg');

        await adapter.resize(TEST_IMAGES.picsum800x600, output, {
          width: 400,
          height: 300,
          fit: 'cover',
          format: 'jpeg',
        });

        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);
      });

      it('should resize with contain fit', async () => {
        const output = join(OUTPUT_DIR, 'resize-contain-400x300.jpg');

        await adapter.resize(TEST_IMAGES.picsum800x600, output, {
          width: 400,
          height: 300,
          fit: 'contain',
          format: 'jpeg',
        });

        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);
      });

      it('should resize with quality setting', async () => {
        const outputHigh = join(OUTPUT_DIR, 'resize-high-quality.jpg');
        const outputLow = join(OUTPUT_DIR, 'resize-low-quality.jpg');

        await adapter.resize(TEST_IMAGES.picsum800x600, outputHigh, {
          width: 400,
          height: 300,
          quality: 95,
          format: 'jpeg',
        });

        await adapter.resize(TEST_IMAGES.picsum800x600, outputLow, {
          width: 400,
          height: 300,
          quality: 30,
          format: 'jpeg',
        });

        const statsHigh = await stat(outputHigh);
        const statsLow = await stat(outputLow);

        // High quality should be larger than low quality
        expect(statsHigh.size).toBeGreaterThan(statsLow.size);
      });
    });

    describe('convert', () => {
      it('should convert JPEG to WebP', async () => {
        const output = join(OUTPUT_DIR, 'converted.webp');

        await adapter.convert(TEST_IMAGES.picsum800x600, output, {
          format: 'webp',
          quality: 85,
        });

        const buffer = await readFile(output);
        // WebP files start with RIFF
        expect(buffer.slice(0, 4).toString()).toBe('RIFF');
      });

      it('should convert to AVIF', async () => {
        const output = join(OUTPUT_DIR, 'converted.avif');

        await adapter.convert(TEST_IMAGES.picsum800x600, output, {
          format: 'avif',
          quality: 80,
        });

        const stats = await stat(output);
        expect(stats.size).toBeGreaterThan(0);
      });

      it('should convert PNG to JPEG', async () => {
        const output = join(OUTPUT_DIR, 'png-to-jpeg.jpg');

        await adapter.convert(TEST_IMAGES.wikipedia, output, {
          format: 'jpeg',
          quality: 90,
        });

        const buffer = await readFile(output);
        // JPEG files start with FFD8
        expect(buffer[0]).toBe(0xff);
        expect(buffer[1]).toBe(0xd8);
      });
    });

    describe('Error Handling', () => {
      it('should handle 404 for non-existent images', async () => {
        await expect(
          adapter.getDimensions(
            'https://example.com/nonexistent-image-12345.jpg',
          ),
        ).rejects.toThrow();
      });

      it('should handle invalid image URLs', async () => {
        await expect(
          adapter.getDimensions('https://example.com/not-an-image.html'),
        ).rejects.toThrow();
      });

      it('should reject local file paths', async () => {
        await expect(
          adapter.getDimensions('/local/path/image.jpg'),
        ).rejects.toThrow(/HTTP|HTTPS|URL/i);
      });

      it('should reject buffer input', async () => {
        const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        await expect(adapter.getDimensions(buffer)).rejects.toThrow(
          /URL|buffer/i,
        );
      });
    });

    describe('Performance', () => {
      it('should process thumbnail request within 5 seconds', async () => {
        const output = join(OUTPUT_DIR, 'perf-test.jpg');
        const start = Date.now();

        await adapter.thumbnail(TEST_IMAGES.picsum1920x1080, output, {
          maxWidth: 300,
          format: 'jpeg',
        });

        const duration = Date.now() - start;
        expect(duration).toBeLessThan(5000);
      });

      it('should handle concurrent requests', async () => {
        const requests = Array.from({ length: 5 }, (_, i) => {
          const output = join(OUTPUT_DIR, `concurrent-${i}.jpg`);
          return adapter.thumbnail(TEST_IMAGES.picsum800x600, output, {
            maxWidth: 200 + i * 50,
            format: 'jpeg',
          });
        });

        const results = await Promise.allSettled(requests);
        const successful = results.filter((r) => r.status === 'fulfilled');

        // At least 4 out of 5 should succeed
        expect(successful.length).toBeGreaterThanOrEqual(4);
      });
    });
  },
);

/**
 * Helper to get dimensions of a local image file
 * Uses probe-image-size or falls back to reading first bytes
 */
async function getLocalImageDimensions(
  path: string,
): Promise<{ width: number; height: number }> {
  const buffer = await readFile(path);

  // Try to detect dimensions from common formats
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    // Parse JPEG markers to find SOF
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;

      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);

      // SOF0, SOF1, SOF2 markers contain dimensions
      if (marker >= 0xc0 && marker <= 0xc2) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }

      offset += 2 + length;
    }
  }

  // Fallback: return 0,0 and let test handle it
  return { width: 0, height: 0 };
}

// Describe test to run when credentials are not available
describe.skipIf(shouldRunIntegrationTests)(
  'ImgproxyAdapter Integration Tests (Skipped)',
  () => {
    it('skipped - IMGPROXY_KEY and IMGPROXY_SALT not set', () => {
      console.log(
        'To run imgproxy integration tests, set environment variables:',
      );
      console.log('  IMGPROXY_KEY=<hex-key> IMGPROXY_SALT=<hex-salt> npm test');
    });
  },
);
