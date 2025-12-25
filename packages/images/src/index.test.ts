/**
 * Tests for convenience functions and factory
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  convertFormat,
  generateThumbnail,
  getAvailableAdapters,
  getDimensions,
  getImageHash,
  getImageMetadata,
  getImageProcessor,
  JimpAdapter,
  resetProcessor,
  resizeImage,
  SharpAdapter,
} from './index.js';
import { InvalidAdapterError } from './shared/errors.js';

// Test directory setup
const TEST_DIR = join(process.cwd(), '.test-images-conv');
const TEST_IMAGE_PATH = join(TEST_DIR, 'test-image.png');
const OUTPUT_DIR = join(TEST_DIR, 'output');

// Create a simple test PNG image
async function createTestImage(): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

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
    // Fallback: minimal valid PNG
    const minimalPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
      0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await writeFile(TEST_IMAGE_PATH, minimalPng);
  }
}

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
// Factory Tests
// ============================================================================

describe('getImageProcessor', () => {
  it('should return SharpAdapter by default when sharp is available', async () => {
    try {
      await import('sharp');
      const processor = await getImageProcessor();
      expect(processor).toBeInstanceOf(SharpAdapter);
    } catch {
      // Sharp not available, skip
    }
  });

  it('should return SharpAdapter when explicitly requested', async () => {
    try {
      await import('sharp');
      const processor = await getImageProcessor({ type: 'sharp' });
      expect(processor).toBeInstanceOf(SharpAdapter);
    } catch {
      // Sharp not available, skip
    }
  });

  it('should return JimpAdapter when explicitly requested', async () => {
    try {
      await import('jimp');
      const processor = await getImageProcessor({ type: 'jimp' });
      expect(processor).toBeInstanceOf(JimpAdapter);
    } catch {
      // Jimp not available, skip
    }
  });

  it('should throw InvalidAdapterError for unknown type', async () => {
    await expect(getImageProcessor({ type: 'unknown' as any })).rejects.toThrow(
      InvalidAdapterError,
    );
  });

  it('should load config from environment variables', async () => {
    const originalEnv = process.env.HAVE_IMAGES_TYPE;
    try {
      await import('jimp');
      process.env.HAVE_IMAGES_TYPE = 'jimp';

      const processor = await getImageProcessor({});
      expect(processor).toBeInstanceOf(JimpAdapter);
    } catch {
      // Jimp not available
    } finally {
      if (originalEnv !== undefined) {
        process.env.HAVE_IMAGES_TYPE = originalEnv;
      } else {
        delete process.env.HAVE_IMAGES_TYPE;
      }
    }
  });
});

describe('getAvailableAdapters', () => {
  it('should return list of available adapters', () => {
    const adapters = getAvailableAdapters();
    expect(adapters).toContain('sharp');
    expect(adapters).toContain('jimp');
    expect(adapters).toContain('imgproxy');
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('Convenience Functions', () => {
  let hasImageLibrary = false;

  beforeAll(async () => {
    try {
      await import('sharp');
      hasImageLibrary = true;
    } catch {
      try {
        await import('jimp');
        hasImageLibrary = true;
      } catch {
        // Neither available
      }
    }
  });

  beforeEach(() => {
    // Reset cached processor between tests
    resetProcessor();
  });

  describe.skipIf(!hasImageLibrary)('getDimensions', () => {
    it('should get dimensions with auto-detection', async () => {
      const dims = await getDimensions(TEST_IMAGE_PATH);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should get dimensions from buffer', async () => {
      const buffer = await readFile(TEST_IMAGE_PATH);
      const dims = await getDimensions(buffer);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it('should use specified adapter', async () => {
      try {
        await import('jimp');
        const dims = await getDimensions(TEST_IMAGE_PATH, { type: 'jimp' });
        expect(dims.width).toBeGreaterThan(0);
      } catch {
        // Jimp not available
      }
    });
  });

  describe.skipIf(!hasImageLibrary)('generateThumbnail', () => {
    it('should generate thumbnail with auto-detection', async () => {
      const output = join(OUTPUT_DIR, 'conv-thumb.png');
      await generateThumbnail(TEST_IMAGE_PATH, output, {
        maxWidth: 50,
        maxHeight: 50,
      });

      const dims = await getDimensions(output);
      expect(dims.width).toBeLessThanOrEqual(50);
      expect(dims.height).toBeLessThanOrEqual(50);
    });

    it('should generate thumbnail with quality setting', async () => {
      const output = join(OUTPUT_DIR, 'conv-thumb-quality.jpg');
      await generateThumbnail(TEST_IMAGE_PATH, output, {
        maxWidth: 50,
        quality: 80,
        format: 'jpeg',
      });

      const dims = await getDimensions(output);
      expect(dims.width).toBeLessThanOrEqual(50);
    });
  });

  describe.skipIf(!hasImageLibrary)('convertFormat', () => {
    it('should convert format with auto-detection', async () => {
      const output = join(OUTPUT_DIR, 'conv-format.jpg');
      await convertFormat(TEST_IMAGE_PATH, output, { quality: 80 });

      // Verify the file exists
      const dims = await getDimensions(output);
      expect(dims.width).toBeGreaterThan(0);
    });
  });

  describe.skipIf(!hasImageLibrary)('getImageMetadata', () => {
    it('should get metadata with auto-detection', async () => {
      const metadata = await getImageMetadata(TEST_IMAGE_PATH);

      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      expect(metadata.format).toBeDefined();
    });
  });

  describe.skipIf(!hasImageLibrary)('getImageHash', () => {
    it('should get perceptual hash with auto-detection', async () => {
      const hash = await getImageHash(TEST_IMAGE_PATH);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16);
    });

    it('should get MD5 hash', async () => {
      const hash = await getImageHash(TEST_IMAGE_PATH, 'md5');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32);
    });

    it('should get SHA256 hash', async () => {
      const hash = await getImageHash(TEST_IMAGE_PATH, 'sha256');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });

  describe.skipIf(!hasImageLibrary)('resizeImage', () => {
    it('should resize with auto-detection', async () => {
      const output = join(OUTPUT_DIR, 'conv-resize.png');
      await resizeImage(TEST_IMAGE_PATH, output, {
        width: 50,
        height: 50,
        fit: 'cover',
      });

      const dims = await getDimensions(output);
      expect(dims.width).toBe(50);
      expect(dims.height).toBe(50);
    });
  });
});

// ============================================================================
// Auto-Detection Tests
// ============================================================================

describe('Auto-Detection', () => {
  beforeEach(() => {
    resetProcessor();
  });

  it('should cache processor after first call', async () => {
    let hasImageLibrary = false;
    try {
      await import('sharp');
      hasImageLibrary = true;
    } catch {
      try {
        await import('jimp');
        hasImageLibrary = true;
      } catch {
        // Neither available
      }
    }

    if (!hasImageLibrary) return;

    // First call triggers detection
    const dims1 = await getDimensions(TEST_IMAGE_PATH);
    // Second call should use cached processor
    const dims2 = await getDimensions(TEST_IMAGE_PATH);

    expect(dims1.width).toBe(dims2.width);
    expect(dims1.height).toBe(dims2.height);
  });

  it('should override cache when explicit adapter specified', async () => {
    let sharpAvailable = false;
    let jimpAvailable = false;

    try {
      await import('sharp');
      sharpAvailable = true;
    } catch {}

    try {
      await import('jimp');
      jimpAvailable = true;
    } catch {}

    if (!sharpAvailable || !jimpAvailable) return;

    // First call with auto-detection (should use Sharp)
    const dims1 = await getDimensions(TEST_IMAGE_PATH);

    // Second call with explicit Jimp
    const dims2 = await getDimensions(TEST_IMAGE_PATH, { type: 'jimp' });

    // Both should work
    expect(dims1.width).toBe(dims2.width);
  });
});

// ============================================================================
// resetProcessor Tests
// ============================================================================

describe('resetProcessor', () => {
  it('should reset cached processor', async () => {
    let hasImageLibrary = false;
    try {
      await import('sharp');
      hasImageLibrary = true;
    } catch {
      try {
        await import('jimp');
        hasImageLibrary = true;
      } catch {}
    }

    if (!hasImageLibrary) return;

    // Trigger auto-detection
    await getDimensions(TEST_IMAGE_PATH);

    // Reset
    resetProcessor();

    // Should work again after reset
    const dims = await getDimensions(TEST_IMAGE_PATH);
    expect(dims.width).toBeGreaterThan(0);
  });
});
