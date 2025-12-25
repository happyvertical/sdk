# @happyvertical/images: Image Processing Package

## Purpose and Responsibilities

The `@happyvertical/images` package provides a unified interface for image processing with adapter pattern support. It enables scaling from static sites to enterprise deployments without changing downstream code.

- **Adapter Pattern**: Unified interface across different processing backends
- **Auto-Detection**: Automatically selects best available processor (Sharp > Jimp)
- **Environment Flexibility**: Works in Node.js, serverless, and edge environments
- **Remote Processing**: Support for self-hosted imgproxy servers

## Package Architecture

### Core Components

```
@happyvertical/images/
├── src/
│   ├── index.ts                    # Main exports + convenience functions
│   ├── shared/
│   │   ├── types.ts               # Core interfaces and types
│   │   ├── errors.ts              # Error class hierarchy
│   │   └── factory.ts             # getImageProcessor() factory
│   └── adapters/
│       ├── sharp.ts               # Sharp adapter (fast native)
│       ├── jimp.ts                # Jimp adapter (pure JS fallback)
│       └── imgproxy.ts            # imgproxy adapter (remote)
```

### Adapter System

The package uses an **adapter pattern** allowing different backends:

| Adapter | Use Case | Dependencies | Performance |
|---------|----------|--------------|-------------|
| **Sharp** | Default, production | Native binary | Fast |
| **Jimp** | Serverless, edge | Pure JavaScript | Moderate |
| **imgproxy** | Enterprise scale | HTTP to imgproxy server | Depends on server |

## Key APIs

### Convenience Functions (Recommended)

```typescript
import {
  getDimensions,
  generateThumbnail,
  convertFormat,
  getImageMetadata,
  getImageHash,
  resizeImage
} from '@happyvertical/images';

// Auto-detects Sharp or falls back to Jimp
const dims = await getDimensions('/path/to/image.jpg');
console.log(`${dims.width}x${dims.height}`);

// Generate thumbnail
await generateThumbnail('/path/to/image.jpg', '/path/to/thumb.jpg', {
  maxWidth: 300,
  maxHeight: 300,
  quality: 85
});

// Convert format
await convertFormat('/path/to/image.png', '/path/to/image.webp', {
  quality: 80
});

// Get metadata
const metadata = await getImageMetadata('/path/to/photo.jpg');
console.log(`Format: ${metadata.format}, Has alpha: ${metadata.hasAlpha}`);

// Compute hash for deduplication
const hash = await getImageHash('/path/to/image.jpg', 'perceptual');
console.log(`Perceptual hash: ${hash}`);

// Resize with full control
await resizeImage('/path/to/image.jpg', '/path/to/resized.jpg', {
  width: 800,
  height: 600,
  fit: 'cover' // 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
});
```

### Factory Pattern

```typescript
import { getImageProcessor } from '@happyvertical/images';

// Create Sharp processor (default)
const processor = await getImageProcessor();

// Create Jimp processor
const jimpProcessor = await getImageProcessor({ type: 'jimp' });

// Create imgproxy processor
const imgproxyProcessor = await getImageProcessor({
  type: 'imgproxy',
  baseUrl: 'https://imgproxy.example.com',
  key: 'hex-encoded-key',
  salt: 'hex-encoded-salt'
});

// Use processor
const dims = await processor.getDimensions('/path/to/image.jpg');
await processor.thumbnail(input, output, { maxWidth: 300 });
```

### Direct Adapter Usage

```typescript
import { SharpAdapter, JimpAdapter, ImgproxyAdapter } from '@happyvertical/images';

// Use Sharp directly
const sharp = new SharpAdapter();
const metadata = await sharp.getMetadata('/path/to/image.jpg');

// Use Jimp for serverless
const jimp = new JimpAdapter({ type: 'jimp' });
await jimp.thumbnail('/path/to/image.jpg', '/tmp/thumb.jpg', { maxWidth: 200 });

// Use imgproxy for scale
const imgproxy = new ImgproxyAdapter({
  type: 'imgproxy',
  baseUrl: 'https://imgproxy.example.com',
  key: 'signing-key',
  salt: 'signing-salt'
});
await imgproxy.thumbnail(
  'https://cdn.example.com/image.jpg',
  '/tmp/thumb.jpg',
  { maxWidth: 300 }
);
```

## Environment Variables

Configure adapters via environment variables (pattern: `HAVE_IMAGES_*`):

| Variable | Description | Example |
|----------|-------------|---------|
| `HAVE_IMAGES_TYPE` | Adapter type | `sharp`, `jimp`, `imgproxy` |
| `HAVE_IMAGES_BASE_URL` | imgproxy base URL | `https://imgproxy.example.com` |
| `HAVE_IMAGES_KEY` | imgproxy signing key (hex) | `abcd1234...` |
| `HAVE_IMAGES_SALT` | imgproxy signing salt (hex) | `efgh5678...` |

User-provided options always take precedence over environment variables.

## Core Interface

All adapters implement `ImageProcessorInterface`:

```typescript
interface ImageProcessorInterface {
  getDimensions(input: ImageInput): Promise<ImageDimensions>;
  thumbnail(input: ImageInput, output: string, options?: ThumbnailOptions): Promise<void>;
  convert(input: ImageInput, output: string, options?: ConvertOptions): Promise<void>;
  getMetadata(input: ImageInput): Promise<ImageMetadata>;
  hash(input: ImageInput, algorithm?: HashAlgorithm): Promise<string>;
  resize(input: ImageInput, output: string, options: ResizeOptions): Promise<void>;
}
```

### Type Definitions

```typescript
type ImageInput = string | Buffer;  // Path or binary data

interface ImageDimensions {
  width: number;
  height: number;
}

interface ThumbnailOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;      // 1-100
  format?: ImageFormat;
  fit?: FitMode;
}

interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: FitMode;
  quality?: number;
  format?: ImageFormat;
}

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  space?: string;
  channels?: number;
  hasAlpha?: boolean;
  orientation?: number;
  exif?: Record<string, unknown>;
  iptc?: Record<string, unknown>;
  xmp?: Record<string, unknown>;
}

type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';
type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
type HashAlgorithm = 'perceptual' | 'md5' | 'sha256';
```

## Error Handling

```typescript
import {
  ImageError,
  ImageNotFoundError,
  UnsupportedFormatError,
  OperationNotSupportedError,
  ProcessingError,
  InvalidAdapterError,
  RemoteServiceError
} from '@happyvertical/images';

try {
  await generateThumbnail('/path/to/image.jpg', '/tmp/thumb.jpg');
} catch (error) {
  if (error instanceof ImageNotFoundError) {
    console.error('Image not found:', error.path);
  } else if (error instanceof UnsupportedFormatError) {
    console.error('Format not supported:', error.format);
  } else if (error instanceof ProcessingError) {
    console.error('Processing failed:', error.message);
  } else if (error instanceof RemoteServiceError) {
    console.error('imgproxy error:', error.statusCode);
  }
}
```

## Adapter Comparison

### Sharp Adapter

**Best for**: Production environments with native compilation support

```typescript
const sharp = await getImageProcessor({ type: 'sharp' });
```

**Features**:
- Fastest processing speed
- Full EXIF/IPTC/XMP metadata extraction
- AVIF support
- Perceptual hashing

**Requirements**:
- Native binary compilation
- May not work in all serverless environments

### Jimp Adapter

**Best for**: Serverless, edge functions, environments without native support

```typescript
const jimp = await getImageProcessor({ type: 'jimp' });
```

**Features**:
- Pure JavaScript (no native dependencies)
- Works everywhere Node.js runs
- Perceptual hashing

**Limitations**:
- Slower than Sharp
- Limited metadata extraction
- No AVIF support

### imgproxy Adapter

**Best for**: Enterprise scale, CDN integration, microservices

```typescript
const imgproxy = await getImageProcessor({
  type: 'imgproxy',
  baseUrl: 'https://imgproxy.example.com',
  key: 'hex-key',
  salt: 'hex-salt'
});
```

**Features**:
- Offload processing to dedicated server
- Signed URLs for security
- CDN-friendly output

**Limitations**:
- Requires imgproxy server
- Input must be accessible via URL (not local paths)
- Hash computation not supported directly

## Auto-Detection

Convenience functions auto-detect the best available adapter:

1. Try to load Sharp
2. If Sharp unavailable, fall back to Jimp
3. Cache processor for subsequent calls

Override with explicit adapter options:

```typescript
// Force Jimp even if Sharp is available
const dims = await getDimensions('/path/to/image.jpg', { type: 'jimp' });
```

## Development Guidelines

### Installation

```bash
pnpm add @happyvertical/images

# Optional peer dependencies
pnpm add sharp    # For Sharp adapter
pnpm add jimp     # For Jimp adapter
```

### Testing

```bash
npm test           # Run tests
npm run test:watch # Watch mode
```

### Building

```bash
npm run build      # Build package
npm run build:watch # Watch mode
npm run clean      # Clean build artifacts
```

### Best Practices

1. **Use convenience functions** for simple operations
2. **Use factory pattern** when you need explicit adapter control
3. **Set quality** for lossy formats (JPEG, WebP) to balance size/quality
4. **Use perceptual hash** for finding similar images
5. **Use SHA-256** for exact duplicate detection
6. **Handle errors** appropriately for each adapter's limitations

## Dependencies

### Peer Dependencies (Optional)

- **sharp**: Fast native image processing (default adapter)
- **jimp**: Pure JavaScript image processing (fallback adapter)

### No Runtime Dependencies

The package has no required runtime dependencies - adapters are loaded dynamically based on what's installed.

## Common Patterns

### Thumbnail Generation Pipeline

```typescript
import { generateThumbnail, getImageMetadata } from '@happyvertical/images';

async function processImage(input: string, outputDir: string) {
  const metadata = await getImageMetadata(input);

  // Skip if already small
  if (metadata.width <= 300 && metadata.height <= 300) {
    return;
  }

  // Generate multiple sizes
  await Promise.all([
    generateThumbnail(input, `${outputDir}/small.jpg`, { maxWidth: 150 }),
    generateThumbnail(input, `${outputDir}/medium.jpg`, { maxWidth: 300 }),
    generateThumbnail(input, `${outputDir}/large.jpg`, { maxWidth: 600 }),
  ]);
}
```

### Image Deduplication

```typescript
import { getImageHash } from '@happyvertical/images';

const hashes = new Map<string, string>();

async function checkDuplicate(imagePath: string): Promise<string | null> {
  const hash = await getImageHash(imagePath, 'perceptual');

  if (hashes.has(hash)) {
    return hashes.get(hash)!; // Return original path
  }

  hashes.set(hash, imagePath);
  return null; // Not a duplicate
}
```

### Format Conversion for Web

```typescript
import { convertFormat, getImageMetadata } from '@happyvertical/images';

async function optimizeForWeb(input: string, output: string) {
  const metadata = await getImageMetadata(input);

  // Convert to WebP for modern browsers
  await convertFormat(input, output.replace(/\.\w+$/, '.webp'), {
    format: 'webp',
    quality: metadata.hasAlpha ? 90 : 80
  });
}
```

## Quick Reference

### Files

| Path | Purpose |
|------|---------|
| `src/index.ts` | Main exports + convenience functions |
| `src/shared/types.ts` | TypeScript interfaces |
| `src/shared/errors.ts` | Error classes |
| `src/shared/factory.ts` | getImageProcessor() factory |
| `src/adapters/sharp.ts` | Sharp adapter |
| `src/adapters/jimp.ts` | Jimp adapter |
| `src/adapters/imgproxy.ts` | imgproxy adapter |

### Commands

```bash
npm test           # Run tests
npm run build      # Build
npm run clean      # Clean
```

### Key Types

```typescript
type ImageInput = string | Buffer;
type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'tiff';
type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
type HashAlgorithm = 'perceptual' | 'md5' | 'sha256';
```
