/**
 * Tests for image processing adapters
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ImgproxyAdapter } from './adapters/imgproxy.js';
import { JimpAdapter } from './adapters/jimp.js';
import { SharpAdapter } from './adapters/sharp.js';
import {
  ImageNotFoundError,
  OperationNotSupportedError,
  ProcessingError,
  RemoteServiceError,
} from './shared/errors.js';
import type { ImageProcessorInterface } from './shared/types.js';

// Test directory setup
const TEST_DIR = join(process.cwd(), '.test-images');
const TEST_IMAGE_PATH = join(TEST_DIR, 'test-image.png');
const OUTPUT_DIR = join(TEST_DIR, 'output');

// Create a simple test PNG image (1x1 red pixel)
async function createTestImage(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Try to use Sharp to create test image, otherwise use a minimal PNG
  try {
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toFile(TEST_IMAGE_PATH);
  } catch {
    // Fallback: create minimal valid PNG (1x1 red pixel)
    // This is a valid PNG file with a single red pixel
    const minimalPng = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01, // 1x1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53,
      0xde, // 8-bit RGB
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41,
      0x54, // IDAT chunk
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xcf,
      0xc0,
      0x00,
      0x00, // compressed data
      0x00,
      0x03,
      0x00,
      0x01,
      0x00,
      0x18,
      0xdd,
      0x8d,
      0xb4, // CRC
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44, // IEND chunk
      0xae,
      0x42,
      0x60,
      0x82, // CRC
    ]);
    await writeFile(TEST_IMAGE_PATH, minimalPng);
  }
}

// Cleanup test directory
async function cleanupTestDir(): Promise<void> {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

beforeAll(async () => {
  await createTestImage();
});

afterAll(async () => {
  await cleanupTestDir();
});

// ============================================================================
// Sharp Adapter Tests
// ============================================================================

describe('SharpAdapter', () => {
  const adapter = new SharpAdapter();

  it('runs against Sharp 0.35.3', () => {
    expect(sharp.versions.sharp).toBe('0.35.3');
  });

  describe('getDimensions', () => {
    it('should get dimensions from file path', async () => {
      const dims = await adapter.getDimensions(TEST_IMAGE_PATH);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should get dimensions from buffer', async () => {
      const buffer = await readFile(TEST_IMAGE_PATH);
      const dims = await adapter.getDimensions(buffer);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should throw ImageNotFoundError for missing file', async () => {
      await expect(
        adapter.getDimensions('/nonexistent/path/image.png'),
      ).rejects.toThrow(ImageNotFoundError);
    });
  });

  describe('thumbnail', () => {
    it('should generate thumbnail', async () => {
      const output = join(OUTPUT_DIR, 'sharp-thumb.png');
      await adapter.thumbnail(TEST_IMAGE_PATH, output, {
        maxWidth: 50,
        maxHeight: 50,
      });

      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBeLessThanOrEqual(50);
      expect(dims.height).toBeLessThanOrEqual(50);
    });

    it('should generate thumbnail with quality', async () => {
      const output = join(OUTPUT_DIR, 'sharp-thumb-quality.jpg');
      await adapter.thumbnail(TEST_IMAGE_PATH, output, {
        maxWidth: 50,
        quality: 80,
        format: 'jpeg',
      });

      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBeLessThanOrEqual(50);
    });
  });

  describe('convert', () => {
    it('should convert PNG to JPEG', async () => {
      const output = join(OUTPUT_DIR, 'sharp-converted.jpg');
      await adapter.convert(TEST_IMAGE_PATH, output, { format: 'jpeg' });

      const metadata = await adapter.getMetadata(output);
      expect(metadata.format).toBe('jpeg');
    });

    it('should convert to WebP', async () => {
      const output = join(OUTPUT_DIR, 'sharp-converted.webp');
      await adapter.convert(TEST_IMAGE_PATH, output, {
        format: 'webp',
        quality: 90,
      });

      const metadata = await adapter.getMetadata(output);
      expect(metadata.format).toBe('webp');
    });
  });

  describe('getMetadata', () => {
    it('should get metadata from file', async () => {
      const metadata = await adapter.getMetadata(TEST_IMAGE_PATH);

      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      expect(metadata.format).toBe('png');
    });

    it('should get metadata from buffer', async () => {
      const buffer = await readFile(TEST_IMAGE_PATH);
      const metadata = await adapter.getMetadata(buffer);

      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.format).toBe('png');
    });
  });

  describe('hash', () => {
    it('should compute perceptual hash', async () => {
      const hash = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16); // 64 bits in hex
    });

    it('should compute MD5 hash', async () => {
      const hash = await adapter.hash(TEST_IMAGE_PATH, 'md5');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32); // MD5 is 128 bits = 32 hex chars
    });

    it('should compute SHA256 hash', async () => {
      const hash = await adapter.hash(TEST_IMAGE_PATH, 'sha256');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 is 256 bits = 64 hex chars
    });

    it('should produce same perceptual hash for same image', async () => {
      const hash1 = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');
      const hash2 = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');

      expect(hash1).toBe(hash2);
    });
  });

  describe('resize', () => {
    it('should resize with cover fit', async () => {
      const output = join(OUTPUT_DIR, 'sharp-resize-cover.png');
      await adapter.resize(TEST_IMAGE_PATH, output, {
        width: 50,
        height: 50,
        fit: 'cover',
      });

      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBe(50);
      expect(dims.height).toBe(50);
    });

    it('should resize with contain fit', async () => {
      const output = join(OUTPUT_DIR, 'sharp-resize-contain.png');
      await adapter.resize(TEST_IMAGE_PATH, output, {
        width: 50,
        height: 50,
        fit: 'contain',
      });

      const dims = await adapter.getDimensions(output);
      // One dimension should be 50, other may be less
      expect(dims.width).toBeLessThanOrEqual(50);
      expect(dims.height).toBeLessThanOrEqual(50);
    });
  });
});

// ============================================================================
// Jimp Adapter Tests
// ============================================================================

describe('JimpAdapter', () => {
  let adapter: JimpAdapter;
  let jimpAvailable = false;

  beforeAll(async () => {
    try {
      await import('jimp');
      jimpAvailable = true;
      adapter = new JimpAdapter({ type: 'jimp' });
    } catch {
      // Jimp not available
    }
  });

  describe.skipIf(!jimpAvailable)('getDimensions', () => {
    it('should get dimensions from file path', async () => {
      const dims = await adapter.getDimensions(TEST_IMAGE_PATH);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should get dimensions from buffer', async () => {
      const buffer = await readFile(TEST_IMAGE_PATH);
      const dims = await adapter.getDimensions(buffer);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!jimpAvailable)('thumbnail', () => {
    it('should generate thumbnail', async () => {
      const output = join(OUTPUT_DIR, 'jimp-thumb.png');
      await adapter.thumbnail(TEST_IMAGE_PATH, output, {
        maxWidth: 50,
        maxHeight: 50,
      });

      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBeLessThanOrEqual(50);
      expect(dims.height).toBeLessThanOrEqual(50);
    });
  });

  describe.skipIf(!jimpAvailable)('convert', () => {
    it('should convert PNG to JPEG', async () => {
      const output = join(OUTPUT_DIR, 'jimp-converted.jpg');
      await adapter.convert(TEST_IMAGE_PATH, output, { quality: 80 });

      // Verify file exists by reading dimensions
      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!jimpAvailable)('getMetadata', () => {
    it('should get metadata from file', async () => {
      const metadata = await adapter.getMetadata(TEST_IMAGE_PATH);

      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      expect(metadata.channels).toBe(4); // Jimp uses RGBA
    });
  });

  describe.skipIf(!jimpAvailable)('hash', () => {
    it('should compute perceptual hash', async () => {
      const hash = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16);
    });

    it('should compute MD5 hash', async () => {
      const hash = await adapter.hash(TEST_IMAGE_PATH, 'md5');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32);
    });

    it('should produce same perceptual hash for same image', async () => {
      const hash1 = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');
      const hash2 = await adapter.hash(TEST_IMAGE_PATH, 'perceptual');

      expect(hash1).toBe(hash2);
    });
  });

  describe.skipIf(!jimpAvailable)('resize', () => {
    it('should resize image', async () => {
      const output = join(OUTPUT_DIR, 'jimp-resize.png');
      await adapter.resize(TEST_IMAGE_PATH, output, {
        width: 50,
        height: 50,
        fit: 'cover',
      });

      const dims = await adapter.getDimensions(output);
      expect(dims.width).toBe(50);
      expect(dims.height).toBe(50);
    });
  });
});

// ============================================================================
// imgproxy Adapter Tests
// ============================================================================

describe('ImgproxyAdapter', () => {
  const adapter = new ImgproxyAdapter({
    type: 'imgproxy',
    baseUrl: 'https://imgproxy.example.com',
    key: 'deadbeef',
    salt: 'cafebabe',
  });

  describe('URL building', () => {
    it('should require URL input, not buffer', async () => {
      const buffer = Buffer.from('test');
      await expect(adapter.getDimensions(buffer)).rejects.toThrow(
        ProcessingError,
      );
    });

    it('should require HTTP/HTTPS URLs', async () => {
      await expect(
        adapter.getDimensions('/local/path/image.jpg'),
      ).rejects.toThrow(ProcessingError);
    });
  });

  describe('getDimensions', () => {
    it('should fetch dimensions from imgproxy', async () => {
      // Mock fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 800, height: 600 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const dims = await adapter.getDimensions('https://example.com/image.jpg');

      expect(dims.width).toBe(800);
      expect(dims.height).toBe(600);
      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('should throw RemoteServiceError on HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        adapter.getDimensions('https://example.com/image.jpg'),
      ).rejects.toThrow(RemoteServiceError);

      vi.unstubAllGlobals();
    });
  });

  describe('thumbnail', () => {
    it('should fetch and save thumbnail', async () => {
      const mockBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const output = join(OUTPUT_DIR, 'imgproxy-thumb.png');

      await adapter.thumbnail('https://example.com/image.jpg', output, {
        maxWidth: 300,
        maxHeight: 300,
      });

      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe('getMetadata', () => {
    it('should fetch metadata from imgproxy info endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          width: 1920,
          height: 1080,
          type: 'jpeg',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const metadata = await adapter.getMetadata(
        'https://example.com/image.jpg',
      );

      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.format).toBe('jpeg');

      vi.unstubAllGlobals();
    });
  });

  describe('hash', () => {
    it('should throw OperationNotSupportedError', async () => {
      await expect(
        adapter.hash('https://example.com/image.jpg', 'perceptual'),
      ).rejects.toThrow(OperationNotSupportedError);
    });
  });

  describe('resize', () => {
    it('should fetch and save resized image', async () => {
      const mockBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockBuffer.buffer,
      });
      vi.stubGlobal('fetch', mockFetch);

      const output = join(OUTPUT_DIR, 'imgproxy-resize.png');

      await adapter.resize('https://example.com/image.jpg', output, {
        width: 800,
        height: 600,
        fit: 'cover',
      });

      expect(mockFetch).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });

  describe('URL signing', () => {
    it('should generate signed URLs', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 100, height: 100 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await adapter.getDimensions('https://example.com/image.jpg');

      // Verify the URL contains a signature (not 'unsafe')
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('imgproxy.example.com');
      expect(calledUrl).not.toContain('/unsafe/');

      vi.unstubAllGlobals();
    });

    it('should use unsafe URLs when no key/salt provided', async () => {
      const unsignedAdapter = new ImgproxyAdapter({
        type: 'imgproxy',
        baseUrl: 'https://imgproxy.example.com',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ width: 100, height: 100 }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await unsignedAdapter.getDimensions('https://example.com/image.jpg');

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('/unsafe/');

      vi.unstubAllGlobals();
    });
  });
});

// ============================================================================
// Adapter Interface Compliance Tests
// ============================================================================

describe('Adapter Interface Compliance', () => {
  const adapters: Array<{
    name: string;
    create: () => Promise<ImageProcessorInterface | null>;
  }> = [
    {
      name: 'SharpAdapter',
      create: async () => {
        try {
          await import('sharp');
          return new SharpAdapter();
        } catch {
          return null;
        }
      },
    },
    {
      name: 'JimpAdapter',
      create: async () => {
        try {
          await import('jimp');
          return new JimpAdapter({ type: 'jimp' });
        } catch {
          return null;
        }
      },
    },
  ];

  for (const { name, create } of adapters) {
    describe(name, () => {
      let adapter: ImageProcessorInterface | null;

      beforeAll(async () => {
        adapter = await create();
      });

      it('should implement getDimensions', async () => {
        if (!adapter) return;
        expect(typeof adapter.getDimensions).toBe('function');
      });

      it('should implement thumbnail', async () => {
        if (!adapter) return;
        expect(typeof adapter.thumbnail).toBe('function');
      });

      it('should implement convert', async () => {
        if (!adapter) return;
        expect(typeof adapter.convert).toBe('function');
      });

      it('should implement getMetadata', async () => {
        if (!adapter) return;
        expect(typeof adapter.getMetadata).toBe('function');
      });

      it('should implement hash', async () => {
        if (!adapter) return;
        expect(typeof adapter.hash).toBe('function');
      });

      it('should implement resize', async () => {
        if (!adapter) return;
        expect(typeof adapter.resize).toBe('function');
      });
    });
  }
});
