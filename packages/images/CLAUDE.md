# @happyvertical/images

Image processing with adapter pattern. Factory: `getImageProcessor(options): Promise<ImageProcessorInterface>`.

## Adapters

sharp (native, default), jimp (pure JS fallback), imgproxy (remote processing). All in `src/adapters/`.

## Key patterns

- Auto-detection: tries sharp first, falls back to jimp if unavailable
- Convenience functions: `getDimensions()`, `generateThumbnail()`, `convertFormat()`, `resizeImage()`, `getImageHash()`, `getImageMetadata()`
- `ImageInput` accepts file path string or Buffer
- `generateHeadlineCard()` renders text overlay cards via satori + resvg
- imgproxy adapter generates signed URLs for remote server processing
- Env vars: `HAVE_IMAGES_TYPE`, `HAVE_IMAGES_BASE_URL`, `HAVE_IMAGES_KEY`, `HAVE_IMAGES_SALT`

## Gotchas

- `sharp` and `jimp` are optional peer dependencies — install at least one
- imgproxy adapter requires a running imgproxy server and signing key/salt
- Cached processor means auto-detection runs once; call `resetProcessor()` in tests
- Hash supports `perceptual`, `md5`, `sha256` — perceptual is default
- Fit modes: `cover` (crop), `contain`, `fill`, `inside`, `outside`
