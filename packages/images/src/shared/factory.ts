/**
 * Factory function for creating image processor instances
 */

import { InvalidAdapterError } from './errors.js';
import type {
  GetImageProcessorOptions,
  ImageProcessorInterface,
  ImgproxyOptions,
  JimpOptions,
  SharpOptions,
} from './types.js';

/**
 * Type guards for processor options
 */

/**
 * Checks if the options are for Sharp adapter
 */
function isSharpOptions(
  options: GetImageProcessorOptions,
): options is SharpOptions {
  return !options.type || options.type === 'sharp';
}

/**
 * Checks if the options are for Jimp adapter
 */
function isJimpOptions(
  options: GetImageProcessorOptions,
): options is JimpOptions {
  return options.type === 'jimp';
}

/**
 * Checks if the options are for imgproxy adapter
 */
function isImgproxyOptions(
  options: GetImageProcessorOptions,
): options is ImgproxyOptions {
  return options.type === 'imgproxy';
}

/**
 * Load environment variables for configuration
 * Pattern: HAVE_IMAGES_*
 */
function loadEnvConfig(
  options: GetImageProcessorOptions,
): GetImageProcessorOptions {
  // Only available in Node.js environments
  if (typeof process === 'undefined' || !process.env) {
    return options;
  }

  const env = process.env;

  // Build defaults from environment
  const envDefaults: Record<string, unknown> = {};

  // HAVE_IMAGES_TYPE or HAVE_IMAGES_ADAPTER
  const typeEnv = env.HAVE_IMAGES_TYPE || env.HAVE_IMAGES_ADAPTER;
  if (typeEnv && !options.type) {
    envDefaults.type = typeEnv;
  }

  // imgproxy-specific options
  if (env.HAVE_IMAGES_BASE_URL) {
    envDefaults.baseUrl = env.HAVE_IMAGES_BASE_URL;
  }
  if (env.HAVE_IMAGES_KEY) {
    envDefaults.key = env.HAVE_IMAGES_KEY;
  }
  if (env.HAVE_IMAGES_SALT) {
    envDefaults.salt = env.HAVE_IMAGES_SALT;
  }

  // Merge environment defaults with user options (user options take precedence)
  return { ...envDefaults, ...options } as GetImageProcessorOptions;
}

/**
 * Creates an image processor instance based on the provided options.
 *
 * Supports environment variable configuration using the pattern:
 * - HAVE_IMAGES_TYPE → adapter type ('sharp', 'jimp', 'imgproxy')
 * - HAVE_IMAGES_BASE_URL → imgproxy base URL
 * - HAVE_IMAGES_KEY → imgproxy signing key (hex)
 * - HAVE_IMAGES_SALT → imgproxy signing salt (hex)
 *
 * User-provided options always take precedence over environment variables.
 *
 * @param options - Configuration options for the image processor
 * @returns Promise resolving to an image processor instance
 * @throws {InvalidAdapterError} When the adapter type is unsupported
 *
 * @example
 * ```typescript
 * // Create Sharp processor (default)
 * const processor = await getImageProcessor();
 *
 * // Create Jimp processor
 * const jimpProcessor = await getImageProcessor({ type: 'jimp' });
 *
 * // Create imgproxy processor
 * const imgproxyProcessor = await getImageProcessor({
 *   type: 'imgproxy',
 *   baseUrl: 'https://imgproxy.example.com',
 *   key: 'abcd1234...',
 *   salt: 'efgh5678...'
 * });
 *
 * // Use environment variables (HAVE_IMAGES_TYPE=sharp)
 * const autoProcessor = await getImageProcessor({});
 * ```
 */
export async function getImageProcessor(
  options: GetImageProcessorOptions = {},
): Promise<ImageProcessorInterface> {
  // Load environment variables
  options = loadEnvConfig(options);

  if (isSharpOptions(options)) {
    const { SharpAdapter } = await import('../adapters/sharp.js');
    return new SharpAdapter(options);
  }

  if (isJimpOptions(options)) {
    const { JimpAdapter } = await import('../adapters/jimp.js');
    return new JimpAdapter(options);
  }

  if (isImgproxyOptions(options)) {
    const { ImgproxyAdapter } = await import('../adapters/imgproxy.js');
    return new ImgproxyAdapter(options);
  }

  throw new InvalidAdapterError(
    (options as { type?: string }).type || 'unknown',
  );
}

/**
 * Get a list of available adapter types
 */
export function getAvailableAdapters(): string[] {
  return ['sharp', 'jimp', 'imgproxy'];
}
