/**
 * Geo package entry point
 * Provides standardized geographical information interface
 */

import { loadEnvConfig } from '@happyvertical/utils';
import type {
  GeoAdapter,
  GeoAdapterOptions,
  GoogleMapsOptions,
  OpenStreetMapOptions,
} from './shared/types';

// Export all types
export * from './shared/types';
export * from './shared/utils';

// Export static map generation
export {
  fetchStaticMap,
  type GoogleMapType,
  getOGMapUrl,
  getStaticMapUrl,
  type MapboxStyle,
  type StaticMapMarker,
  type StaticMapOptions,
  type StaticMapProvider,
  type StaticMapResult,
} from './static-maps';

/**
 * Type guard for Google Maps options
 */
function isGoogleMapsOptions(
  options: GeoAdapterOptions,
): options is GoogleMapsOptions {
  return options.provider === 'google';
}

/**
 * Type guard for OpenStreetMap options
 */
function isOpenStreetMapOptions(
  options: GeoAdapterOptions,
): options is OpenStreetMapOptions {
  return options.provider === 'openstreetmap';
}

/**
 * Factory function to create a geo adapter instance
 *
 * Supports configuration via environment variables using the pattern:
 * - HAVE_GEO_PROVIDER → provider ('google' | 'openstreetmap')
 * - GOOGLE_MAPS_API_KEY → apiKey (for Google Maps provider)
 *
 * User-provided options always take precedence over environment variables.
 *
 * @param options - Configuration options for the geo provider (optional)
 * @returns Promise resolving to a geo adapter that implements GeoAdapter
 *
 * @example
 * ```typescript
 * // Create Google Maps adapter with explicit options
 * const googleGeo = await getGeoAdapter({
 *   provider: 'google',
 *   apiKey: process.env.GOOGLE_MAPS_API_KEY!
 * });
 *
 * // Create adapter using environment variables
 * // HAVE_GEO_PROVIDER=google
 * // GOOGLE_MAPS_API_KEY=your-api-key
 * const geoFromEnv = await getGeoAdapter();
 *
 * // Create OpenStreetMap adapter
 * const osmGeo = await getGeoAdapter({
 *   provider: 'openstreetmap'
 * });
 *
 * // Use the adapter
 * const locations = await googleGeo.lookup('Eiffel Tower');
 * const coords = await osmGeo.reverseGeocode(48.8584, 2.2945);
 * ```
 */
export async function getGeoAdapter(
  options: Partial<GeoAdapterOptions> = {},
): Promise<GeoAdapter> {
  // Load configuration from environment variables
  // Cast to any to handle union type with loadEnvConfig
  const config = loadEnvConfig(options as any, {
    packageName: 'geo',
    schema: {
      provider: 'string',
      timeout: 'number',
      maxResults: 'number',
      rateLimitDelay: 'number',
      userAgent: 'string',
    },
  }) as Partial<GeoAdapterOptions>;

  // Handle Google Maps API key from environment (not using HAVE_GEO_ prefix)
  if (config.provider === 'google' && !config.apiKey) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      config.apiKey = apiKey;
    }
  }

  // Validate that we have a provider
  if (!config.provider) {
    throw new Error(
      'Provider is required. Set via options.provider or HAVE_GEO_PROVIDER environment variable.',
    );
  }

  // Cast to full options type for provider-specific handling
  const fullOptions = config as GeoAdapterOptions;

  if (isGoogleMapsOptions(fullOptions)) {
    const { GoogleMapsProvider } = await import('./providers/google.js');
    return new GoogleMapsProvider(fullOptions);
  }

  if (isOpenStreetMapOptions(fullOptions)) {
    const { OpenStreetMapProvider } = await import(
      './providers/openstreetmap.js'
    );
    return new OpenStreetMapProvider(fullOptions);
  }

  // This should never happen due to TypeScript's discriminated union
  throw new Error(`Unsupported provider: ${(fullOptions as any).provider}`);
}

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
